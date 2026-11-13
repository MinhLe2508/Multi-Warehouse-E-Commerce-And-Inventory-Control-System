// =============================================================================
// Kiểm thử Tuần 6 — Huy & Khang (STT 31 & STT 33)
// - STT 31: Chạy lại script DDL + hàm fn_reserve_stock trên PostgreSQL 16.15,
//           xác nhận 0 lỗi; đối chiếu mục 9.1–9.4 tài liệu CSDL & ERD.
// - STT 33: Kiểm thử cron ReservationCleanupJob: tính idempotent (chạy lần 2
//           không trừ reserved_stock thêm), index idx_res_cleanup được sử dụng
//           đúng (Index Scan), hủy đơn PENDING_PAYMENT -> CANCELLED (EXPIRED).
//
// Cách chạy:
//   1. Kiểm tra tĩnh & mô phỏng (không cần DB):
//      node --test test/week6-huy-khang.integration.cjs
//   2. Kiểm tra đầy đủ trên PostgreSQL 16.15 thật (database rỗng/tạm):
//      $env:WEEK6_TEST_DATABASE_URL='postgresql://postgres:pass@127.0.0.1:55439/postgres'
//      node --test test/week6-huy-khang.integration.cjs
// =============================================================================

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const ddlPath = path.join(repoRoot, 'backend/prisma/ddl.sql');
const mig1Path = path.join(
  repoRoot,
  'backend/prisma/migrations/20261008010100_init/migration.sql',
);
const mig2Path = path.join(
  repoRoot,
  'backend/prisma/migrations/20261008012516_manual_constraints_and_functions/migration.sql',
);
const cleanupJobSourcePath = path.join(
  repoRoot,
  'backend/src/inventory/reservation-cleanup.job.ts',
);

test('STT 31 (Static) — Đối chiếu script DDL và migrations với mục 9.1–9.4 tài liệu CSDL & ERD', async (t) => {
  const ddl = fs.readFileSync(ddlPath, 'utf8');
  const mig1 = fs.readFileSync(mig1Path, 'utf8');
  const mig2 = fs.readFileSync(mig2Path, 'utf8');

  await t.test(
    'Mục 9.1: Đủ 18 bảng, 10 ENUM, 25 FK, 62 Index, 11 trigger updated_at, 20 CHECK (+1 đã gỡ ở mục 9.4)',
    () => {
      const tables = ddl.match(/CREATE TABLE\s+\w+/g) ?? [];
      const enums = ddl.match(/CREATE TYPE\s+\w+\s+AS ENUM/g) ?? [];
      const fks = ddl.match(/REFERENCES\s+\w+\s*\(/g) ?? [];
      const checks = ddl.match(/CONSTRAINT\s+chk_\w+\s+CHECK/g) ?? [];
      const createIndexes =
        ddl.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+/g) ?? [];
      const inlineUniques =
        ddl.match(/\bNOT NULL UNIQUE\b|CONSTRAINT\s+uq_\w+\s+UNIQUE/g) ?? [];

      assert.equal(tables.length, 18, 'Phải có đúng 18 bảng BASE TABLE');
      assert.equal(enums.length, 10, 'Phải có đúng 10 kiểu ENUM');
      assert.equal(fks.length, 25, 'Phải có đúng 25 khóa ngoại');
      assert.equal(
        checks.length,
        20,
        'Phải có 20 CHECK thực tế (21 thiết kế ban đầu trừ 1 CHECK gỡ ở mục 9.4)',
      );
      assert.equal(
        tables.length + inlineUniques.length + createIndexes.length,
        62,
        'Tổng số index trong pg_indexes phải bằng 62 (18 PK + 11 UNIQUE + 33 CREATE INDEX)',
      );
    },
  );

  await t.test(
    'Mục 9.2 & 10.2: Hàm fn_reserve_stock và trigger ctrg_reservation_consistency chống reservation ma',
    () => {
      for (const sql of [ddl, mig2]) {
        assert.match(
          sql,
          /CREATE OR REPLACE FUNCTION fn_reserve_stock\(\s*p_inventory_id\s+BIGINT,\s*p_order_id\s+UUID,\s*p_quantity\s+INTEGER,\s*p_ttl_minutes\s+INTEGER DEFAULT 15\s*\)\s*RETURNS BIGINT/s,
        );
        assert.ok(sql.includes('SELECT available_stock INTO v_available'));
        assert.ok(sql.includes('FOR UPDATE;'));
        assert.ok(
          sql.includes(
            "RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0002';",
          ),
        );
        assert.ok(
          sql.includes(
            "RAISE EXCEPTION 'INSUFFICIENT_STOCK: con % can %', v_available, p_quantity",
          ),
        );
        assert.ok(
          sql.includes('CREATE CONSTRAINT TRIGGER ctrg_reservation_consistency'),
        );
      }
    },
  );

  await t.test(
    'Mục 9.3 & 9.4: Có partial index idx_res_cleanup và đã gỡ bỏ CHECK (expires_at > created_at)',
    () => {
      assert.match(
        ddl,
        /CREATE INDEX\s+idx_res_cleanup\s+ON\s+stock_reservations\(expires_at\)\s+WHERE\s+status\s*=\s*'HOLDING'/i,
      );
      assert.match(
        mig2,
        /CREATE INDEX\s+"idx_res_cleanup"\s+ON\s+"stock_reservations"\("expires_at"\)\s+WHERE\s+"status"\s*=\s*'HOLDING'/i,
      );
      assert.doesNotMatch(
        ddl,
        /CONSTRAINT\s+\w+\s+CHECK\s*\(\s*expires_at\s*>\s*created_at\s*\)/i,
      );
      assert.doesNotMatch(
        mig1 + '\n' + mig2,
        /CHECK\s*\(\s*"?expires_at"?\s*>\s*"?created_at"?\s*\)/i,
      );
    },
  );
});

test('STT 33 (Static) — ReservationCleanupJob truy vấn đúng idx_res_cleanup, hủy đơn EXPIRED và đảm bảo idempotent', () => {
  const src = fs.readFileSync(cleanupJobSourcePath, 'utf8');
  assert.ok(
    src.includes("WHERE r.status = 'HOLDING'") &&
      src.includes('AND r.expires_at <= NOW()'),
    'Phải lọc trực tiếp trên stock_reservations theo điều kiện của partial index idx_res_cleanup',
  );
  assert.ok(
    src.includes('FOR UPDATE OF i SKIP LOCKED') &&
      src.includes('FOR UPDATE SKIP LOCKED'),
    'Phải dùng FOR UPDATE SKIP LOCKED trên cả inventory và stock_reservations',
  );
  assert.ok(
    src.includes("status: 'CANCELLED'") &&
      src.includes("cancelledReason: 'EXPIRED'") &&
      src.includes("toStatus: 'CANCELLED'"),
    'Phải chuyển đơn PENDING_PAYMENT hết hạn sang CANCELLED với lý do EXPIRED và ghi order_status_history',
  );
});

const dbUrl =
  process.env.WEEK6_TEST_DATABASE_URL || process.env.WEEK3_TEST_DATABASE_URL;

test(
  'STT 31 & STT 33 (Live PostgreSQL 16.15) — Thực thi DDL, fn_reserve_stock, ReservationCleanupJob idempotent & Index Scan idx_res_cleanup',
  { skip: !dbUrl ? 'Đặt WEEK6_TEST_DATABASE_URL tới database PostgreSQL 16.15 rỗng để chạy kiểm thử thực tế' : false },
  async (t) => {
    const { Pool } = require('pg');
    const { PrismaClient } = require('@prisma/client');
    const { PrismaPg } = require('@prisma/adapter-pg');
    const {
      ReservationCleanupJob,
    } = require('../dist/inventory/reservation-cleanup.job');

    const pool = new Pool({ connectionString: dbUrl, max: 10 });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
    });
    t.after(async () => {
      await prisma.$disconnect();
      await pool.end();
    });

    // 1. Kiểm tra trên schema riêng biệt cho ddl.sql thuần (Mục 9.1 & 10.1-10.2)
    await t.test(
      'STT 31 / Mục 9.1: Chạy script ddl.sql + fn_reserve_stock 0 lỗi, khớp số lượng đối tượng mục 9.1',
      async () => {
        await pool.query('DROP SCHEMA IF EXISTS week6_ddl_check CASCADE;');
        await pool.query('CREATE SCHEMA week6_ddl_check;');
        const client = await pool.connect();
        try {
          await client.query('SET search_path TO week6_ddl_check, public;');
          const ddlSql = fs.readFileSync(ddlPath, 'utf8');
          await client.query(ddlSql);

          const tablesCount = (
            await client.query(
              "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_schema = 'week6_ddl_check' AND table_type = 'BASE TABLE'",
            )
          ).rows[0].c;
          const enumsCount = (
            await client.query(
              "SELECT count(*)::int AS c FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'week6_ddl_check' AND t.typtype = 'e'",
            )
          ).rows[0].c;
          const indexesCount = (
            await client.query(
              "SELECT count(*)::int AS c FROM pg_indexes WHERE schemaname = 'week6_ddl_check'",
            )
          ).rows[0].c;
          const checksCount = (
            await client.query(
              "SELECT count(*)::int AS c FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'week6_ddl_check' AND c.contype = 'c'",
            )
          ).rows[0].c;
          const fksCount = (
            await client.query(
              "SELECT count(*)::int AS c FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'week6_ddl_check' AND c.contype = 'f'",
            )
          ).rows[0].c;
          const updatedAtTriggers = (
            await client.query(
              "SELECT count(*)::int AS c FROM pg_trigger tg JOIN pg_class cl ON cl.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'week6_ddl_check' AND tg.tgname = 'set_updated_at' AND NOT tg.tgisinternal",
            )
          ).rows[0].c;

          assert.equal(tablesCount, 18);
          assert.equal(enumsCount, 10);
          assert.equal(indexesCount, 62);
          assert.equal(checksCount, 20); // 21 thiết kế ban đầu - 1 ràng buộc đã gỡ ở mục 9.4
          assert.equal(fksCount, 25);
          assert.equal(updatedAtTriggers, 11);
        } finally {
          await client.query('SET search_path TO public;');
          client.release();
          await pool.query('DROP SCHEMA IF EXISTS week6_ddl_check CASCADE;');
        }
      },
    );

    // 2. Khởi tạo public schema từ migrations nếu database đang rỗng
    const existingTables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'",
    );
    if (existingTables.rowCount === 0) {
      for (const name of [
        '20261008010100_init',
        '20261008012516_manual_constraints_and_functions',
        '20261010070413_auth_account_onboarding',
        '20261020081832_add_product_cost_price',
      ]) {
        await pool.query(
          fs.readFileSync(
            path.join(__dirname, '../prisma/migrations', name, 'migration.sql'),
            'utf8',
          ),
        );
      }
    }

    const suffix = Date.now().toString();
    const userId = (
      await pool.query(
        `INSERT INTO users(email, username, password_hash, full_name, must_change_password, email_verified_at, updated_at)
         VALUES ($1, $2, 'unused', 'Week6 Tester', false, NOW(), NOW()) RETURNING id`,
        [`w6-${suffix}@example.test`, `w6user_${suffix}`],
      )
    ).rows[0].id;
    const whId = (
      await pool.query(
        `INSERT INTO warehouses(code, name, region, updated_at)
         VALUES ($1, 'Kho HCM Test', 'Miền Nam', NOW()) RETURNING id`,
        [`WH-W6-${suffix.slice(-6)}`],
      )
    ).rows[0].id;

    // 3. Mục 9.2: Hai khách tranh 1 đơn vị tồn kho cuối cùng qua fn_reserve_stock
    await t.test(
      'STT 31 / Mục 9.2: 2 phiên song song tranh 1 đơn vị cuối cùng qua fn_reserve_stock -> 1 COMMIT, 1 INSUFFICIENT_STOCK (23514), 0 reservation ma',
      async () => {
        const prodId = (
          await pool.query(
            `INSERT INTO products(sku, name, slug, base_price, updated_at)
             VALUES ($1, 'SKU 1001 Test', $1, 100000, NOW()) RETURNING id`,
            [`SKU-1001-${suffix}`],
          )
        ).rows[0].id;
        const invId = (
          await pool.query(
            `INSERT INTO inventory(product_id, warehouse_id, stock, updated_at)
             VALUES ($1, $2, 1, NOW()) RETURNING id`,
            [prodId, whId],
          )
        ).rows[0].id;

        const attemptReserve = async (label) => {
          const c = await pool.connect();
          try {
            await c.query('BEGIN');
            const ordId = (
              await c.query(
                `INSERT INTO orders(order_code, user_id, shipping_recipient, shipping_phone, shipping_address, updated_at)
                 VALUES ($1, $2, 'Khach', '0900000000', 'HCM', NOW()) RETURNING id`,
                [`ORD-92-${label}-${suffix}`, userId],
              )
            ).rows[0].id;
            await c.query(
              'SELECT fn_reserve_stock($1::bigint, $2::uuid, 1, 15)',
              [invId, ordId],
            );
            await c.query('COMMIT');
            return { status: 'committed', ordId };
          } catch (err) {
            await c.query('ROLLBACK');
            throw err;
          } finally {
            c.release();
          }
        };

        const results = await Promise.allSettled([
          attemptReserve('A'),
          attemptReserve('B'),
        ]);
        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.code, '23514');
        assert.match(rejected[0].reason.message, /INSUFFICIENT_STOCK/);

        const invRow = (
          await pool.query(
            'SELECT stock, reserved_stock, available_stock FROM inventory WHERE id = $1',
            [invId],
          )
        ).rows[0];
        assert.deepEqual(invRow, {
          stock: 1,
          reserved_stock: 1,
          available_stock: 0,
        });

        const holdingCount = (
          await pool.query(
            "SELECT count(*)::int AS n FROM stock_reservations WHERE inventory_id = $1 AND status = 'HOLDING'",
            [invId],
          )
        ).rows[0].n;
        assert.equal(holdingCount, 1);
      },
    );

    // 4. STT 33 & Mục 9.3 + 9.4: Kiểm thử cron ReservationCleanupJob (idempotent, hủy đơn EXPIRED, Index Scan idx_res_cleanup)
    await t.test(
      'STT 33 / Mục 9.3 & 9.4: ReservationCleanupJob giải phóng reserved_stock, hủy đơn EXPIRED, idempotent lần 2 và dùng Index Scan using idx_res_cleanup',
      async () => {
        const prodId = (
          await pool.query(
            `INSERT INTO products(sku, name, slug, base_price, updated_at)
             VALUES ($1, 'SKU Cleanup Test', $1, 200000, NOW()) RETURNING id`,
            [`SKU-93-${suffix}`],
          )
        ).rows[0].id;
        const invId = (
          await pool.query(
            `INSERT INTO inventory(product_id, warehouse_id, stock, updated_at)
             VALUES ($1, $2, 10, NOW()) RETURNING id`,
            [prodId, whId],
          )
        ).rows[0].id;
        const ordId = (
          await pool.query(
            `INSERT INTO orders(order_code, user_id, status, shipping_recipient, shipping_phone, shipping_address, updated_at)
             VALUES ($1, $2, 'PENDING_PAYMENT', 'Khach Cleanup', '0900000000', 'HCM', NOW()) RETURNING id`,
            [`ORD-93-${suffix}`, userId],
          )
        ).rows[0].id;

        // Mục 9.4: Lùi expires_at về quá khứ (-5 phút) mà không bị chặn bởi CHECK (expires_at > created_at)
        await pool.query(
          'SELECT fn_reserve_stock($1::bigint, $2::uuid, 1, -5)',
          [invId, ordId],
        );

        // Nạp thêm dữ liệu lịch sử đã COMMITTED để bảng đủ lớn cho Planner chọn Index Scan tự nhiên
        await pool.query(
          `INSERT INTO stock_reservations (order_id, inventory_id, quantity, status, expires_at, committed_at, updated_at)
           SELECT $1::uuid, $2::bigint, 1, 'COMMITTED', NOW() - (g || ' minutes')::interval, NOW(), NOW()
           FROM generate_series(1, 300) AS g`,
          [ordId, invId],
        );
        await pool.query('ANALYZE stock_reservations;');

        // Kiểm tra kế hoạch thực thi dùng idx_res_cleanup
        const explainRows = (
          await pool.query(
            `EXPLAIN (ANALYZE, COSTS OFF, FORMAT TEXT)
             SELECT DISTINCT r.inventory_id
               FROM stock_reservations r
              WHERE r.status = 'HOLDING'
                AND r.expires_at <= NOW()
              ORDER BY r.inventory_id ASC
              LIMIT 100`,
          )
        ).rows.map((r) => r['QUERY PLAN']);
        const planText = explainRows.join('\n');
        assert.match(
          planText,
          /idx_res_cleanup/,
          `Kế hoạch thực thi phải dùng idx_res_cleanup, nhận được:\n${planText}`,
        );

        const job = new ReservationCleanupJob(prisma);

        // Chạy lần 1: giải phóng đúng 1 reservation HOLDING quá hạn
        const run1 = await job.cleanupExpired();
        assert.equal(run1, 1);

        const invAfter1 = (
          await pool.query(
            'SELECT stock, reserved_stock, available_stock FROM inventory WHERE id = $1',
            [invId],
          )
        ).rows[0];
        assert.deepEqual(invAfter1, {
          stock: 10,
          reserved_stock: 0,
          available_stock: 10,
        });

        const ordAfter1 = (
          await pool.query(
            'SELECT status, cancelled_reason, cancelled_at FROM orders WHERE id = $1',
            [ordId],
          )
        ).rows[0];
        assert.equal(ordAfter1.status, 'CANCELLED');
        assert.equal(ordAfter1.cancelled_reason, 'EXPIRED');
        assert.ok(ordAfter1.cancelled_at);

        const historyRows = (
          await pool.query(
            'SELECT from_status, to_status, reason FROM order_status_history WHERE order_id = $1',
            [ordId],
          )
        ).rows;
        assert.deepEqual(historyRows, [
          {
            from_status: 'PENDING_PAYMENT',
            to_status: 'CANCELLED',
            reason: 'EXPIRED',
          },
        ]);

        // Chạy lần 2 (Idempotent): trả về 0, không trừ reserved_stock thêm
        const run2 = await job.cleanupExpired();
        assert.equal(run2, 0);

        const invAfter2 = (
          await pool.query(
            'SELECT stock, reserved_stock, available_stock FROM inventory WHERE id = $1',
            [invId],
          )
        ).rows[0];
        assert.deepEqual(invAfter2, {
          stock: 10,
          reserved_stock: 0,
          available_stock: 10,
        });

        const auditCount = (
          await pool.query(
            "SELECT count(*)::int AS n FROM inventory_audit_log WHERE inventory_id = $1 AND reason = 'EXPIRE'",
            [invId],
          )
        ).rows[0].n;
        assert.equal(auditCount, 1);
      },
    );
  },
);
