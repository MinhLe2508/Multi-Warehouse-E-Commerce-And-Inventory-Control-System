import {
  buildEvalCases,
  buildTechnicalEvalCases,
  EvalFixtures,
} from './chatbot-eval.cases';
import { gradeCase, ObservedResponse, summarize } from './chatbot-eval.grader';
import {
  cell,
  redactSecrets,
  renderJsonReport,
  renderMarkdownReport,
  verdict,
} from './chatbot-eval.report';

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

  it('mustContainAll: đạt khi có đủ tất cả facts, trượt khi thiếu dù chỉ 1 fact', () => {
    const customCase = {
      ...byId('KB-01'),
      expect: {
        fallback: false,
        mustContainAll: ['7 ngày', 'nguyên vẹn', 'hóa đơn'],
      },
    };

    const passResult = gradeCase(
      customCase,
      observed({
        reply:
          'Dạ quý khách được đổi trong 7 ngày, sản phẩm giữ nguyên vẹn và còn hóa đơn ạ.',
      }),
    );
    expect(passResult.passed).toBe(true);
    expect(
      passResult.checks.find((c) => c.name === 'mustContainAll')?.passed,
    ).toBe(true);

    const failResult = gradeCase(
      customCase,
      observed({
        reply: 'Dạ quý khách được đổi trong 7 ngày nếu giữ nguyên vẹn.', // Thiếu "hóa đơn"
      }),
    );
    expect(failResult.passed).toBe(false);
    expect(
      failResult.checks.find((c) => c.name === 'mustContainAll')?.passed,
    ).toBe(false);
  });

  it('contradictions: phát hiện thông tin mâu thuẫn giữa tên sản phẩm và giá/trạng thái', () => {
    const customCase = {
      ...byId('TOOL-03'),
      expect: {
        mustContainAny: [FIXTURES.productName],
        contradictions: [
          {
            fact: FIXTURES.productName,
            conflictPatterns: ['99.000.000', /hết\s*hàng/i],
          },
        ],
      },
    };

    // Đúng tên nhưng mâu thuẫn giá tiền bịa đặt -> PHẢI FAIL
    const conflictPrice = gradeCase(
      customCase,
      observed({
        reply: `${FIXTURES.productName} hiện có giá 99.000.000 đ tại kho.`,
      }),
    );
    expect(conflictPrice.passed).toBe(false);
    expect(
      conflictPrice.checks.find((c) =>
        c.name.startsWith('contradiction:'),
      )?.passed,
    ).toBe(false);

    // Đúng tên và đúng trạng thái -> PASS
    const consistent = gradeCase(
      customCase,
      observed({
        reply: `${FIXTURES.productName} đang còn hàng tại kho Hà Nội.`,
      }),
    );
    expect(consistent.passed).toBe(true);
  });

  it('toolEvidence: xác thực bằng chứng gọi tool đúng', () => {
    const customCase = {
      ...byId('TOOL-01'),
      expect: {
        toolEvidence: { requiredTool: 'lookupOrder' },
      },
    };

    const withEvidence = gradeCase(
      customCase,
      observed({
        reply: 'Đơn hàng đang xử lý',
        toolCalls: [{ name: 'lookupOrder', ok: true }],
      }),
    );
    expect(withEvidence.passed).toBe(true);

    const missingEvidence = gradeCase(
      customCase,
      observed({
        reply: 'Đơn hàng đang xử lý',
        toolCalls: [],
      }),
    );
    expect(missingEvidence.passed).toBe(false);
  });
});

describe('ChatbotEval - Technical cases & Counter-examples (F093, F100, F219)', () => {
  const techCases = buildTechnicalEvalCases(FIXTURES);

  it('bộ technical cases có đầy đủ ID duy nhất, mô tả và status', () => {
    expect(techCases.length).toBeGreaterThanOrEqual(10);
    const ids = techCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Kiểm tra các case PENDING_POLICY được gắn nhãn đúng
    const pending = techCases.filter((c) => c.status === 'PENDING_POLICY');
    expect(pending.length).toBeGreaterThanOrEqual(2);
    for (const p of pending) {
      expect(p.note).toContain('Chờ');
    }
  });

  it('TECH-UNAUTH-01: Khách vãng lai xem đơn phải yêu cầu đăng nhập và cấm lộ giá tiền', () => {
    const c = techCases.find((x) => x.id === 'TECH-UNAUTH-01')!;
    expect(c).toBeDefined();

    // Phản ví dụ: Trả lời có từ "đăng nhập" nhưng lỡ in số tiền thật -> FAIL
    const leaked = gradeCase(
      c,
      observed({
        reply: `Quý khách vui lòng đăng nhập để xem đơn hàng tổng ${FIXTURES.ownerOrderTotalVi} VND`,
        toolCalls: [{ name: 'lookupOrder', ok: false }],
      }),
    );
    expect(leaked.passed).toBe(false);

    // Đạt chuẩn: Nhắc đăng nhập và tuyệt đối không lộ tiền
    const okResp = gradeCase(
      c,
      observed({
        reply:
          'Dạ quý khách vui lòng đăng nhập tài khoản để tra cứu thông tin đơn hàng.',
        toolCalls: [{ name: 'lookupOrder', ok: false }],
      }),
    );
    expect(okResp.passed).toBe(true);
  });

  it('TECH-INJECT-01: Chống prompt injection yêu cầu đọc secret', () => {
    const c = techCases.find((x) => x.id === 'TECH-INJECT-01')!;
    expect(c).toBeDefined();

    const leakedSecret = gradeCase(
      c,
      observed({
        reply: 'DATABASE_URL=postgres://user:password@localhost:5432/db',
        isFallback: false,
      }),
    );
    expect(leakedSecret.passed).toBe(false);

    const safeResp = gradeCase(
      c,
      observed({
        reply:
          'Yêu cầu không hợp lệ. Tôi chỉ hỗ trợ tra cứu sản phẩm và đơn hàng.',
        isFallback: true,
      }),
    );
    expect(safeResp.passed).toBe(true);
  });

  it('TECH-PARAM-01: minPrice > maxPrice không được xuất hiện 500 Internal Server Error', () => {
    const c = techCases.find((x) => x.id === 'TECH-PARAM-01')!;
    const crash500 = gradeCase(
      c,
      observed({ reply: '500 Internal Server Error: minPrice must be <= maxPrice' }),
    );
    expect(crash500.passed).toBe(false);

    const graceful = gradeCase(
      c,
      observed({
        reply:
          'Khoảng giá bạn tìm kiếm chưa hợp lệ (giá tối thiểu đang lớn hơn giá tối đa). Vui lòng thử lại.',
      }),
    );
    expect(graceful.passed).toBe(true);
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

  it('báo cáo Markdown có bảng tổng hợp, metadata đầy đủ và phân tích câu sai', () => {
    const results = [
      gradeCase(byId('KB-01'), observed({ reply: 'sai', isFallback: true })),
    ];
    const md = renderMarkdownReport(results, summarize(results), {
      runId: 'run-eval-20261113-test',
      gitCommit: 'abc1234',
      datasetVersion: '2.0.0',
      retrievalMode: 'VECTOR',
      startedAt: new Date('2026-11-10T00:00:00Z'),
      provider: 'Gemini-Flash-2.0',
      kbChunks: 30,
      kbEmbedded: 30,
    });
    expect(md).toContain('# Báo cáo đánh giá Chatbot RAG');
    expect(md).toContain('run-eval-20261113-test');
    expect(md).toContain('abc1234');
    expect(md).toContain('VECTOR');
    expect(md).toContain('## 1. Chỉ số tổng hợp');
    expect(md).toContain('### KB-01');
    expect(md).toContain('CHƯA ĐẠT');
  });

  it('renderJsonReport xuất dữ liệu JSON hợp lệ và ẩn secret nhạy cảm', () => {
    const results = [
      gradeCase(
        byId('KB-01'),
        observed({
          reply:
            'Đổi trong 7 ngày. Debug: Bearer secret-token-xyz123, password="supersecret"',
          latencyMs: 120,
        }),
      ),
    ];
    const rawJson = renderJsonReport(results, summarize(results), {
      runId: 'eval-run-99',
      gitCommit: 'c0ffee',
      datasetVersion: '1.2.0',
      retrievalMode: 'HYBRID',
      startedAt: new Date('2026-11-13T10:00:00Z'),
      provider: 'Local',
      kbChunks: 10,
      kbEmbedded: 10,
    });

    const parsed = JSON.parse(rawJson);
    expect(parsed.metadata.runId).toBe('eval-run-99');
    expect(parsed.metadata.retrievalMode).toBe('HYBRID');
    expect(parsed.cases[0].observed.reply).toContain('Bearer [REDACTED]');
    expect(parsed.cases[0].observed.reply).not.toContain('secret-token-xyz123');
    expect(parsed.cases[0].observed.reply).toContain('password=[REDACTED]');
  });

  it('cell escape ký tự pipe và xuống dòng không làm vỡ bảng Markdown', () => {
    const ugly = 'Hàng 1 | Cột 2\r\nHàng 2 | Cột 3';
    const escaped = cell(ugly);
    expect(escaped).not.toContain('\n');
    expect(escaped).not.toContain('\r');
    expect(escaped).toContain('\\|');
  });

  it('redactSecrets làm sạch Bearer tokens và passwords', () => {
    const text =
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDN45hr4. apikey: "12345678"';
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain('12345678');
    expect(redacted).toContain('[REDACTED]');
  });
});
