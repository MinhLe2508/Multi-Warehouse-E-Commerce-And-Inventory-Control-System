// =============================================================================
// ChatbotEval (STT 34) — Chấm điểm tự động + tổng hợp số liệu.
// Thuần hàm (không phụ thuộc Nest/Prisma) để unit test được.
// =============================================================================

import { EvalCase, EvalCategory } from './chatbot-eval.cases';

// Kết quả quan sát được sau khi gửi 1 câu hỏi cho ChatbotService
export interface ObservedResponse {
  reply: string;
  isFallback: boolean;
  escalatedToHuman: boolean;
  toolCalls: Array<{ name: string; ok: boolean; error?: string }>;
  latencyMs: number;
  retrievedTitles: string[];
  error?: string; // Lỗi runtime khi gọi chatbot (nếu có)
}

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface CaseResult {
  case: EvalCase;
  observed: ObservedResponse;
  passed: boolean;
  checks: CheckResult[];
}

export interface CategoryStat {
  total: number;
  passed: number;
  rate: number;
}

export interface EvalSummary {
  total: number;
  passed: number;
  accuracy: number;
  byCategory: Record<EvalCategory, CategoryStat>;
  traps: CategoryStat;
  // FR-BOT-04: câu hỏi kỳ vọng fallback có thực sự fallback không
  fallbackExpected: number;
  fallbackTriggered: number;
  fallbackRecall: number;
  // Câu hỏi có dữ liệu nhưng bot lại fallback nhầm
  answerableExpected: number;
  falseFallback: number;
  falseFallbackRate: number;
  // Yêu cầu gặp người thật
  escalationExpected: number;
  escalationTriggered: number;
  escalationRate: number;
  // NFR-04.4: số câu vi phạm mustNotContain/mustNotMatch (bịa hoặc rò rỉ dữ liệu)
  hallucinationOrLeak: number;
  runtimeErrors: number;
  latency: { avgMs: number; p95Ms: number; maxMs: number };
}

const normalize = (s: string) => s.toLowerCase();

export function gradeCase(c: EvalCase, o: ObservedResponse): CaseResult {
  const checks: CheckResult[] = [];
  const reply = normalize(o.reply ?? '');
  const e = c.expect;

  if (o.error) {
    checks.push({
      name: 'runtime',
      passed: false,
      detail: `Lỗi khi gọi chatbot: ${o.error}`,
    });
  }

  if (e.fallback !== undefined) {
    checks.push({
      name: 'fallback',
      passed: o.isFallback === e.fallback,
      detail: `kỳ vọng isFallback=${e.fallback}, thực tế=${o.isFallback}`,
    });
  }

  if (e.escalated !== undefined) {
    checks.push({
      name: 'escalated',
      passed: o.escalatedToHuman === e.escalated,
      detail: `kỳ vọng escalated=${e.escalated}, thực tế=${o.escalatedToHuman}`,
    });
  }

  if (e.tool) {
    const want = e.tool;
    const calls = o.toolCalls.filter((t) => t.name === want.name);
    let passed: boolean;
    let detail: string;
    if (want.ok) {
      passed = calls.some((t) => t.ok);
      detail = passed
        ? `${want.name} trả dữ liệu thành công`
        : `không có lần gọi ${want.name} thành công (calls=${JSON.stringify(o.toolCalls)})`;
    } else {
      // Kỳ vọng tool bị từ chối: có gọi và bị lỗi, và KHÔNG có lần nào thành công
      passed = calls.length > 0 && calls.every((t) => !t.ok);
      detail = passed
        ? `${want.name} bị từ chối đúng (${calls.map((t) => t.error).join(', ')})`
        : `kỳ vọng ${want.name} bị từ chối (calls=${JSON.stringify(o.toolCalls)})`;
    }
    checks.push({ name: 'tool', passed, detail });
  }

  if (e.mustContainAll && e.mustContainAll.length > 0) {
    const missing = e.mustContainAll.filter(
      (kw) => !reply.includes(normalize(kw)),
    );
    checks.push({
      name: 'mustContainAll',
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `chứa đủ tất cả facts [${e.mustContainAll.join(', ')}]`
          : `thiếu các facts bắt buộc: [${missing.join(', ')}]`,
    });
  }

  if (e.mustContainAny && e.mustContainAny.length > 0) {
    const hit = e.mustContainAny.find((kw) => reply.includes(normalize(kw)));
    checks.push({
      name: 'mustContainAny',
      passed: Boolean(hit),
      detail: hit
        ? `chứa "${hit}"`
        : `không chứa cụm nào trong [${e.mustContainAny.join(' | ')}]`,
    });
  }

  if (e.mustNotContain && e.mustNotContain.length > 0) {
    const leaked = e.mustNotContain.filter(
      (kw) => kw && reply.includes(normalize(kw)),
    );
    checks.push({
      name: 'mustNotContain',
      passed: leaked.length === 0,
      detail:
        leaked.length === 0
          ? 'không chứa dữ liệu bị cấm'
          : `chứa dữ liệu bị cấm: ${leaked.join(', ')}`,
    });
  }

  if (e.mustNotMatch && e.mustNotMatch.length > 0) {
    const matched = e.mustNotMatch
      .map((re) => (o.reply ?? '').match(re)?.[0])
      .filter((m): m is string => Boolean(m));
    checks.push({
      name: 'mustNotMatch',
      passed: matched.length === 0,
      detail:
        matched.length === 0
          ? 'không có nội dung bịa đặt'
          : `có nội dung nghi bịa đặt: ${matched.join(', ')}`,
    });
  }

  if (e.contradictions && e.contradictions.length > 0) {
    for (const item of e.contradictions) {
      if (reply.includes(normalize(item.fact))) {
        const hits = item.conflictPatterns
          .map((pattern) => {
            if (typeof pattern === 'string') {
              return reply.includes(normalize(pattern)) ? pattern : null;
            }
            return (o.reply ?? '').match(pattern)?.[0] ?? null;
          })
          .filter(Boolean);

        checks.push({
          name: `contradiction:${item.fact}`,
          passed: hits.length === 0,
          detail:
            hits.length === 0
              ? `không mâu thuẫn với fact "${item.fact}"`
              : `phát hiện thông tin mâu thuẫn với fact "${item.fact}": [${hits.join(', ')}]`,
        });
      }
    }
  }

  if (e.toolEvidence) {
    const want = e.toolEvidence;
    let passed = true;
    let detail = '';
    if (want.requiredTool) {
      const match = o.toolCalls.find(
        (t) => t.name === want.requiredTool && t.ok,
      );
      if (!match) {
        passed = false;
        detail = `không tìm thấy bằng chứng gọi tool thành công: ${want.requiredTool}`;
      } else {
        detail = `bằng chứng gọi tool thành công: ${want.requiredTool}`;
      }
    }
    checks.push({ name: 'toolEvidence', passed, detail });
  }

  return {
    case: c,
    observed: o,
    passed: checks.length > 0 && checks.every((ch) => ch.passed),
    checks,
  };
}

function rate(passed: number, total: number): number {
  return total === 0 ? 0 : passed / total;
}

function stat(results: CaseResult[]): CategoryStat {
  const passed = results.filter((r) => r.passed).length;
  return { total: results.length, passed, rate: rate(passed, results.length) };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)];
}

export function summarize(results: CaseResult[]): EvalSummary {
  const categories: EvalCategory[] = [
    'KB_POLICY',
    'TOOL_CALLING',
    'TRAP',
    'ESCALATION',
  ];
  const byCategory = Object.fromEntries(
    categories.map((cat) => [
      cat,
      stat(results.filter((r) => r.case.category === cat)),
    ]),
  ) as Record<EvalCategory, CategoryStat>;

  const fbExpected = results.filter((r) => r.case.expect.fallback === true);
  const fbTriggered = fbExpected.filter((r) => r.observed.isFallback).length;
  const answerable = results.filter((r) => r.case.expect.fallback === false);
  const falseFb = answerable.filter((r) => r.observed.isFallback).length;
  const escExpected = results.filter((r) => r.case.expect.escalated === true);
  const escTriggered = escExpected.filter(
    (r) => r.observed.escalatedToHuman,
  ).length;

  const hallucinationOrLeak = results.filter((r) =>
    r.checks.some(
      (ch) =>
        (ch.name === 'mustNotContain' ||
          ch.name === 'mustNotMatch' ||
          ch.name.startsWith('contradiction:')) &&
        !ch.passed,
    ),
  ).length;

  const latencies = results
    .filter((r) => !r.observed.error)
    .map((r) => r.observed.latencyMs);
  const passed = results.filter((r) => r.passed).length;

  return {
    total: results.length,
    passed,
    accuracy: rate(passed, results.length),
    byCategory,
    traps: stat(results.filter((r) => r.case.isTrap)),
    fallbackExpected: fbExpected.length,
    fallbackTriggered: fbTriggered,
    fallbackRecall: rate(fbTriggered, fbExpected.length),
    answerableExpected: answerable.length,
    falseFallback: falseFb,
    falseFallbackRate: rate(falseFb, answerable.length),
    escalationExpected: escExpected.length,
    escalationTriggered: escTriggered,
    escalationRate: rate(escTriggered, escExpected.length),
    hallucinationOrLeak,
    runtimeErrors: results.filter((r) => r.observed.error).length,
    latency: {
      avgMs:
        latencies.length === 0
          ? 0
          : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p95Ms: percentile(latencies, 95),
      maxMs: latencies.length === 0 ? 0 : Math.max(...latencies),
    },
  };
}
