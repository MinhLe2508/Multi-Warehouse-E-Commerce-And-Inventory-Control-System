import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Nạp dữ liệu test đã chuẩn bị từ setup-test-data.ts
const testData = JSON.parse(open('./test-data.json'));

// Custom metrics để đo lường trực tiếp NFR-04.1 và NFR-01 (tách riêng độ trễ 201 và 409)
export const ordersSuccess201 = new Counter('orders_success_201');
export const ordersConflict409 = new Counter('orders_conflict_409');
export const unexpectedErrors = new Counter('unexpected_errors');
export const orderLatencyTrend = new Trend('order_api_duration', true);
export const success201LatencyTrend = new Trend('order_201_duration_ms', true);
export const conflict409LatencyTrend = new Trend('order_409_duration_ms', true);
export const successRate = new Rate('order_success_rate');

export const options = {
  // Bắt buộc cấu hình summaryTrendStats để k6 tính toán và xuất đầy đủ p(50)/med, p(90), p(95), p(99) thật (F110)
  summaryTrendStats: ['min', 'avg', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    oversell_spike_test: {
      executor: 'per-vu-iterations',
      vus: testData.totalVUs || 100,
      iterations: 1,
      maxDuration: '45s',
    },
  },
  thresholds: {
    // NFR-04.1: Với 10 tồn kho ban đầu, chính xác 10 đơn được tạo thành công
    'orders_success_201': [`count==${testData.initialStock}`],
    // Đúng (totalVUs - initialStock) đơn hàng bị từ chối với 409 Conflict
    'orders_conflict_409': [`count==${testData.totalVUs - testData.initialStock}`],
    // 0 lỗi hệ thống bất thường (500, timeout, deadlock)
    'unexpected_errors': ['count==0'],
    // NFR-01: Độ trễ p95 < 3000ms
    'http_req_duration': ['p(95)<3000'],
  },
};

export default function () {
  const vuId = __VU; // 1 -> 100
  const user = testData.users[vuId - 1];

  // Quyết định URL target: Nếu chạy trong container thì dùng dockerApiUrl, nếu ngoài host thì dùng localApiUrl
  const baseUrl = (__ENV.BASE_URL) || testData.dockerApiUrl || 'http://127.0.0.1:3001';
  const url = `${baseUrl}${testData.targetEndpoint}`;

  const payload = JSON.stringify({
    items: [
      {
        productId: testData.productId,
        quantity: 1,
      },
    ],
    shippingRecipient: user ? user.fullName : `Customer ${vuId}`,
    shippingPhone: '0912345678',
    shippingAddress: `Địa chỉ nhận hàng khách ${vuId}, Hà Nội`,
    shippingRegion: testData.warehouseRegion || 'Miền Bắc',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user ? user.token : ''}`,
    },
    timeout: '30s',
  };

  const start = Date.now();
  const res = http.post(url, payload, params);
  const duration = Date.now() - start;
  orderLatencyTrend.add(duration);

  const is201 = res.status === 201;
  const is409 = res.status === 409;
  const isUnexpected = !is201 && !is409;

  if (is201) {
    ordersSuccess201.add(1);
    success201LatencyTrend.add(duration);
    successRate.add(1);
  } else if (is409) {
    ordersConflict409.add(1);
    conflict409LatencyTrend.add(duration);
    successRate.add(0);
  } else {
    unexpectedErrors.add(1);
    console.error(`[VU ${vuId}] Unexpected status: ${res.status} - Body: ${res.body}`);
  }

  check(res, {
    'Status là 201 (Thành công) hoặc 409 (Hết hàng - Insufficient Stock)': (r) =>
      r.status === 201 || r.status === 409,
    'Không xảy ra lỗi hệ thống 500 hoặc Deadlock': (r) => r.status !== 500,
  });
}

function extractTrendValues(metric) {
  const vals = metric && metric.values ? metric.values : {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return {
    min: num(vals.min),
    avg: num(vals.avg),
    med: num(vals.med),
    max: num(vals.max),
    p90: num(vals['p(90)']),
    p95: num(vals['p(95)']),
    // Tuyệt đối không thay thế p99 bị thiếu bằng 0 (F110)
    p99: num(vals['p(99)']),
  };
}

function fmtMs(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)} ms` : 'unavailable';
}

export function handleSummary(data) {
  const durationMs = extractTrendValues(data.metrics.http_req_duration);
  const duration201Ms = extractTrendValues(data.metrics.order_201_duration_ms);
  const duration409Ms = extractTrendValues(data.metrics.order_409_duration_ms);
  const s201 = data.metrics.orders_success_201 ? data.metrics.orders_success_201.values.count : 0;
  const c409 = data.metrics.orders_conflict_409 ? data.metrics.orders_conflict_409.values.count : 0;
  const errs = data.metrics.unexpected_errors ? data.metrics.unexpected_errors.values.count : 0;
  const total = s201 + c409 + errs;

  const summary = {
    runId: (__ENV.LOAD_TEST_RUN_ID) || testData.runId || 'unknown-run',
    gitCommit: (__ENV.GIT_COMMIT) || testData.gitCommit || 'unknown',
    runner: 'k6',
    testDate: new Date().toISOString(),
    totalRequests: total,
    success201: s201,
    conflict409: c409,
    unexpectedErrors: errs,
    initialStock: testData.initialStock,
    durationMs,
    duration201Ms,
    duration409Ms,
    rps: data.metrics.http_reqs ? data.metrics.http_reqs.values.rate : 0,
  };

  return {
    'stdout': `
============================================================
🎯 K6 CONCURRENCY OVERSELL LOAD TEST SUMMARY (RunId: ${summary.runId})
============================================================
Total VUs / Requests:      ${total}
Success Orders (HTTP 201): ${s201} (Expected: ${testData.initialStock})
Conflict Rejections (409): ${c409} (Expected: ${testData.totalVUs - testData.initialStock})
Unexpected Errors (500):   ${errs} (Expected: 0)
------------------------------------------------------------
NFR-04.1 (Zero Oversell):  ${s201 === testData.initialStock && errs === 0 ? 'PASSED ✅' : 'FAILED ❌'}
NFR-01 Latency Metrics (Overall):
  - Min: ${fmtMs(durationMs.min)}
  - Avg: ${fmtMs(durationMs.avg)}
  - Med: ${fmtMs(durationMs.med)}
  - p90: ${fmtMs(durationMs.p90)}
  - p95: ${fmtMs(durationMs.p95)}
  - p99: ${fmtMs(durationMs.p99)}
  - Max: ${fmtMs(durationMs.max)}
============================================================
`,
    '/scripts/load-test-summary.json': JSON.stringify(summary, null, 2),
    './load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
