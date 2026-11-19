import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  loadEnvironment,
  OUTPUT_DIR,
  readLoadFixture,
  summaryPath,
} from "./load-test-fixture";
import { LOAD_TEST_POLICY, type LatencyDurationMs } from "./oversell-verifier";

function summarize(values: number[]): LatencyDurationMs {
  if (!values.length) return {};
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.ceil(p * sorted.length) - 1];
  return {
    min: sorted[0],
    avg: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    med: percentile(0.5),
    max: sorted[sorted.length - 1],
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

export async function runConcurrencyTest(): Promise<void> {
  try {
    loadEnvironment();
    const fixture = readLoadFixture();
    const runner = "node-concurrency-smoke";
    const url = new URL("/orders", process.env.BASE_URL || fixture.localApiUrl);
    const start = performance.now();

    const results = await Promise.all(
      fixture.users.map(async (user) => {
        const sentAt = performance.now();
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.token}`,
            },
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
              items: [{ productId: fixture.productId, quantity: 1 }],
              shippingRecipient: user.fullName,
              shippingPhone: "0912345678",
              shippingAddress: `Địa chỉ kiểm thử ${user.vuIndex}`,
              shippingRegion: fixture.warehouseRegion,
            }),
          });
          const duration = performance.now() - sentAt;
          if (response.status === 201) {
            await response.arrayBuffer();
            return { kind: "success" as const, duration };
          }
          if (response.status === 409) {
            const data = (await response.json().catch(() => null)) as {
              code?: unknown;
            } | null;
            if (data?.code === "INSUFFICIENT_STOCK")
              return { kind: "conflict" as const, duration };
          } else {
            await response.arrayBuffer();
          }
          return { kind: "unexpected" as const, duration };
        } catch {
          return {
            kind: "unexpected" as const,
            duration: performance.now() - sentAt,
          };
        }
      }),
    );

    const totalElapsedMs = performance.now() - start;
    const successes = results.filter(({ kind }) => kind === "success");
    const conflicts = results.filter(({ kind }) => kind === "conflict");
    const durationMs = summarize(results.map(({ duration }) => duration));
    const summary = {
      runId: fixture.runId,
      gitCommit: fixture.gitCommit,
      runner,
      testDate: new Date().toISOString(),
      initialStock: fixture.initialStock,
      totalRequests: results.length,
      success201: successes.length,
      conflict409: conflicts.length,
      unexpectedErrors: results.length - successes.length - conflicts.length,
      totalElapsedMs,
      durationMs,
      duration201Ms: summarize(successes.map(({ duration }) => duration)),
      duration409Ms: summarize(conflicts.map(({ duration }) => duration)),
      rps:
        totalElapsedMs > 0
          ? (results.length * 1000) / totalElapsedMs
          : undefined,
    };

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const file = summaryPath(runner);
    writeFileSync(file, JSON.stringify(summary, null, 2), "utf8");

    const expected = Math.min(fixture.initialStock, fixture.totalVUs);
    const httpPassed =
      summary.totalRequests === fixture.totalVUs &&
      summary.success201 === expected &&
      summary.conflict409 === fixture.totalVUs - expected &&
      summary.unexpectedErrors === 0;
    const latencyPassed =
      durationMs.p95 !== undefined &&
      durationMs.p95 <= LOAD_TEST_POLICY.p95MaxMs &&
      durationMs.p99 !== undefined &&
      durationMs.p99 <= LOAD_TEST_POLICY.p99MaxMs;
    console.log(
      `Node smoke ${fixture.runId} · HTTP ${httpPassed ? "PASS" : "FAIL"} · NFR-01 ${latencyPassed ? "PASS" : "FAIL"}`,
    );
    console.log(
      `HTTP 201 ${summary.success201} · 409 hết tồn ${summary.conflict409} · Lỗi khác ${summary.unexpectedErrors}`,
    );
    console.log(
      `p95 ${durationMs.p95?.toFixed(1) ?? "unavailable"} ms · p99 ${durationMs.p99?.toFixed(1) ?? "unavailable"} ms`,
    );
    console.log(file);
    if (!httpPassed || !latencyPassed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) void runConcurrencyTest();
