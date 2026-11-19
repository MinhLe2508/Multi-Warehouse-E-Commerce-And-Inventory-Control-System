import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Nạp biến môi trường từ .env ở thư mục gốc dự án (giống sync-kb.ts)
const envCandidates = [
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(__dirname, '../../../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { Prisma, UserRole } from '@prisma/client';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatbotService, type SendMessageResult } from '../chatbot.service';
import { KnowledgeBaseService } from '../rag/knowledge-base.service';
import {
  EvalActor,
  EvalFixtures,
  buildEvalCases,
} from '../eval/chatbot-eval.cases';
import {
  CaseResult,
  ObservedResponse,
  gradeCase,
  summarize,
} from '../eval/chatbot-eval.grader';
import {
  renderJsonReport,
  renderMarkdownReport,
  type ReportMeta,
  verdict,
} from '../eval/chatbot-eval.report';

/**
 * ChatbotEval (STT 34) — chạy bộ câu hỏi mẫu qua ChatbotService thật
 * (RAG pgvector + function calling + CSDL thật), chấm điểm và xuất báo cáo.
 *
 * Cách chạy (cần PostgreSQL đang chạy và đã seed):
 *   npm run eval:chatbot
 *   npm run eval:chatbot -- --delay=20000   # giãn cách khi Voyage AI bị giới hạn RPM
 *   npm run eval:chatbot -- --strict        # exit code 1 nếu không đạt ngưỡng (dùng cho CI)
 *
 * Đơn hàng, phiên chat và tài khoản kiểm thử tạm được dọn sau khi chạy.
 */

interface CliOptions {
  delayMs: number;
  strict: boolean;
  outDir: string;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return {
    delayMs: Number(get('delay') ?? process.env.EVAL_DELAY_MS ?? 0) || 0,
    strict: argv.includes('--strict'),
    outDir: path.resolve(
      process.cwd(),
      get('out') ?? path.join('reports', 'chatbot-eval'),
    ),
  };
}

function getGitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.env.GIT_COMMIT?.trim() || 'unknown';
  }
}

const providerNames = {
  CLAUDE: 'Anthropic Claude',
  GEMINI: 'Google Gemini',
  LOCAL: 'RAG và công cụ nội bộ',
} satisfies Record<SendMessageResult['generationSource'], string>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bootstrap() {
  const opts = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  console.log('=== CHATBOT EVAL (STT 34) ===');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const chatbot = app.get(ChatbotService);
  const kb = app.get(KnowledgeBaseService);

  const sessionTokens: string[] = [];
  let fixtureOrderId: string | null = null;
  let fixtureCustomerId: string | null = null;
  let exitCode = 0;

  try {
    // ---- 1. Chuẩn bị dữ liệu tham chiếu -----------------------------------
    const customers = await prisma.user.findMany({
      where: { role: UserRole.CUSTOMER, isActive: true },
      orderBy: { username: 'asc' },
      take: 50,
      select: { id: true, username: true, role: true },
    });
    const owner =
      customers.find((u) => u.username === 'customer') ?? customers[0];
    if (!owner) {
      throw new Error(
        'Cần một tài khoản CUSTOMER đang hoạt động. Hãy chạy seed trước (npx prisma db seed).',
      );
    }
    let other = customers.find((u) => u.id !== owner.id);
    if (!other) {
      const username = `eval-customer-${randomBytes(8).toString('hex')}`;
      other = await prisma.user.create({
        data: {
          username,
          email: `${username}@demo.example.test`,
          fullName: 'Khách hàng kiểm thử RAG',
          passwordHash: 'disabled',
          role: UserRole.CUSTOMER,
          isActive: false,
        },
        select: { id: true, username: true, role: true },
      });
      fixtureCustomerId = other.id;
    }

    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        inventory: {
          some: { availableStock: { gt: 0 }, warehouse: { isActive: true } },
        },
      },
      orderBy: { sku: 'asc' },
      select: { sku: true, name: true },
    });
    if (!product) {
      throw new Error(
        'Không có sản phẩm nào còn hàng để kiểm thử checkInventory.',
      );
    }

    const kbStats = await kb.getStats();
    if (kbStats.totalChunks === 0) {
      throw new Error(
        'kb_documents đang trống. Hãy seed và chạy npm run sync:kb.',
      );
    }

    // Đơn hàng fixture thuộc "owner" — tổng tiền đặc trưng để dò rò rỉ dữ liệu
    const orderCode = `ORD-EVAL${randomBytes(4).toString('hex').toUpperCase()}`;
    const total = new Prisma.Decimal('1234567');
    const order = await prisma.order.create({
      data: {
        orderCode,
        userId: owner.id,
        status: 'SHIPPING',
        subtotal: total,
        grandTotal: total,
        shippingRecipient: 'Chatbot Eval',
        shippingPhone: '0900000000',
        shippingAddress: 'Dữ liệu kiểm thử ChatbotEval',
        shippingRegion: 'Hà Nội',
      },
      select: { id: true },
    });
    fixtureOrderId = order.id;

    const fixtures: EvalFixtures = {
      ownerOrderCode: orderCode,
      ownerOrderTotalVi: '1.234.567',
      ownerOrderTotalRaw: '1234567',
      productName: product.name,
      productSku: product.sku,
      missingSku: 'SKU-99999',
    };
    const actors: Record<EvalActor, { userId?: string; role?: UserRole }> = {
      GUEST: {},
      CUSTOMER_OWNER: { userId: owner.id, role: owner.role },
      CUSTOMER_OTHER: { userId: other.id, role: other.role },
    };

    const generators = new Set<SendMessageResult['generationSource']>();
    const retrievalModes = new Set<'KEYWORD' | 'VECTOR'>();
    console.log(
      `KB: ${kbStats.embeddedChunks}/${kbStats.totalChunks} chunk có embedding | owner=${owner.username}, other=${other.username}, product=${product.sku}`,
    );

    // ---- 2. Chạy từng câu hỏi (mỗi câu 1 phiên mới để không lẫn lịch sử) ----
    const cases = buildEvalCases(fixtures);
    const results: CaseResult[] = [];

    for (const [i, c] of cases.entries()) {
      if (i > 0 && opts.delayMs > 0) await sleep(opts.delayMs);
      const actor = actors[c.actor];
      let observed: ObservedResponse;
      const t0 = Date.now();
      try {
        const res = await chatbot.processUserMessage({
          message: c.question,
          userId: actor.userId,
          role: actor.role,
        });
        sessionTokens.push(res.sessionToken);
        generators.add(res.generationSource);
        if (res.retrievalMode !== 'NONE') retrievalModes.add(res.retrievalMode);
        observed = {
          reply: res.reply,
          isFallback: res.isFallback,
          escalatedToHuman: res.escalatedToHuman,
          toolCalls: res.toolCalls.map((t) => ({
            name: t.name,
            ok: t.ok,
            error: t.error,
          })),
          latencyMs: res.latencyMs,
          retrievedTitles: res.retrievedDocuments.map((d) => {
            const score =
              d.scoreType === 'keyword_match'
                ? `từ khóa ${d.keywordScore ?? 0}`
                : d.similarity.toFixed(2);
            return `${d.title} (${score})`;
          }),
        };
      } catch (err: unknown) {
        observed = {
          reply: '',
          isFallback: false,
          escalatedToHuman: false,
          toolCalls: [],
          latencyMs: Date.now() - t0,
          retrievedTitles: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
      const graded = gradeCase(c, observed);
      results.push(graded);
      console.log(
        `${graded.passed ? 'PASS' : 'FAIL'}  ${c.id.padEnd(8)} ${observed.latencyMs
          .toString()
          .padStart(6)}ms  ${c.question}`,
      );
    }

    // ---- 3. Tổng hợp & xuất báo cáo --------------------------------------
    const summary = summarize(results);
    const runId = `eval-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const reportMeta: ReportMeta = {
      runId,
      startedAt,
      provider:
        [...generators].map((source) => providerNames[source]).join(' + ') ||
        'Chưa sinh phản hồi',
      gitCommit: getGitCommit(),
      datasetVersion: '1.1.0',
      retrievalMode:
        retrievalModes.size === 2
          ? 'HYBRID'
          : ([...retrievalModes][0] ?? 'NONE'),
      kbChunks: kbStats.totalChunks,
      kbEmbedded: kbStats.embeddedChunks,
    };
    const markdown = renderMarkdownReport(results, summary, reportMeta);
    const jsonOutput = renderJsonReport(results, summary, reportMeta);

    fs.mkdirSync(opts.outDir, { recursive: true });
    const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
    const mdPath = path.join(opts.outDir, `chatbot-eval-${stamp}.md`);
    const jsonPath = path.join(opts.outDir, `chatbot-eval-${stamp}.json`);
    fs.writeFileSync(mdPath, markdown, 'utf8');
    fs.writeFileSync(path.join(opts.outDir, 'latest.md'), markdown, 'utf8');
    fs.writeFileSync(jsonPath, jsonOutput, 'utf8');
    fs.writeFileSync(path.join(opts.outDir, 'latest.json'), jsonOutput, 'utf8');

    const v = verdict(summary);
    const overall = Object.values(v).every(Boolean);
    console.log('');
    console.log(
      `Đúng: ${summary.passed}/${summary.total} (${(summary.accuracy * 100).toFixed(1)}%) | Bẫy: ${summary.traps.passed}/${summary.traps.total} | Fallback: ${summary.fallbackTriggered}/${summary.fallbackExpected} | Escalate: ${summary.escalationTriggered}/${summary.escalationExpected} | Bịa/rò rỉ: ${summary.hallucinationOrLeak}`,
    );
    console.log(`Kết luận: ${overall ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
    console.log(`Báo cáo: ${mdPath}`);
    if (opts.strict && !overall) exitCode = 1;
  } catch (error) {
    console.error('ChatbotEval thất bại:', error);
    exitCode = 1;
  } finally {
    // ---- 4. Dọn dữ liệu tạm ----------------------------------------------
    try {
      if (sessionTokens.length > 0) {
        await prisma.chatSession.deleteMany({
          where: { sessionToken: { in: sessionTokens } },
        });
      }
      if (fixtureOrderId) {
        await prisma.order.delete({ where: { id: fixtureOrderId } });
      }
      if (fixtureCustomerId) {
        await prisma.user.delete({ where: { id: fixtureCustomerId } });
      }
    } catch (cleanupErr) {
      console.error('Không dọn được dữ liệu tạm của ChatbotEval:', cleanupErr);
      exitCode = 1;
    }
    await app.close();
  }

  process.exit(exitCode);
}

void bootstrap();
