import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Nạp dữ liệu test đã chuẩn bị từ setup-test-data.ts
const testData = JSON.parse(open('./test-data.json'));

// Custom metrics để đo lường trực tiếp NFR-04.1 và NFR-01
export const ordersSuccess201 = new Counter('orders_success_201');
export const ordersConflict409 = new Counter('orders_conflict_409');
export const unexpectedErrors = new Counter('unexpected_errors');
export const orderLatencyTrend = new Trend('order_api_duration', true);
export const successRate = new Rate('order_success_rate');

export const options = {
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
    successRate.add(1);
  } else if (is409) {
    ordersConflict409.add(1);
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

export function handleSummary(data) {
  const reqDuration = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
  const s201 = data.metrics.orders_success_201 ? data.metrics.orders_success_201.values.count : 0;
  const c409 = data.metrics.orders_conflict_409 ? data.metrics.orders_conflict_409.values.count : 0;
  const errs = data.metrics.unexpected_errors ? data.metrics.unexpected_errors.values.count : 0;
  const total = s201 + c409 + errs;

  const summary = {
    testDate: new Date().toISOString(),
    totalRequests: total,
    success201: s201,
    conflict409: c409,
    unexpectedErrors: errs,
    initialStock: testData.initialStock,
    durationMs: {
      min: reqDuration.min || 0,
      avg: reqDuration.avg || 0,
      med: reqDuration.med || 0,
      max: reqDuration.max || 0,
      p90: reqDuration['p(90)'] || 0,
      p95: reqDuration['p(95)'] || 0,
      p99: reqDuration['p(99)'] || 0,
    },
    rps: (data.metrics.http_reqs ? data.metrics.http_reqs.values.rate : 0),
  };

  return {
    'stdout': `
============================================================
🎯 K6 CONCURRENCY OVERSELL LOAD TEST SUMMARY
============================================================
Total VUs / Requests:      ${total}
Success Orders (HTTP 201): ${s201} (Expected: ${testData.initialStock})
Conflict Rejections (409): ${c409} (Expected: ${testData.totalVUs - testData.initialStock})
Unexpected Errors (500):   ${errs} (Expected: 0)
------------------------------------------------------------
NFR-04.1 (Zero Oversell):  ${s201 === testData.initialStock && errs === 0 ? 'PASSED ✅' : 'FAILED ❌'}
NFR-01 Latency Metrics:
  - Min: ${reqDuration.min ? reqDuration.min.toFixed(1) : 0} ms
  - Avg: ${reqDuration.avg ? reqDuration.avg.toFixed(1) : 0} ms
  - Med: ${reqDuration.med ? reqDuration.med.toFixed(1) : 0} ms
  - p90: ${reqDuration['p(90)'] ? reqDuration['p(90)'].toFixed(1) : 0} ms
  - p95: ${reqDuration['p(95)'] ? reqDuration['p(95)'].toFixed(1) : 0} ms
  - p99: ${reqDuration['p(99)'] ? reqDuration['p(99)'].toFixed(1) : 0} ms
  - Max: ${reqDuration.max ? reqDuration.max.toFixed(1) : 0} ms
============================================================
`,
    '/scripts/load-test-summary.json': JSON.stringify(summary, null, 2),
    './load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
