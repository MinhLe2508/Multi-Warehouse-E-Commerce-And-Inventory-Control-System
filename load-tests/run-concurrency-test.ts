/**
 * CONCURRENCY OVERSELL LOAD TEST RUNNER (Node.js / TypeScript)
 * Task 32: Giả lập 100 phiên tranh mua đồng thời trên 1 sản phẩm.
 * Đo trực tiếp NFR-04.1 (Zero Oversell) và NFR-01 (Độ trễ API).
 */

import path from "node:path";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

interface TestUser {
  vuIndex: number;
  userId: string;
  email: string;
  fullName: string;
  token: string;
}

interface TestData {
  runId?: string;
  gitCommit?: string;
  productId: string;
  productSku: string;
  productName: string;
  initialStock: number;
  totalVUs: number;
  targetEndpoint: string;
  localApiUrl: string;
  warehouseRegion: string;
  users: TestUser[];
}

interface RequestResult {
  vuIndex: number;
  status: number;
  durationMs: number;
  error?: string;
  data?: unknown;
}

function calculatePercentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function summarizeDurations(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return {
      min: undefined,
      avg: undefined,
      med: undefined,
      max: undefined,
      p90: undefined,
      p95: undefined,
      p99: undefined,
    };
  }
  return {
    min: sorted[0],
    avg: sorted.reduce((s, d) => s + d, 0) / sorted.length,
    med: calculatePercentile(sorted, 50),
    max: sorted[sorted.length - 1],
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  };
}

export async function runConcurrencyTest() {
  console.log("============================================================");
  console.log("⚡ [TASK 32] CHẠY NODE SMOKE CONCURRENCY RUNNER (100 VUs)");
  console.log("============================================================\n");

  const candidatePaths = [
    path.resolve(__dirname, "../../../load-tests/test-data.json"),
    path.resolve(__dirname, "test-data.json"),
  ];
  let testDataPath = "";
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      testDataPath = p;
      break;
    }
  }

  if (!testDataPath) {
    console.error(
      "❌ Không tìm thấy test-data.json! Hãy chạy setup-test-data.ts trước.",
    );
    process.exit(1);
  }

  const testData = JSON.parse(
    fs.readFileSync(testDataPath, "utf-8"),
  ) as TestData;
  const apiUrl =
    process.env.BASE_URL || testData.localApiUrl || "http://127.0.0.1:3001";
  const targetUrl = `${apiUrl}${testData.targetEndpoint}`;

  console.log(`🎯 Mục tiêu API:    ${targetUrl}`);
  console.log(
    `📦 Sản phẩm:        ${testData.productName} (ID: ${testData.productId})`,
  );
  console.log(`🔢 Tồn kho ban đầu: ${testData.initialStock} sản phẩm`);
  console.log(
    `👥 Số VUs tranh mua: ${testData.users.length} tài khoản đồng thời\n`,
  );

  console.log("⏳ Đang phát lệnh bắn 100 requests đồng thời...");

  const overallStartTime = performance.now();

  const promises: Promise<RequestResult>[] = testData.users.map((user) => {
    return (async (): Promise<RequestResult> => {
      const payload = {
        items: [
          {
            productId: testData.productId,
            quantity: 1,
          },
        ],
        shippingRecipient: user.fullName,
        shippingPhone: "0912345678",
        shippingAddress: `Địa chỉ nhận hàng khách ${user.vuIndex}, Hà Nội`,
        shippingRegion: testData.warehouseRegion || "Miền Bắc",
      };

      const start = performance.now();
      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify(payload),
        });

        const durationMs = performance.now() - start;
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          // ignore json parse error
        }

        return {
          vuIndex: user.vuIndex,
          status: response.status,
          durationMs,
          data: body,
        };
      } catch (err: unknown) {
        const durationMs = performance.now() - start;
        return {
          vuIndex: user.vuIndex,
          status: 0,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })();
  });

  const results = await Promise.all(promises);
  const overallEndTime = performance.now();
  const totalElapsedMs = overallEndTime - overallStartTime;

  const success201 = results.filter((r) => r.status === 201).length;
  const conflict409 = results.filter((r) => r.status === 409).length;
  const unexpectedErrors = results.filter(
    (r) => r.status !== 201 && r.status !== 409,
  ).length;

  if (unexpectedErrors > 0) {
    const errorDetails = results
      .filter((r) => r.status !== 201 && r.status !== 409)
      .slice(0, 5)
      .map((r) => `[HTTP ${r.status}] ${JSON.stringify(r.data || r.error)}`);
    console.log("Chi tiết lỗi bất thường (mẫu 5 requests):", errorDetails);
  }

  const durationMs = summarizeDurations(results.map((r) => r.durationMs));
  const duration201Ms = summarizeDurations(
    results.filter((r) => r.status === 201).map((r) => r.durationMs),
  );
  const duration409Ms = summarizeDurations(
    results.filter((r) => r.status === 409).map((r) => r.durationMs),
  );
  const minLatency = durationMs.min ?? 0;
  const maxLatency = durationMs.max ?? 0;
  const avgLatency = durationMs.avg ?? 0;
  const medLatency = durationMs.med ?? 0;
  const p90Latency = durationMs.p90 ?? 0;
  const p95Latency = durationMs.p95 ?? 0;
  const p99Latency = durationMs.p99 ?? 0;

  const rps = (results.length / totalElapsedMs) * 1000;

  console.log("\n============================================================");
  console.log(
    `📊 KẾT QUẢ ĐO LƯỜNG CONCURRENCY SMOKE TEST (RunId: ${testData.runId ?? "unknown"})`,
  );
  console.log("============================================================");
  console.log(`Runner:                        node-concurrency-smoke`);
  console.log(`Tổng số requests gửi đi:       ${results.length}`);
  console.log(`Tổng thời gian thực thi:       ${totalElapsedMs.toFixed(1)} ms`);
  console.log(`Throughput (RPS):              ${rps.toFixed(1)} req/s`);
  console.log("------------------------------------------------------------");
  console.log(
    `Đơn hàng tạo thành công (201): ${success201} (Kỳ vọng: ${testData.initialStock})`,
  );
  console.log(
    `Từ chối do hết hàng (409):     ${conflict409} (Kỳ vọng: ${testData.totalVUs - testData.initialStock})`,
  );
  console.log(
    `Lỗi hệ thống bất thường:       ${unexpectedErrors} (Kỳ vọng: 0)`,
  );
  console.log("------------------------------------------------------------");
  console.log("PHÂN BỐ ĐỘ TRỄ PHẢN HỒI (NFR-01):");
  console.log(`  - Min Latency:               ${minLatency.toFixed(1)} ms`);
  console.log(`  - Avg Latency:               ${avgLatency.toFixed(1)} ms`);
  console.log(`  - Median (p50):              ${medLatency.toFixed(1)} ms`);
  console.log(`  - p90 Latency:               ${p90Latency.toFixed(1)} ms`);
  console.log(`  - p95 Latency:               ${p95Latency.toFixed(1)} ms`);
  console.log(`  - p99 Latency:               ${p99Latency.toFixed(1)} ms`);
  console.log(`  - Max Latency:               ${maxLatency.toFixed(1)} ms`);
  console.log("============================================================");

  const zeroOversell =
    success201 === testData.initialStock &&
    conflict409 === testData.totalVUs - testData.initialStock &&
    unexpectedErrors === 0;
  console.log(
    `\n🎯 ĐÁNH GIÁ HTTP SMOKE (Cần chạy thêm verify-oversell để hậu kiểm DB): ${zeroOversell ? "PASSED ✅" : "FAILED ❌"}`,
  );
  console.log(
    `🎯 ĐÁNH GIÁ NFR-01 (ĐỘ TRỄ p95 < 3000ms): ${p95Latency < 3000 ? "PASSED ✅" : "FAILED ❌"}\n`,
  );

  const summary = {
    runId: testData.runId ?? "unknown-run",
    gitCommit: testData.gitCommit ?? "unknown",
    runner: "node-concurrency-smoke",
    testDate: new Date().toISOString(),
    totalRequests: results.length,
    success201,
    conflict409,
    unexpectedErrors,
    initialStock: testData.initialStock,
    totalElapsedMs,
    durationMs,
    duration201Ms,
    duration409Ms,
    rps,
  };

  const outPath = path.resolve(__dirname, "load-test-summary.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`💾 Đã xuất tổng hợp đo lường canonical ra: ${outPath}`);

  if (!zeroOversell || p95Latency >= 3000) {
    process.exit(1);
  }
}

if (require.main === module) {
  void runConcurrencyTest();
}
