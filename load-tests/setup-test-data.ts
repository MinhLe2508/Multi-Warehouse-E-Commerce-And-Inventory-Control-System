import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import {
  JwtService,
  NestFactory,
} from "../backend/test/load-test/dependencies";
import { PrismaModule } from "../backend/src/prisma/prisma.module";
import { PrismaService } from "../backend/src/prisma/prisma.service";
import {
  loadEnvironment,
  OUTPUT_DIR,
  resolveGitCommit,
  TEST_DATA_PATH,
  type LoadTestFixture,
} from "./load-test-fixture";

export const TEST_SKU = "SKU-LOADTEST-OVERSELL";
export const INITIAL_STOCK = 10;
export const TOTAL_CUSTOMERS = 100;
export const RESERVATION_TTL_MINUTES = 15;

export async function setupTestData(): Promise<void> {
  try {
    loadEnvironment();
    if (
      process.env.NODE_ENV === "production" &&
      process.env.ALLOW_LOAD_TEST_SETUP !== "true"
    ) {
      throw new Error("Demo load test yêu cầu môi trường kiểm thử.");
    }
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret)
      throw new Error("Thiếu JWT_ACCESS_SECRET của môi trường kiểm thử.");
    const jwt = new JwtService({ secret });
    const suffix = randomBytes(6).toString("hex");
    const runId =
      process.env.LOAD_TEST_RUN_ID?.trim() || `run_${Date.now()}_${suffix}`;
    const gitCommit = resolveGitCommit();

    const app = await NestFactory.createApplicationContext(PrismaModule, {
      logger: ["error", "warn"],
    });
    try {
      const prisma = app.get(PrismaService);
      const fixture = await prisma.$transaction(
        async (tx): Promise<LoadTestFixture> => {
          const warehouse =
            (await tx.warehouse.findFirst({
              where: { code: "WH-HN01", isActive: true },
            })) ??
            (await tx.warehouse.findFirst({
              where: { isActive: true },
              orderBy: { code: "asc" },
            }));
          if (!warehouse)
            throw new Error("Database kiểm thử cần một kho đang hoạt động.");

          const sku = `${TEST_SKU}-${suffix}`;
          const product = await tx.product.create({
            data: {
              sku,
              slug: sku.toLowerCase(),
              name: "Sản phẩm kiểm thử tranh mua",
              basePrice: "100000.00",
              isActive: true,
            },
          });
          const [inventory] = await tx.$queryRaw<Array<{ id: bigint }>>`
          INSERT INTO inventory (product_id, warehouse_id, stock, reserved_stock, updated_at)
          VALUES (${product.id}::uuid, ${warehouse.id}::uuid, ${INITIAL_STOCK}, 0, NOW())
          RETURNING id
        `;
          const verifiedAt = new Date();
          const customers = await tx.user.createManyAndReturn({
            data: Array.from({ length: TOTAL_CUSTOMERS }, (_, index) => ({
              username: `k6_${suffix}_${index + 1}`,
              email: `k6_${suffix}_${index + 1}@example.test`,
              fullName: `Khách kiểm thử ${index + 1}`,
              passwordHash: "load-test-fixture",
              role: "CUSTOMER",
              isActive: true,
              mustChangePassword: false,
              emailVerifiedAt: verifiedAt,
            })),
            select: { id: true, fullName: true },
          });

          return {
            runId,
            gitCommit,
            productId: product.id,
            productSku: product.sku,
            productName: product.name,
            warehouseId: warehouse.id,
            warehouseRegion: warehouse.region,
            inventoryId: inventory.id.toString(),
            initialStock: INITIAL_STOCK,
            totalVUs: TOTAL_CUSTOMERS,
            ttlMinutes: RESERVATION_TTL_MINUTES,
            targetEndpoint: "/orders",
            localApiUrl: "http://127.0.0.1:3001",
            dockerApiUrl: "http://host.docker.internal:3001",
            users: customers.map((user, index) => ({
              vuIndex: index + 1,
              fullName: user.fullName,
              token: jwt.sign(
                { sub: user.id, type: "access" },
                { expiresIn: "2h" },
              ),
            })),
          };
        },
      );

      mkdirSync(OUTPUT_DIR, { recursive: true });
      const temporary = `${TEST_DATA_PATH}.${suffix}.tmp`;
      writeFileSync(temporary, JSON.stringify(fixture, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporary, TEST_DATA_PATH);
      console.log(
        `Fixture ${runId} · commit ${gitCommit} · ${fixture.totalVUs} tài khoản · ${fixture.initialStock} tồn`,
      );
      console.log(TEST_DATA_PATH);
    } finally {
      await app.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) void setupTestData();
