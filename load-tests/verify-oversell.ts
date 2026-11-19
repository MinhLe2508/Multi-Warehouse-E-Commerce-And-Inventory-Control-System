import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { NestFactory } from "../backend/test/load-test/dependencies";
import { PrismaModule } from "../backend/src/prisma/prisma.module";
import { PrismaService } from "../backend/src/prisma/prisma.service";
import {
  loadEnvironment,
  OUTPUT_DIR,
  readLoadFixture,
  selectLoadTestDatabase,
  summaryPath,
} from "./load-test-fixture";
import {
  evaluateOversell,
  type DatabaseState,
  type LoadTestRunner,
  type MetricsSummaryPayload,
} from "./oversell-verifier";

export async function verifyOversell(): Promise<void> {
  try {
    loadEnvironment();
    selectLoadTestDatabase();
    const { values } = parseArgs({
      options: { runner: { type: "string", default: "k6" } },
    });
    if (values.runner !== "k6" && values.runner !== "node-concurrency-smoke") {
      throw new Error("Runner hỗ trợ: k6 hoặc node-concurrency-smoke.");
    }
    const runner: LoadTestRunner = values.runner;
    const fixture = readLoadFixture();
    const path = summaryPath(runner);
    let metrics: MetricsSummaryPayload | null = null;
    if (existsSync(path)) {
      try {
        metrics = JSON.parse(
          readFileSync(path, "utf8"),
        ) as MetricsSummaryPayload;
      } catch {
        console.error(`Tệp kết quả đo không phải JSON hợp lệ: ${path}`);
      }
    }

    const app = await NestFactory.createApplicationContext(PrismaModule, {
      logger: ["error", "warn"],
    });
    try {
      const prisma = app.get(PrismaService);
      const inventoryId = BigInt(fixture.inventoryId);
      const dbData = await prisma.$transaction(
        async (tx): Promise<DatabaseState | null> => {
          const inventory = await tx.inventory.findFirst({
            where: {
              id: inventoryId,
              productId: fixture.productId,
              warehouseId: fixture.warehouseId,
            },
            select: { stock: true, reservedStock: true, availableStock: true },
          });
          if (!inventory) return null;

          const items = await tx.orderItem.findMany({
            where: {
              inventoryId,
              productId: fixture.productId,
              warehouseId: fixture.warehouseId,
            },
            select: {
              quantity: true,
              order: { select: { id: true, status: true } },
            },
          });
          const holdings = await tx.stockReservation.aggregate({
            where: { inventoryId, status: "HOLDING" },
            _count: { id: true },
            _sum: { quantity: true },
          });
          return {
            currentStock: inventory.stock,
            currentReservedStock: inventory.reservedStock,
            availableStock: inventory.availableStock,
            distinctOrdersCount: new Set(items.map(({ order }) => order.id))
              .size,
            pendingOrdersCount: new Set(
              items
                .filter(({ order }) => order.status === "PENDING_PAYMENT")
                .map(({ order }) => order.id),
            ).size,
            totalSoldQuantity: items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            ),
            holdingReservationsCount: holdings._count.id,
            totalHoldingQuantity: holdings._sum.quantity ?? 0,
          };
        },
        { isolationLevel: "RepeatableRead" },
      );

      const result = evaluateOversell({
        testData: fixture,
        dbData,
        metricsSummary: metrics,
        expectedRunner: runner,
      });
      mkdirSync(OUTPUT_DIR, { recursive: true });
      const report = join(OUTPUT_DIR, `${runner}-report.md`);
      writeFileSync(report, result.markdownReport, "utf8");
      for (const check of result.checks) {
        console.log(
          `[${check.status}] ${check.name} · đo ${check.observed} · kỳ vọng ${check.expected}`,
        );
      }
      console.log(result.summaryMessage);
      console.log(report);
      if (result.exitCode) process.exitCode = result.exitCode;
    } finally {
      await app.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) void verifyOversell();
