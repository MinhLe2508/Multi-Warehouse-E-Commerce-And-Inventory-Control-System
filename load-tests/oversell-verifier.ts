import { readFileSync } from "node:fs";
import { join } from "node:path";

export const LOAD_TEST_POLICY = JSON.parse(
  readFileSync(join(__dirname, "load-test-policy.json"), "utf8"),
) as { p95MaxMs: number; p99MaxMs: number };

export type LoadTestRunner = "k6" | "node-concurrency-smoke";

export interface TestDataConfig {
  productId: string;
  productSku?: string;
  warehouseId?: string;
  initialStock: number;
  totalVUs: number;
  runId: string;
  gitCommit: string;
}

export interface DatabaseState {
  currentStock: number;
  currentReservedStock: number;
  availableStock: number;
  distinctOrdersCount: number;
  pendingOrdersCount: number;
  totalSoldQuantity: number;
  holdingReservationsCount: number;
  totalHoldingQuantity: number;
}

export interface LatencyDurationMs {
  min?: number;
  avg?: number;
  med?: number;
  max?: number;
  p90?: number;
  p95?: number;
  p99?: number;
}

export interface MetricsSummaryPayload {
  runId?: string;
  gitCommit?: string;
  runner?: LoadTestRunner;
  totalRequests?: number;
  success201?: number;
  conflict409?: number;
  unexpectedErrors?: number;
  durationMs?: LatencyDurationMs;
  duration201Ms?: LatencyDurationMs;
  duration409Ms?: LatencyDurationMs;
  rps?: number;
}

export interface OversellVerificationInput {
  testData: TestDataConfig;
  dbData: DatabaseState | null;
  metricsSummary?: MetricsSummaryPayload | null;
  expectedRunner?: LoadTestRunner;
  executedAt?: Date;
}

export type CheckStatus = "PASS" | "FAIL" | "INVALID";

export interface VerificationCheck {
  id: string;
  category: "evidence" | "oversell" | "latency";
  name: string;
  expected: string | number;
  observed: string | number;
  status: CheckStatus;
}

export interface OversellVerificationResult {
  verdict: CheckStatus;
  oversellVerdict: CheckStatus;
  latencyVerdict: CheckStatus;
  allPassed: boolean;
  exitCode: number;
  checks: VerificationCheck[];
  summaryMessage: string;
  markdownReport: string;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function textOrUnavailable(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "unavailable";
}

function verdictFor(checks: VerificationCheck[]): CheckStatus {
  if (checks.some((check) => check.status === "INVALID")) return "INVALID";
  return checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS";
}

export function evaluateOversell(
  input: OversellVerificationInput,
): OversellVerificationResult {
  const { testData, dbData, metricsSummary: metrics } = input;
  const expectedRunner = input.expectedRunner ?? "k6";
  const checks: VerificationCheck[] = [];
  const add = (
    id: string,
    category: VerificationCheck["category"],
    name: string,
    expected: string | number,
    observed: string | number,
    status: CheckStatus,
  ) => checks.push({ id, category, name, expected, observed, status });

  const configValid =
    Boolean(testData?.productId && testData.runId?.trim()) &&
    /^[0-9a-f]{7,40}$/i.test(testData?.gitCommit ?? "") &&
    isCount(testData?.initialStock) &&
    isCount(testData?.totalVUs) &&
    testData.totalVUs > 0;
  add(
    "CONFIG_VALID",
    "evidence",
    "Cấu hình lượt chạy",
    "Hợp lệ",
    configValid
      ? "Hợp lệ"
      : "Thiếu hoặc sai runId, SHA, sản phẩm hoặc số lượng",
    configValid ? "PASS" : "INVALID",
  );

  const identityMatches =
    configValid &&
    metrics?.runId === testData.runId &&
    metrics?.gitCommit === testData.gitCommit &&
    metrics?.runner === expectedRunner;
  add(
    "RUN_IDENTITY_MATCH",
    "evidence",
    "Danh tính kết quả đo",
    `${expectedRunner} / ${textOrUnavailable(testData?.runId)} / ${textOrUnavailable(testData?.gitCommit)}`,
    `${textOrUnavailable(metrics?.runner)} / ${textOrUnavailable(metrics?.runId)} / ${textOrUnavailable(metrics?.gitCommit)}`,
    identityMatches ? "PASS" : "INVALID",
  );

  if (configValid && dbData) {
    const expectedOrders = Math.min(testData.initialStock, testData.totalVUs);
    const equality = (
      id: string,
      name: string,
      expected: number,
      observed: number,
    ) =>
      add(
        id,
        "oversell",
        name,
        expected,
        isCount(observed) ? observed : "unavailable",
        !isCount(observed)
          ? "INVALID"
          : observed === expected
            ? "PASS"
            : "FAIL",
      );

    add(
      "NON_NEGATIVE_INVENTORY",
      "oversell",
      "Bất biến tồn kho",
      "stock ≥ reserved ≥ 0 và available = stock − reserved",
      `${dbData.currentStock} / ${dbData.currentReservedStock} / ${dbData.availableStock}`,
      isCount(dbData.currentStock) &&
        isCount(dbData.currentReservedStock) &&
        isCount(dbData.availableStock) &&
        dbData.availableStock ===
          dbData.currentStock - dbData.currentReservedStock
        ? "PASS"
        : "FAIL",
    );
    add(
      "ZERO_OVERSELL",
      "oversell",
      "Số lượng đặt mua trong giới hạn tồn",
      `≤ ${testData.initialStock}`,
      dbData.totalSoldQuantity,
      isCount(dbData.totalSoldQuantity) &&
        dbData.totalSoldQuantity <= testData.initialStock
        ? "PASS"
        : "FAIL",
    );
    equality(
      "STOCK_UNCHANGED",
      "Tồn vật lý ở bước giữ chỗ",
      testData.initialStock,
      dbData.currentStock,
    );
    equality(
      "SOLD_COUNT_MATCH",
      "Số đơn trong PostgreSQL",
      expectedOrders,
      dbData.distinctOrdersCount,
    );
    equality(
      "ORDER_QUANTITY_MATCH",
      "Tổng số lượng đặt mua",
      expectedOrders,
      dbData.totalSoldQuantity,
    );
    equality(
      "PENDING_ORDERS",
      "Đơn ở trạng thái chờ thanh toán",
      expectedOrders,
      dbData.pendingOrdersCount,
    );
    equality(
      "HOLDING_COUNT",
      "Số bản ghi giữ chỗ HOLDING",
      expectedOrders,
      dbData.holdingReservationsCount,
    );
    equality(
      "HOLDING_QUANTITY",
      "Tổng số lượng giữ chỗ",
      expectedOrders,
      dbData.totalHoldingQuantity,
    );
    equality(
      "RESERVATION_CONSISTENT",
      "Reserved stock khớp tổng giữ chỗ",
      dbData.totalHoldingQuantity,
      dbData.currentReservedStock,
    );

    if (identityMatches) {
      for (const [id, name, expected, observed] of [
        [
          "REQUEST_COUNT",
          "Tổng yêu cầu HTTP",
          testData.totalVUs,
          metrics.totalRequests,
        ],
        [
          "HTTP_201",
          "Đơn tạo thành công (HTTP 201)",
          expectedOrders,
          metrics.success201,
        ],
        [
          "HTTP_409",
          "Yêu cầu hết tồn kho (HTTP 409)",
          testData.totalVUs - expectedOrders,
          metrics.conflict409,
        ],
        ["HTTP_UNEXPECTED", "Phản hồi bất thường", 0, metrics.unexpectedErrors],
        [
          "HTTP_DB_MATCH",
          "HTTP 201 khớp số đơn trong PostgreSQL",
          dbData.distinctOrdersCount,
          metrics.success201,
        ],
      ] as const) {
        add(
          id,
          "oversell",
          name,
          expected,
          isCount(observed) ? observed : "unavailable",
          !isCount(observed)
            ? "INVALID"
            : observed === expected
              ? "PASS"
              : "FAIL",
        );
      }
    }
  } else {
    add(
      "DB_DATA_AVAILABLE",
      "oversell",
      "Dữ liệu PostgreSQL",
      "Có fixture hợp lệ",
      "unavailable",
      "INVALID",
    );
  }

  for (const [id, label, max, value] of [
    ["LATENCY_P95", "p95", LOAD_TEST_POLICY.p95MaxMs, metrics?.durationMs?.p95],
    ["LATENCY_P99", "p99", LOAD_TEST_POLICY.p99MaxMs, metrics?.durationMs?.p99],
  ] as const) {
    add(
      id,
      "latency",
      `Độ trễ ${label}`,
      `≤ ${max} ms`,
      isDuration(value) ? `${value.toFixed(1)} ms` : "unavailable",
      !identityMatches || !isDuration(value)
        ? "INVALID"
        : value <= max
          ? "PASS"
          : "FAIL",
    );
  }
  if (
    isDuration(metrics?.durationMs?.p95) &&
    isDuration(metrics?.durationMs?.p99) &&
    metrics.durationMs.p99 < metrics.durationMs.p95
  ) {
    add(
      "PERCENTILE_ORDER",
      "latency",
      "Thứ tự phân vị",
      "p99 ≥ p95",
      "p99 < p95",
      "INVALID",
    );
  }

  const oversellVerdict = verdictFor(
    checks.filter((c) => c.category !== "latency"),
  );
  const latencyVerdict = verdictFor(
    checks.filter((c) => c.category !== "oversell"),
  );
  const verdict = verdictFor(checks);
  return {
    verdict,
    oversellVerdict,
    latencyVerdict,
    allPassed: verdict === "PASS",
    exitCode: verdict === "PASS" ? 0 : 1,
    checks,
    summaryMessage: `NFR-04.1 ${oversellVerdict} · NFR-01 ${latencyVerdict} · Tổng thể ${verdict}`,
    markdownReport: generateMarkdownReport(checks, verdict, input),
  };
}

export function generateMarkdownReport(
  checks: VerificationCheck[],
  verdict: CheckStatus,
  input: OversellVerificationInput,
): string {
  const { testData, metricsSummary: metrics, executedAt } = input;
  const fmtMs = (value: unknown) =>
    isDuration(value) ? `${value.toFixed(1)} ms` : "unavailable";
  const row = (metric: LatencyDurationMs | undefined) =>
    [metric?.p95, metric?.p99].map(fmtMs).join(" | ");
  const safe = (value: string | number) =>
    String(value).replace(/[|\r\n]/g, " ");
  const rows = checks
    .map(
      (check) =>
        `| ${check.name} | ${safe(check.observed)} | ${safe(check.expected)} | ${check.status} |`,
    )
    .join("\n");

  return `# Kiểm thử tải và đối soát tồn kho

- Thời gian UTC ${(executedAt ?? new Date()).toISOString()}
- Lượt chạy \`${safe(textOrUnavailable(testData?.runId))}\`
- Commit \`${safe(textOrUnavailable(testData?.gitCommit))}\`
- Runner \`${safe(textOrUnavailable(metrics?.runner))}\`
- Sản phẩm \`${safe(textOrUnavailable(testData?.productSku ?? testData?.productId))}\`
- NFR-04.1 **${verdictFor(checks.filter((c) => c.category !== "latency"))}**
- NFR-01 **${verdictFor(checks.filter((c) => c.category !== "oversell"))}**
- Kết quả tổng thể **${verdict}**

| Kiểm tra | Quan sát | Kỳ vọng | Kết quả |
|---|---|---|---|
${rows}

| Phản hồi | p95 | p99 |
|---|---|---|
| Toàn bộ | ${row(metrics?.durationMs)} |
| HTTP 201 | ${row(metrics?.duration201Ms)} |
| HTTP 409 hết tồn | ${row(metrics?.duration409Ms)} |

Thông lượng ${isDuration(metrics?.rps) ? `${metrics.rps.toFixed(1)} req/s` : "unavailable"}
`;
}
