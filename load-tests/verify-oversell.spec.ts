import {
  evaluateOversell,
  LOAD_TEST_POLICY,
  type DatabaseState,
  type MetricsSummaryPayload,
  type OversellVerificationInput,
} from "./oversell-verifier";

const testData = {
  productId: "fixture-product",
  initialStock: 10,
  totalVUs: 100,
  runId: "run-canonical-100",
  gitCommit: "89c228b",
};
const dbData: DatabaseState = {
  currentStock: 10,
  currentReservedStock: 10,
  availableStock: 0,
  distinctOrdersCount: 10,
  pendingOrdersCount: 10,
  totalSoldQuantity: 10,
  holdingReservationsCount: 10,
  totalHoldingQuantity: 10,
};
const metrics: MetricsSummaryPayload = {
  runId: testData.runId,
  gitCommit: testData.gitCommit,
  runner: "k6",
  totalRequests: 100,
  success201: 10,
  conflict409: 90,
  unexpectedErrors: 0,
  durationMs: {
    p95: LOAD_TEST_POLICY.p95MaxMs,
    p99: LOAD_TEST_POLICY.p99MaxMs,
  },
};

function evaluate(patch: Partial<OversellVerificationInput> = {}) {
  return evaluateOversell({
    testData,
    dbData,
    metricsSummary: metrics,
    ...patch,
  });
}

describe("Task 32 - verifier chống oversell và độ trễ", () => {
  it("chấp nhận fixture 100/10/90/0 khớp DB và các phân vị bằng ngưỡng", () => {
    expect(evaluate()).toMatchObject({
      verdict: "PASS",
      oversellVerdict: "PASS",
      latencyVerdict: "PASS",
      exitCode: 0,
    });
  });

  it.each([
    { p95: 4500, p99: 5000 },
    { p95: LOAD_TEST_POLICY.p95MaxMs, p99: LOAD_TEST_POLICY.p99MaxMs + 1 },
  ])("đánh trượt độ trễ vượt ngưỡng %o dù tồn kho đạt", (durationMs) => {
    const actual = evaluate({ metricsSummary: { ...metrics, durationMs } });
    expect(actual).toMatchObject({
      verdict: "FAIL",
      oversellVerdict: "PASS",
      latencyVerdict: "FAIL",
      exitCode: 1,
    });
    expect(actual.markdownReport).toContain("NFR-01 **FAIL**");
  });

  it("báo INVALID khi thiếu p99 và giữ giá trị unavailable trong báo cáo", () => {
    const actual = evaluate({
      metricsSummary: { ...metrics, durationMs: { p95: 125 } },
    });
    expect(actual).toMatchObject({
      verdict: "INVALID",
      oversellVerdict: "PASS",
      exitCode: 1,
    });
    expect(actual.markdownReport).toContain(
      "| Toàn bộ | 125.0 ms | unavailable |",
    );
  });

  it.each([
    null,
    { ...metrics, runId: "stale-run" },
    { ...metrics, gitCommit: "43e6d4e" },
    { ...metrics, runner: "node-concurrency-smoke" as const },
    { ...metrics, unexpectedErrors: undefined },
    { ...metrics, durationMs: { p95: Number.NaN, p99: 300 } },
  ])("từ chối dữ liệu thiếu hoặc sai nguồn %o", (metricsSummary) => {
    expect(evaluate({ metricsSummary })).toMatchObject({
      verdict: "INVALID",
      exitCode: 1,
    });
  });

  it.each([
    { unexpectedErrors: 2, conflict409: 88 },
    { totalRequests: 99, conflict409: 89 },
    { success201: 9, conflict409: 91 },
    { conflict409: 89 },
  ])("phát hiện số liệu HTTP sai kỳ vọng %o", (patch) => {
    expect(
      evaluate({ metricsSummary: { ...metrics, ...patch } }),
    ).toMatchObject({
      oversellVerdict: "FAIL",
      exitCode: 1,
    });
  });

  it.each([
    { distinctOrdersCount: 0, currentReservedStock: 0, availableStock: 10 },
    {
      distinctOrdersCount: 15,
      totalSoldQuantity: 15,
      currentReservedStock: 15,
      availableStock: -5,
    },
    { holdingReservationsCount: 9, totalHoldingQuantity: 9 },
    { currentStock: 9, availableStock: 0 },
    { pendingOrdersCount: 9 },
  ])("phát hiện PostgreSQL lệch dữ kiện %o", (patch) => {
    expect(evaluate({ dbData: { ...dbData, ...patch } })).toMatchObject({
      oversellVerdict: "FAIL",
      exitCode: 1,
    });
  });

  it("chấp nhận Node smoke khi caller chọn đúng runner", () => {
    expect(
      evaluate({
        expectedRunner: "node-concurrency-smoke",
        metricsSummary: { ...metrics, runner: "node-concurrency-smoke" },
      }).verdict,
    ).toBe("PASS");
  });
});
