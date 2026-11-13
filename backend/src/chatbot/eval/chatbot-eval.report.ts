// =============================================================================
// ChatbotEval (STT 34) — Xuất báo cáo Markdown từ kết quả chấm điểm.
// =============================================================================

import { CaseResult, EvalSummary } from './chatbot-eval.grader';

export interface ReportMeta {
  startedAt: Date;
  provider: string;
  kbChunks: number;
  kbEmbedded: number;
  runId?: string;
  gitCommit?: string;
  datasetVersion?: string;
  retrievalMode?: 'KEYWORD' | 'VECTOR' | 'HYBRID' | 'LOCAL_MOCK';
}

// Ngưỡng đạt của bài đánh giá (có thể điều chỉnh theo yêu cầu đề tài)
export const PASS_THRESHOLDS = {
  accuracy: 0.85,
  trapPassRate: 1.0,
  fallbackRecall: 1.0,
  escalationRate: 1.0,
  hallucinationOrLeak: 0,
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const mark = (ok: boolean) => (ok ? '✅ Đạt' : '❌ Chưa đạt');
export const cell = (s: string) =>
  s
    .replace(/\|/g, '\\|')
    .replace(/\r?\n+/g, ' ')
    .trim();
const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

export function redactSecrets(text: string): string {
  if (!text) return '';
  return text
    .replace(/bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(
      /(eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,})/g,
      '[JWT_REDACTED]',
    )
    .replace(
      /(password|secret|apikey|api_key)\s*[:=]\s*["']?[^"'\s,]+["']?/gi,
      '$1=[REDACTED]',
    );
}

export function verdict(s: EvalSummary) {
  return {
    accuracy: s.accuracy >= PASS_THRESHOLDS.accuracy,
    traps: s.traps.rate >= PASS_THRESHOLDS.trapPassRate,
    fallback: s.fallbackRecall >= PASS_THRESHOLDS.fallbackRecall,
    escalation: s.escalationRate >= PASS_THRESHOLDS.escalationRate,
    noHallucination:
      s.hallucinationOrLeak <= PASS_THRESHOLDS.hallucinationOrLeak,
  };
}

export function renderMarkdownReport(
  results: CaseResult[],
  s: EvalSummary,
  meta: ReportMeta,
): string {
  const v = verdict(s);
  const overall = Object.values(v).every(Boolean);
  const lines: string[] = [];

  lines.push('# Báo cáo đánh giá Chatbot RAG (STT 34 — ChatbotEval)');
  lines.push('');
  if (meta.runId) lines.push(`- **Run ID**: \`${meta.runId}\``);
  if (meta.gitCommit) lines.push(`- **Git Commit SHA**: \`${meta.gitCommit}\``);
  if (meta.datasetVersion)
    lines.push(`- **Phiên bản Dataset**: \`${meta.datasetVersion}\``);
  lines.push(`- Thời điểm chạy: ${meta.startedAt.toISOString()}`);
  lines.push(`- Bộ sinh câu trả lời (LLM Provider): **${meta.provider}**`);
  if (meta.retrievalMode) {
    lines.push(`- Chế độ tìm kiếm (Retrieval Mode): **${meta.retrievalMode}**`);
  }
  lines.push(
    `- Kho tri thức: ${meta.kbEmbedded}/${meta.kbChunks} chunk đã có embedding`,
  );
  lines.push(
    `- Số câu hỏi: **${s.total}** (trong đó ${s.traps.total} câu "bẫy")`,
  );
  lines.push(`- Kết luận chung: **${overall ? '✅ ĐẠT' : '❌ CHƯA ĐẠT'}**`);
  lines.push('');

  lines.push('## 1. Chỉ số tổng hợp');
  lines.push('');
  lines.push('| Chỉ số | Kết quả | Ngưỡng | Đánh giá |');
  lines.push('|---|---|---|---|');
  lines.push(
    `| Tỉ lệ trả lời đúng | ${s.passed}/${s.total} (${pct(s.accuracy)}) | ≥ ${pct(PASS_THRESHOLDS.accuracy)} | ${mark(v.accuracy)} |`,
  );
  lines.push(
    `| Câu "bẫy" xử lý đúng | ${s.traps.passed}/${s.traps.total} (${pct(s.traps.rate)}) | ${pct(PASS_THRESHOLDS.trapPassRate)} | ${mark(v.traps)} |`,
  );
  lines.push(
    `| Fallback khi thiếu dữ liệu (FR-BOT-04) | ${s.fallbackTriggered}/${s.fallbackExpected} (${pct(s.fallbackRecall)}) | ${pct(PASS_THRESHOLDS.fallbackRecall)} | ${mark(v.fallback)} |`,
  );
  lines.push(
    `| Chuyển CSKH khi khách yêu cầu (FR-BOT-04) | ${s.escalationTriggered}/${s.escalationExpected} (${pct(s.escalationRate)}) | ${pct(PASS_THRESHOLDS.escalationRate)} | ${mark(v.escalation)} |`,
  );
  lines.push(
    `| Bịa dữ liệu / rò rỉ dữ liệu (NFR-04.4) | ${s.hallucinationOrLeak} câu | 0 | ${mark(v.noHallucination)} |`,
  );
  lines.push(
    `| Fallback nhầm khi có dữ liệu | ${s.falseFallback}/${s.answerableExpected} (${pct(s.falseFallbackRate)}) | tham khảo | — |`,
  );
  lines.push(
    `| Độ trễ (avg / p95 / max) | ${s.latency.avgMs} / ${s.latency.p95Ms} / ${s.latency.maxMs} ms | tham khảo | — |`,
  );
  lines.push(
    `| Lỗi runtime | ${s.runtimeErrors} | 0 | ${mark(s.runtimeErrors === 0)} |`,
  );
  lines.push('');

  lines.push('## 2. Theo nhóm câu hỏi');
  lines.push('');
  lines.push('| Nhóm | Đúng | Tỉ lệ |');
  lines.push('|---|---|---|');
  const labels: Record<string, string> = {
    KB_POLICY: 'Tri thức tĩnh (chính sách/FAQ)',
    TOOL_CALLING: 'Function calling (đơn hàng/tồn kho)',
    TRAP: 'Câu hỏi bẫy',
    ESCALATION: 'Yêu cầu gặp người thật',
  };
  for (const [cat, st] of Object.entries(s.byCategory)) {
    lines.push(
      `| ${labels[cat] ?? cat} | ${st.passed}/${st.total} | ${pct(st.rate)} |`,
    );
  }
  lines.push('');

  lines.push('## 3. Chi tiết từng câu hỏi');
  lines.push('');
  lines.push(
    '| ID | Người hỏi | Câu hỏi | Kết quả | Fallback | Escalate | Tool | ms |',
  );
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const tools =
      r.observed.toolCalls
        .map((t) => `${t.name}:${t.ok ? 'ok' : (t.error ?? 'fail')}`)
        .join(', ') || '—';
    lines.push(
      `| ${r.case.id}${r.case.isTrap ? ' 🪤' : ''} | ${r.case.actor} | ${cell(r.case.question)} | ${r.passed ? '✅' : '❌'} | ${r.observed.isFallback ? 'có' : 'không'} | ${r.observed.escalatedToHuman ? 'có' : 'không'} | ${tools} | ${r.observed.latencyMs} |`,
    );
  }
  lines.push('');

  const failed = results.filter((r) => !r.passed);
  lines.push('## 4. Phân tích câu trả lời sai');
  lines.push('');
  if (failed.length === 0) {
    lines.push('Không có câu nào sai.');
  } else {
    for (const r of failed) {
      lines.push(`### ${r.case.id} — ${r.case.question}`);
      lines.push('');
      lines.push(`- Yêu cầu đối chiếu: ${r.case.requirement}`);
      lines.push(`- Mục đích: ${r.case.note}`);
      for (const ch of r.checks.filter((c) => !c.passed)) {
        lines.push(`- ❌ \`${ch.name}\`: ${ch.detail}`);
      }
      lines.push(`- Câu trả lời: “${cell(truncate(r.observed.reply, 400))}”`);
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## 5. Toàn văn câu trả lời');
  lines.push('');
  for (const r of results) {
    lines.push(
      `<details><summary>${r.case.id} — ${cell(r.case.question)}</summary>`,
    );
    lines.push('');
    lines.push(
      `- Tài liệu truy xuất: ${r.observed.retrievedTitles.join('; ') || '—'}`,
    );
    lines.push('');
    lines.push('```text');
    lines.push(
      r.observed.error ? `[LỖI] ${r.observed.error}` : r.observed.reply,
    );
    lines.push('```');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Xuất dữ liệu đánh giá dạng JSON có cấu trúc phục vụ lưu trữ song song và phân tích tự động (F092, F102, F104).
 */
export function renderJsonReport(
  results: CaseResult[],
  s: EvalSummary,
  meta: ReportMeta,
): string {
  const sanitizedCases = results.map((r) => ({
    id: r.case.id,
    category: r.case.category,
    actor: r.case.actor,
    question: r.case.question,
    isTrap: r.case.isTrap,
    requirement: r.case.requirement,
    status: r.case.status ?? 'ACTIVE',
    passed: r.passed,
    observed: {
      reply: redactSecrets(r.observed.reply),
      isFallback: r.observed.isFallback,
      escalatedToHuman: r.observed.escalatedToHuman,
      toolCalls: r.observed.toolCalls,
      latencyMs: r.observed.latencyMs,
      retrievedTitles: r.observed.retrievedTitles,
      error: r.observed.error,
    },
    checks: r.checks,
  }));

  const payload = {
    metadata: {
      runId: meta.runId ?? 'run-local-unknown',
      gitCommit: meta.gitCommit ?? 'unknown',
      datasetVersion: meta.datasetVersion ?? '1.0.0',
      startedAt: meta.startedAt.toISOString(),
      provider: meta.provider,
      retrievalMode: meta.retrievalMode ?? 'AUTO',
      kbChunks: meta.kbChunks,
      kbEmbedded: meta.kbEmbedded,
    },
    summary: s,
    verdict: verdict(s),
    cases: sanitizedCases,
  };

  return JSON.stringify(payload, null, 2);
}
