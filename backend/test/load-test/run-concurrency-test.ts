/**
 * CONCURRENCY OVERSELL LOAD TEST RUNNER (Node.js / TypeScript)
 * Task 32: Giả lập 100 phiên tranh mua đồng thời trên 1 sản phẩm.
 * Đo trực tiếp NFR-04.1 (Zero Oversell) và NFR-01 (Độ trễ API).
 */

import path from 'node:path';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

interface TestUser {
  vuIndex: number;
  userId: string;
  email: string;
  fullName: string;
  token: string;
}

interface TestData {
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

function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runConcurrencyTest() {
  console.log('============================================================');
  console.log('⚡ [TASK 32] CHẠY LOAD TEST TRANH MUA ĐỒNG THỜI (100 VUs)');
  console.log('============================================================\n');

  const candidatePaths = [
    path.resolve(__dirname, '../../../load-tests/test-data.json'),
    path.resolve(__dirname, 'test-data.json'),
  ];
  let testDataPath = '';
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      testDataPath = p;
      break;
    }
  }

  if (!testDataPath) {
    console.error(
      '❌ Không tìm thấy test-data.json! Hãy chạy setup-test-data.ts trước.',
    );
    process.exit(1);
  }

  const testData = JSON.parse(
    fs.readFileSync(testDataPath, 'utf-8'),
  ) as TestData;
  const apiUrl =
    process.env.BASE_URL || testData.localApiUrl || 'http://127.0.0.1:3001';
  const targetUrl = `${apiUrl}${testData.targetEndpoint}`;

  console.log(`🎯 Mục tiêu API:    ${targetUrl}`);
  console.log(
    `📦 Sản phẩm:        ${testData.productName} (ID: ${testData.productId})`,
  );
  console.log(`🔢 Tồn kho ban đầu: ${testData.initialStock} sản phẩm`);
  console.log(
    `👥 Số VUs tranh mua: ${testData.users.length} tài khoản đồng thời\n`,
  );

  console.log('⏳ Đang phát lệnh bắn 100 requests đồng thời...');

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
        shippingPhone: '0912345678',
        shippingAddress: `Địa chỉ nhận hàng khách ${user.vuIndex}, Hà Nội`,
        shippingRegion: testData.warehouseRegion || 'Miền Bắc',
      };

      const start = performance.now();
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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

  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const minLatency = durations[0] || 0;
  const maxLatency = durations[durations.length - 1] || 0;
  const avgLatency =
    durations.reduce((sum, d) => sum + d, 0) / (durations.length || 1);
  const medLatency = calculatePercentile(durations, 50);
  const p90Latency = calculatePercentile(durations, 90);
  const p95Latency = calculatePercentile(durations, 95);
  const p99Latency = calculatePercentile(durations, 99);

  const rps = (results.length / totalElapsedMs) * 1000;

  console.log('\n============================================================');
  console.log('📊 KẾT QUẢ ĐO LƯỜNG TRỰC TIẾP CONCURRENCY SPIKE TEST');
  console.log('============================================================');
  console.log(`Tổng số requests gửi đi:       ${results.length}`);
  console.log(`Tổng thời gian thực thi:       ${totalElapsedMs.toFixed(1)} ms`);
  console.log(`Throughput (RPS):              ${rps.toFixed(1)} req/s`);
  console.log('------------------------------------------------------------');
  console.log(
    `Đơn hàng tạo thành công (201): ${success201} (Kỳ vọng: ${testData.initialStock})`,
  );
  console.log(
    `Từ chối do hết hàng (409):     ${conflict409} (Kỳ vọng: ${testData.totalVUs - testData.initialStock})`,
  );
  console.log(
    `Lỗi hệ thống bất thường:       ${unexpectedErrors} (Kỳ vọng: 0)`,
  );
  console.log('------------------------------------------------------------');
  console.log('PHÂN BỐ ĐỘ TRỄ PHẢN HỒI (NFR-01):');
  console.log(`  - Min Latency:               ${minLatency.toFixed(1)} ms`);
  console.log(`  - Avg Latency:               ${avgLatency.toFixed(1)} ms`);
  console.log(`  - Median (p50):              ${medLatency.toFixed(1)} ms`);
  console.log(`  - p90 Latency:               ${p90Latency.toFixed(1)} ms`);
  console.log(`  - p95 Latency:               ${p95Latency.toFixed(1)} ms`);
  console.log(`  - p99 Latency:               ${p99Latency.toFixed(1)} ms`);
  console.log(`  - Max Latency:               ${maxLatency.toFixed(1)} ms`);
  console.log('============================================================');

  const zeroOversell =
    success201 === testData.initialStock && unexpectedErrors === 0;
  console.log(
    `\n🎯 ĐÁNH GIÁ NFR-04.1 (0 OVERSELL): ${zeroOversell ? 'PASSED ✅' : 'FAILED ❌'}`,
  );
  console.log(
    `🎯 ĐÁNH GIÁ NFR-01 (ĐỘ TRỄ p95 < 3000ms): ${p95Latency < 3000 ? 'PASSED ✅' : 'FAILED ❌'}\n`,
  );

  const summary = {
    testDate: new Date().toISOString(),
    totalRequests: results.length,
    success201,
    conflict409,
    unexpectedErrors,
    initialStock: testData.initialStock,
    totalElapsedMs,
    durationMs: {
      min: minLatency,
      avg: avgLatency,
      med: medLatency,
      max: maxLatency,
      p90: p90Latency,
      p95: p95Latency,
      p99: p99Latency,
    },
    rps,
  };

  const outputDirs = [
    path.resolve(__dirname, '../../../load-tests'),
    path.resolve(__dirname, '../load-test'),
  ];
  for (const dir of outputDirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const outPath = path.join(dir, 'load-test-summary.json');
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`💾 Đã xuất tổng hợp đo lường ra: ${outPath}`);
  }

  if (!zeroOversell) {
    process.exit(1);
  }
}

void runConcurrencyTest();
