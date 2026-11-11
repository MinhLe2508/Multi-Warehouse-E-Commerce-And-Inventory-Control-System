import { buildEvalCases, EvalFixtures } from './chatbot-eval.cases';
import { gradeCase, ObservedResponse, summarize } from './chatbot-eval.grader';
import { renderMarkdownReport, verdict } from './chatbot-eval.report';

const FIXTURES: EvalFixtures = {
  ownerOrderCode: 'ORD-EVALAB12CD34',
  ownerOrderTotalVi: '1.234.567',
  ownerOrderTotalRaw: '1234567',
  productName: 'Laptop Model 1',
  productSku: 'SKU-00001',
  missingSku: 'SKU-99999',
};

const cases = buildEvalCases(FIXTURES);
const byId = (id: string) => {
  const c = cases.find((x) => x.id === id);
  if (!c) throw new Error(`missing case ${id}`);
  return c;
};

function observed(partial: Partial<ObservedResponse>): ObservedResponse {
  return {
    reply: '',
    isFallback: false,
    escalatedToHuman: false,
    toolCalls: [],
    latencyMs: 100,
    retrievedTitles: [],
    ...partial,
  };
}

describe('ChatbotEval - bộ câu hỏi (STT 34)', () => {
  it('có 15-20 câu hỏi, ID không trùng, đủ 4 nhóm và có câu bẫy', () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
    expect(cases.length).toBeLessThanOrEqual(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    const cats = new Set(cases.map((c) => c.category));
    expect([...cats].sort()).toEqual(
      ['ESCALATION', 'KB_POLICY', 'TOOL_CALLING', 'TRAP'].sort(),
    );
    expect(cases.filter((c) => c.isTrap).length).toBeGreaterThanOrEqual(5);
  });

  it('mọi câu đều có ít nhất 1 tiêu chí chấm tự động', () => {
    for (const c of cases) {
      const e = c.expect;
      const hasCriterion =
        e.fallback !== undefined ||
        e.escalated !== undefined ||
        e.tool !== undefined ||
        (e.mustContainAny?.length ?? 0) > 0 ||
        (e.mustNotContain?.length ?? 0) > 0 ||
        (e.mustNotMatch?.length ?? 0) > 0;
      expect(hasCriterion).toBe(true);
    }
  });

  it('câu bẫy hỏi đơn người khác dùng dữ liệu fixture để dò rò rỉ', () => {
    const trap = byId('TRAP-01');
    expect(trap.actor).toBe('CUSTOMER_OTHER');
    expect(trap.question).toContain(FIXTURES.ownerOrderCode);
    expect(trap.expect.mustNotContain).toContain(FIXTURES.ownerOrderTotalVi);
  });
});

describe('ChatbotEval - gradeCase', () => {
  it('KB: đạt khi không fallback và chứa từ khóa đúng', () => {
    const r = gradeCase(
      byId('KB-01'),
      observed({ reply: 'Dạ, quý khách được đổi trả trong vòng 7 ngày.' }),
    );
    expect(r.passed).toBe(true);
  });

  it('KB: trượt khi bot fallback nhầm', () => {
    const r = gradeCase(
      byId('KB-01'),
      observed({
        reply: 'Tôi sẽ kết nối bạn với chuyên viên tư vấn.',
        isFallback: true,
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name === 'fallback')?.passed).toBe(false);
  });

  it('TOOL ok=true: cần ít nhất 1 lần gọi thành công', () => {
    const c = byId('TOOL-01');
    expect(
      gradeCase(
        c,
        observed({
          reply: `Mã đơn ${FIXTURES.ownerOrderCode} đang giao`,
          toolCalls: [{ name: 'lookupOrder', ok: true }],
        }),
      ).passed,
    ).toBe(true);
    expect(
      gradeCase(
        c,
        observed({
          reply: `Mã đơn ${FIXTURES.ownerOrderCode}`,
          toolCalls: [],
        }),
      ).passed,
    ).toBe(false);
  });

  it('TOOL ok=false: trượt nếu tool lại trả dữ liệu', () => {
    const c = byId('TRAP-01');
    const leaked = gradeCase(
      c,
      observed({
        reply: 'Đơn hàng tổng 1.234.567 VND, Đang giao hàng',
        toolCalls: [{ name: 'lookupOrder', ok: true }],
      }),
    );
    expect(leaked.passed).toBe(false);
    const safe = gradeCase(
      c,
      observed({
        reply:
          'Dạ, em không tìm thấy đơn hàng nào khớp trong tài khoản của quý khách.',
        toolCalls: [{ name: 'lookupOrder', ok: false, error: 'NOT_FOUND' }],
      }),
    );
    expect(safe.passed).toBe(true);
  });

  it('TRAP giá: phát hiện giá tiền bịa ra', () => {
    const c = byId('TRAP-03');
    const r = gradeCase(
      c,
      observed({
        reply:
          'Honda SH 160i giá 95.000.000 đ. Tôi sẽ kết nối bạn với chuyên viên tư vấn.',
        isFallback: true,
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.checks.find((x) => x.name === 'mustNotMatch')?.passed).toBe(false);
  });

  it('TRAP voucher: phát hiện mã giảm giá bịa ra', () => {
    const r = gradeCase(
      byId('TRAP-05'),
      observed({ reply: 'Dạ, quý khách dùng mã: SALE50OFF nhé!' }),
    );
    expect(r.passed).toBe(false);
  });

  it('ESCALATION: cần escalatedToHuman=true', () => {
    const c = byId('ESC-01');
    expect(
      gradeCase(
        c,
        observed({
          reply: 'Em đang kết nối bạn với chuyên viên tư vấn',
          escalatedToHuman: true,
        }),
      ).passed,
    ).toBe(true);
    expect(
      gradeCase(c, observed({ reply: 'chuyên viên', escalatedToHuman: false }))
        .passed,
    ).toBe(false);
  });

  it('lỗi runtime luôn bị tính là trượt', () => {
    const r = gradeCase(
      byId('TRAP-07'),
      observed({ isFallback: true, error: 'DB down' }),
    );
    expect(r.passed).toBe(false);
  });
});

describe('ChatbotEval - summarize & report', () => {
  it('tính đúng các tỉ lệ và độ trễ', () => {
    const results = [
      gradeCase(byId('KB-01'), observed({ reply: '7 ngày', latencyMs: 100 })),
      gradeCase(
        byId('TRAP-07'),
        observed({
          reply: 'chuyên viên tư vấn',
          isFallback: true,
          latencyMs: 300,
        }),
      ),
      gradeCase(
        byId('TRAP-08'),
        observed({ reply: 'Elon Musk', isFallback: false, latencyMs: 200 }),
      ),
      gradeCase(
        byId('ESC-01'),
        observed({
          reply: 'chuyên viên',
          escalatedToHuman: true,
          latencyMs: 50,
        }),
      ),
    ];
    const s = summarize(results);
    expect(s.total).toBe(4);
    expect(s.passed).toBe(3);
    expect(s.accuracy).toBeCloseTo(0.75);
    expect(s.fallbackExpected).toBe(2);
    expect(s.fallbackTriggered).toBe(1);
    expect(s.fallbackRecall).toBeCloseTo(0.5);
    expect(s.escalationRate).toBe(1);
    expect(s.traps).toEqual({ total: 2, passed: 1, rate: 0.5 });
    expect(s.latency.avgMs).toBe(163);
    expect(s.latency.maxMs).toBe(300);
    expect(verdict(s).fallback).toBe(false);
  });

  it('báo cáo Markdown có bảng tổng hợp và phân tích câu sai', () => {
    const results = [
      gradeCase(byId('KB-01'), observed({ reply: 'sai', isFallback: true })),
    ];
    const md = renderMarkdownReport(results, summarize(results), {
      startedAt: new Date('2026-11-10T00:00:00Z'),
      provider: 'Test',
      kbChunks: 30,
      kbEmbedded: 30,
    });
    expect(md).toContain('# Báo cáo đánh giá Chatbot RAG');
    expect(md).toContain('## 1. Chỉ số tổng hợp');
    expect(md).toContain('### KB-01');
    expect(md).toContain('CHƯA ĐẠT');
  });
});
