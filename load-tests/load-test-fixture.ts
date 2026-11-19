import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LoadTestRunner, TestDataConfig } from "./oversell-verifier";

export const TEST_DATA_PATH = join(__dirname, "test-data.json");
export const OUTPUT_DIR = join(__dirname, ".generated");

export interface LoadTestFixture extends TestDataConfig {
  productName: string;
  warehouseId: string;
  warehouseRegion: string;
  inventoryId: string;
  ttlMinutes: number;
  targetEndpoint: "/orders";
  localApiUrl: string;
  dockerApiUrl: string;
  users: Array<{ vuIndex: number; fullName: string; token: string }>;
}

export function loadEnvironment(): void {
  const path = resolve(__dirname, "../.env");
  if (existsSync(path)) process.loadEnvFile(path);
}

export function selectLoadTestDatabase(preparing = false): void {
  const explicitUrl = process.env.LOAD_TEST_DATABASE_URL?.trim();
  const connection = explicitUrl || process.env.DATABASE_URL?.trim();
  let database: URL;
  try {
    database = new URL(connection ?? "");
    if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.pathname.slice(1)) {
      throw new Error("invalid database");
    }
  } catch {
    throw new Error("Cần URL PostgreSQL của môi trường kiểm thử.");
  }

  if (
    preparing &&
    !explicitUrl &&
    (process.env.ALLOW_LOAD_TEST_SETUP !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
  ) {
    throw new Error("Đặt LOAD_TEST_DATABASE_URL hoặc bật ALLOW_LOAD_TEST_SETUP=true cho PostgreSQL local.");
  }
  process.env.DATABASE_URL = database.href;
}

export function resolveGitCommit(): string {
  let commit = process.env.GIT_COMMIT?.trim() ?? "";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: resolve(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    // GIT_COMMIT supports a source archive with no .git directory.
  }
  if (!/^[0-9a-f]{7,40}$/i.test(commit))
    throw new Error("Thiếu SHA của commit kiểm thử.");
  return commit;
}

export function readLoadFixture(): LoadTestFixture {
  if (!existsSync(TEST_DATA_PATH)) {
    throw new Error("Thiếu test-data.json. Chạy npm run test:load:setup.");
  }
  const data = JSON.parse(
    readFileSync(TEST_DATA_PATH, "utf8"),
  ) as LoadTestFixture;
  if (
    !data ||
    typeof data.runId !== "string" ||
    !data.runId.trim() ||
    data.gitCommit !== resolveGitCommit() ||
    !data.productId ||
    !data.warehouseId ||
    typeof data.inventoryId !== "string" ||
    !/^[1-9]\d{0,18}$/.test(data.inventoryId) ||
    !Number.isSafeInteger(data.initialStock) ||
    data.initialStock < 0 ||
    !Number.isSafeInteger(data.totalVUs) ||
    data.totalVUs <= 0 ||
    data.targetEndpoint !== "/orders" ||
    !Array.isArray(data.users) ||
    data.users.length !== data.totalVUs ||
    data.users.some(
      (user) => !user || typeof user.token !== "string" || !user.token,
    )
  ) {
    throw new Error(
      "Fixture thiếu dữ kiện hoặc sai commit. Tạo fixture mới bằng npm run test:load:setup.",
    );
  }
  return data;
}

export function summaryPath(runner: LoadTestRunner): string {
  return join(OUTPUT_DIR, `${runner}-summary.json`);
}
