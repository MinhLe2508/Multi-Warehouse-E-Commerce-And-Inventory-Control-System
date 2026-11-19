import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const fixture = JSON.parse(open('./test-data.json'));
const policy = JSON.parse(open('./load-test-policy.json'));
if (!fixture.runId || !/^[0-9a-f]{7,40}$/i.test(fixture.gitCommit || '') ||
    !Number.isSafeInteger(fixture.totalVUs) || fixture.totalVUs <= 0 ||
    !Number.isSafeInteger(fixture.initialStock) || fixture.initialStock < 0 ||
    fixture.targetEndpoint !== '/orders' || !Array.isArray(fixture.users) ||
    fixture.users.length !== fixture.totalVUs || fixture.users.some((user) => !user?.token) ||
    (__ENV.LOAD_TEST_RUN_ID && __ENV.LOAD_TEST_RUN_ID !== fixture.runId) ||
    (__ENV.GIT_COMMIT && __ENV.GIT_COMMIT !== fixture.gitCommit)) {
  throw new Error('Fixture không hợp lệ hoặc sai lượt chạy. Chạy npm run test:load:setup.');
}

const success = new Counter('orders_success_201');
const conflict = new Counter('orders_conflict_409');
const unexpected = new Counter('unexpected_errors');
const successLatency = new Trend('order_201_duration_ms', true);
const conflictLatency = new Trend('order_409_duration_ms', true);
const expectedOrders = Math.min(fixture.initialStock, fixture.totalVUs);
const expectedConflicts = fixture.totalVUs - expectedOrders;

export const options = {
  summaryTrendStats: ['min', 'avg', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    oversell_spike_test: {
      executor: 'per-vu-iterations',
      vus: fixture.totalVUs,
      iterations: 1,
      maxDuration: '45s',
    },
  },
  thresholds: {
    http_reqs: [`count==${fixture.totalVUs}`],
    orders_success_201: [`count==${expectedOrders}`],
    orders_conflict_409: [`count==${expectedConflicts}`],
    unexpected_errors: ['count==0'],
    http_req_duration: [`p(95)<=${policy.p95MaxMs}`, `p(99)<=${policy.p99MaxMs}`],
  },
};

export default function () {
  const user = fixture.users[__VU - 1];
  const baseUrl = (__ENV.BASE_URL || fixture.dockerApiUrl).replace(/\/+$/, '');
  const response = http.post(`${baseUrl}/orders`, JSON.stringify({
    items: [{ productId: fixture.productId, quantity: 1 }],
    shippingRecipient: user.fullName,
    shippingPhone: '0912345678',
    shippingAddress: `Địa chỉ kiểm thử ${user.vuIndex}`,
    shippingRegion: fixture.warehouseRegion,
  }), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    timeout: '30s',
    redirects: 0,
  });

  const isSuccess = response.status === 201;
  let isConflict = false;
  if (response.status === 409) {
    try {
      isConflict = response.json('code') === 'INSUFFICIENT_STOCK';
    } catch {
      // An unreadable response is counted as unexpected.
    }
  }

  success.add(Number(isSuccess));
  conflict.add(Number(isConflict));
  unexpected.add(Number(!isSuccess && !isConflict));
  if (isSuccess) successLatency.add(response.timings.duration);
  if (isConflict) conflictLatency.add(response.timings.duration);
  check(response, { 'HTTP 201 hoặc 409 INSUFFICIENT_STOCK': () => isSuccess || isConflict });
}

function summarize(metric) {
  const values = metric?.values ?? {};
  const numeric = (value) => Number.isFinite(value) ? value : undefined;
  return {
    min: numeric(values.min),
    avg: numeric(values.avg),
    med: numeric(values.med),
    max: numeric(values.max),
    p90: numeric(values['p(90)']),
    p95: numeric(values['p(95)']),
    p99: numeric(values['p(99)']),
  };
}

export function handleSummary(data) {
  const counts = data.metrics;
  const summary = {
    runId: fixture.runId,
    gitCommit: fixture.gitCommit,
    runner: 'k6',
    testDate: new Date().toISOString(),
    initialStock: fixture.initialStock,
    totalRequests: counts.http_reqs?.values.count,
    success201: counts.orders_success_201?.values.count,
    conflict409: counts.orders_conflict_409?.values.count,
    unexpectedErrors: counts.unexpected_errors?.values.count,
    durationMs: summarize(counts.http_req_duration),
    duration201Ms: summarize(counts.order_201_duration_ms),
    duration409Ms: summarize(counts.order_409_duration_ms),
    rps: counts.http_reqs?.values.rate,
  };
  const text = `Lượt k6 ${summary.runId} · SHA ${summary.gitCommit}\n` +
    `HTTP ${summary.totalRequests ?? 'unavailable'} · 201 ${summary.success201 ?? 'unavailable'} · 409 hết tồn ${summary.conflict409 ?? 'unavailable'} · Lỗi khác ${summary.unexpectedErrors ?? 'unavailable'}\n` +
    `p95 ${summary.durationMs.p95?.toFixed(1) ?? 'unavailable'} ms · p99 ${summary.durationMs.p99?.toFixed(1) ?? 'unavailable'} ms\n` +
    'Chạy npm run test:load:verify để đối soát PostgreSQL.\n';
  return {
    stdout: text,
    './.generated/k6-summary.json': JSON.stringify(summary, null, 2),
  };
}
