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
//   2. Kiểm tra PostgreSQL 16.15 thật (tài khoản có CREATEDB, extensions):
//      $env:WEEK6_TEST_DATABASE_URL='postgresql://postgres:pass@127.0.0.1:55439/postgres'
//      npm run test:week6:db
// Test tạo/xóa database riêng; không ghi vào public schema của URL đầu vào.
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

      const triggerLoop = ddl.match(/FOREACH t IN ARRAY ARRAY\[\s*([^\]]+)\]/s);
      assert.equal((triggerLoop?.[1].match(/'\w+'/g) ?? []).length, 11);
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
          sql.includes(
            'CREATE CONSTRAINT TRIGGER ctrg_reservation_consistency',
          ),
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

// Source checks above are only baseline checks. They do not prove locking,
// planner choices or rollback; the following tests use a real PostgreSQL server.
const dbUrl = process.env.WEEK6_TEST_DATABASE_URL;
const requireDb = process.argv.includes('--require-db');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

async function bounded(promise, ms = 5000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(10);
  }
  assert.fail(message);
}

function planNodes(plan) {
  return [plan, ...(plan.Plans ?? []).flatMap(planNodes)];
}

test(
  'STT 31 & 33 — PostgreSQL live (isolated temporary database)',
  {
    skip:
      !dbUrl && !requireDb
        ? 'Chỉ kiểm tra tĩnh; chạy npm run test:week6:db với WEEK6_TEST_DATABASE_URL để kiểm tra DB'
        : false,
    timeout: 120000,
  },
  async (t) => {
    assert.ok(
      dbUrl,
      'Thiếu WEEK6_TEST_DATABASE_URL; chưa chạy kiểm thử PostgreSQL.',
    );
    const { Pool } = require('pg');
    const { PrismaClient, UserRole } = require('@prisma/client');
    const { PrismaPg } = require('@prisma/adapter-pg');
    const {
      ReservationCleanupJob,
      RESERVATION_CLEANUP_CANDIDATES_SQL,
    } = require('../dist/inventory/reservation-cleanup.job');
    const { InventoryService } = require('../dist/inventory/inventory.service');
    const {
      InventoryAlertService,
    } = require('../dist/inventory/inventory-alert.service');
    const {
      StockReservationService,
    } = require('../dist/stock-reservation/stock-reservation.service');
    const {
      PrismaInventoryStockAdapter,
    } = require('../dist/stock-reservation/prisma-inventory-stock.adapter');
    const {
      PrismaReservationRepository,
    } = require('../dist/stock-reservation/prisma-reservation.repository');
    const { PaymentsService } = require('../dist/payments/payments.service');
    const {
      MockPaymentGatewayService,
    } = require('../dist/payments/mock-payment-gateway.service');

    const admin = new Pool({
      connectionString: dbUrl,
      max: 2,
      connectionTimeoutMillis: 5000,
    });
    // Only this internally generated identifier is interpolated into DDL.
    const dbName = `cnpm_week6_${randomUUID().replaceAll('-', '')}`;
    assert.match(dbName, /^cnpm_week6_[a-f0-9]{32}$/);
    let created = false;
    let pool;
    let prisma;
    t.after(async () => {
      try {
        await prisma?.$disconnect();
        await pool?.end();
      } finally {
        try {
          if (created)
            await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
        } finally {
          await admin.end();
        }
      }
    });
    const server = (await admin.query('SHOW server_version_num')).rows[0]
      .server_version_num;
    assert.equal(
      server,
      process.env.WEEK6_EXPECTED_SERVER_VERSION_NUM ?? '160015',
      'Sai phiên bản PostgreSQL so với bản nghiệm thu.',
    );
    t.diagnostic(
      `server_version_num=${server}; database kiểm thử riêng, tự xóa sau khi chạy`,
    );
    await admin.query(`CREATE DATABASE "${dbName}" TEMPLATE template0`);
    created = true;
    const isolated = new URL(dbUrl);
    isolated.pathname = `/${dbName}`;
    // Do not inherit a schema/search_path from an application DATABASE_URL.
    isolated.searchParams.delete('schema');
    isolated.searchParams.delete('options');
    const connectionString = isolated.toString();
    pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
    });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const {
      InventoryChangeEmitter,
    } = require('../dist/inventory/inventory-change-emitter.service');
    const emitted = [];
    const changes = new InventoryChangeEmitter(prisma, {
      notifyInventoryChanged: async (event) => {
        emitted.push(event);
      },
    });
    const job = new ReservationCleanupJob(prisma, changes);
    const alerts = new InventoryAlertService();
    const inventoryService = new InventoryService(prisma, alerts, changes);

    await t.test(
      'DDL baseline: 18 tables / 10 ENUM / 25 FK / 62 indexes / 20 CHECK / 11 updated_at triggers, fn_reserve_stock runs',
      async () => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query(
            'CREATE SCHEMA week6_ddl_check; SET LOCAL search_path TO week6_ddl_check, public',
          );
          await c.query(fs.readFileSync(ddlPath, 'utf8'));
          const catalog = (
            await c.query(`SELECT
        (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='week6_ddl_check' AND table_type='BASE TABLE') AS tables,
        (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='week6_ddl_check' AND t.typtype='e') AS enums,
        (SELECT count(*)::int FROM pg_indexes WHERE schemaname='week6_ddl_check') AS indexes,
        (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='week6_ddl_check' AND c.contype='c') AS checks,
        (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='week6_ddl_check' AND c.contype='f') AS fks,
        (SELECT count(*)::int FROM pg_trigger tg JOIN pg_class cl ON cl.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='week6_ddl_check' AND tg.tgname='set_updated_at' AND NOT tg.tgisinternal) AS updated
      `)
          ).rows[0];
          assert.deepEqual(catalog, {
            tables: 18,
            enums: 10,
            indexes: 62,
            checks: 20,
            fks: 25,
            updated: 11,
          });
          const user = (
            await c.query(
              "INSERT INTO users(email,password_hash,full_name) VALUES('ddl@example.test','unused','DDL') RETURNING id",
            )
          ).rows[0].id;
          const wh = (
            await c.query(
              "INSERT INTO warehouses(code,name,region) VALUES('DDL','DDL','VN') RETURNING id",
            )
          ).rows[0].id;
          const prod = (
            await c.query(
              "INSERT INTO products(sku,name,slug,base_price) VALUES('DDL','DDL','ddl',1) RETURNING id",
            )
          ).rows[0].id;
          const inv = (
            await c.query(
              'INSERT INTO inventory(product_id,warehouse_id,stock) VALUES($1,$2,1) RETURNING id',
              [prod, wh],
            )
          ).rows[0].id;
          const order = (
            await c.query(
              "INSERT INTO orders(order_code,user_id,shipping_recipient,shipping_phone,shipping_address) VALUES('DDL',$1,'DDL','0900000000','VN') RETURNING id",
              [user],
            )
          ).rows[0].id;
          await c.query('SELECT fn_reserve_stock($1::bigint,$2::uuid,1,15)', [
            inv,
            order,
          ]);
          assert.deepEqual(
            (
              await c.query(
                'SELECT stock,reserved_stock,available_stock FROM inventory WHERE id=$1',
                [inv],
              )
            ).rows[0],
            { stock: 1, reserved_stock: 1, available_stock: 0 },
          );
          await c.query('SET CONSTRAINTS ALL IMMEDIATE');
        } finally {
          await c.query('ROLLBACK');
          c.release();
        }
      },
    );

    // Replay every checked-in migration, in timestamp order, in the empty DB.
    const migrationsRoot = path.join(__dirname, '../prisma/migrations');
    const migrations = fs
      .readdirSync(migrationsRoot, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          fs.existsSync(path.join(migrationsRoot, d.name, 'migration.sql')),
      )
      .map((d) => d.name)
      .sort();
    assert.ok(migrations.length >= 4);
    for (const migration of migrations)
      await pool.query(
        fs.readFileSync(
          path.join(migrationsRoot, migration, 'migration.sql'),
          'utf8',
        ),
      );
    t.diagnostic(`Migrations: ${migrations.join(', ')}`);

    async function fresh() {
      emitted.length = 0;
      await pool.query('TRUNCATE users, warehouses, products CASCADE');
      const userId = (
        await pool.query(
          "INSERT INTO users(email,username,password_hash,full_name,must_change_password,email_verified_at,updated_at,role) VALUES('week6@example.test','week6','unused','Week6',false,NOW(),NOW(),'ADMIN') RETURNING id",
        )
      ).rows[0].id;
      const whId = (
        await pool.query(
          "INSERT INTO warehouses(code,name,region,updated_at,default_low_stock_threshold) VALUES('WH-W6','Week6','VN',NOW(),0) RETURNING id",
        )
      ).rows[0].id;
      async function inventory(stock = 10) {
        const tag = randomUUID();
        const product = (
          await pool.query(
            'INSERT INTO products(sku,name,slug,base_price,cost_price,updated_at) VALUES($1,$1,$1,100000,50000,NOW()) RETURNING id',
            [tag],
          )
        ).rows[0].id;
        return (
          await pool.query(
            'INSERT INTO inventory(product_id,warehouse_id,stock,updated_at) VALUES($1,$2,$3,NOW()) RETURNING id',
            [product, whId, stock],
          )
        ).rows[0].id;
      }
      async function order(allocations, ttl = -5) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const id = (
            await c.query(
              "INSERT INTO orders(order_code,user_id,shipping_recipient,shipping_phone,shipping_address,subtotal,grand_total,updated_at) VALUES($1,$2,'Week6','0900000000','VN',100000,100000,NOW()) RETURNING id",
              [randomUUID().replaceAll('-', ''), userId],
            )
          ).rows[0].id;
          for (const [inv, qty] of [...allocations].sort((a, b) =>
            BigInt(a[0]) < BigInt(b[0]) ? -1 : 1,
          )) {
            await c.query(
              'SELECT fn_reserve_stock($1::bigint,$2::uuid,$3::integer,$4::integer)',
              [inv, id, qty, ttl],
            );
          }
          await c.query(
            'UPDATE orders SET reservation_expires_at=(SELECT min(expires_at) FROM stock_reservations WHERE order_id=$1) WHERE id=$1',
            [id],
          );
          await c.query('COMMIT');
          return id;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      }
      return { userId, whId, inventory, order };
    }
    async function scenario(name, run) {
      await t.test(name, async (sub) => run(await fresh(), sub));
    }
    async function snapshot() {
      const tables = [
        'orders',
        'order_items',
        'notifications',
        'inventory',
        'stock_reservations',
        'inventory_audit_log',
        'order_status_history',
        'stock_alerts',
        'payments',
      ];
      const result = {};
      for (const table of tables)
        result[table] = (
          await pool.query(`SELECT * FROM ${table} ORDER BY id`)
        ).rows;
      return result;
    }
    async function assertCancelled(orderId) {
      const row = (
        await pool.query(
          'SELECT status,cancelled_reason,cancelled_at FROM orders WHERE id=$1',
          [orderId],
        )
      ).rows[0];
      assert.equal(row.status, 'CANCELLED');
      assert.equal(row.cancelled_reason, 'EXPIRED');
      assert.ok(row.cancelled_at);
      assert.deepEqual(
        (
          await pool.query(
            'SELECT from_status,to_status,reason FROM order_status_history WHERE order_id=$1',
            [orderId],
          )
        ).rows,
        [
          {
            from_status: 'PENDING_PAYMENT',
            to_status: 'CANCELLED',
            reason: 'EXPIRED',
          },
        ],
      );
    }
    async function blocker() {
      const c = await pool.connect();
      await c.query('BEGIN');
      const pid = (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return {
        c,
        pid,
        release: async () => {
          await c.query('ROLLBACK');
          c.release();
        },
      };
    }
    async function waitBlocked(pid) {
      await waitUntil(
        async () =>
          (
            await pool.query(
              'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))) AS blocked',
              [pid],
            )
          ).rows[0].blocked,
        'Worker chưa tới điểm chờ khóa inventory',
      );
    }

    await scenario(
      'fn_reserve_stock: 2 transactions tranh 1 sản phẩm, 1 commit / 1 lỗi 23514, không có order/reservation ma',
      async (f) => {
        const inv = await f.inventory(1);
        const results = await Promise.allSettled([
          f.order([[inv, 1]], 15),
          f.order([[inv, 1]], 15),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        const rejected = results.find((r) => r.status === 'rejected');
        assert.equal(rejected.reason.code, '23514');
        assert.match(rejected.reason.message, /INSUFFICIENT_STOCK/);
        assert.deepEqual(
          (
            await pool.query(
              'SELECT stock,reserved_stock,available_stock FROM inventory WHERE id=$1',
              [inv],
            )
          ).rows[0],
          { stock: 1, reserved_stock: 1, available_stock: 0 },
        );
        assert.equal(
          (await pool.query('SELECT count(*)::int AS n FROM orders')).rows[0].n,
          1,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM stock_reservations WHERE status='HOLDING'",
            )
          ).rows[0].n,
          1,
        );
      },
    );

    await scenario(
      'cleanup: trả kho, đóng cảnh báo, hủy đơn và chạy lần 2 không đổi bất kỳ audit/history/timestamp nào',
      async (f) => {
        const inv = await f.inventory(10);
        const id = await f.order([[inv, 10]]);
        await prisma.$transaction((tx) => alerts.evaluate(tx, [BigInt(inv)]));
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM stock_alerts WHERE status='OPEN'",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(await job.cleanupExpired(), 1);
        await assertCancelled(id);
        assert.deepEqual(
          (
            await pool.query(
              'SELECT stock,reserved_stock,available_stock FROM inventory WHERE id=$1',
              [inv],
            )
          ).rows[0],
          { stock: 10, reserved_stock: 0, available_stock: 10 },
        );
        assert.equal(
          (await pool.query('SELECT status FROM stock_reservations')).rows[0]
            .status,
          'EXPIRED',
        );
        assert.equal(
          (await pool.query('SELECT status FROM stock_alerts')).rows[0].status,
          'RESOLVED',
        );
        assert.equal(
          (await pool.query('SELECT quantity_delta FROM inventory_audit_log'))
            .rows[0].quantity_delta,
          0,
        );
        const once = await snapshot();
        assert.equal(await job.cleanupExpired(), 0);
        assert.deepEqual(await snapshot(), once);
      },
    );

    await scenario(
      'Order đang bị khóa: bỏ qua toàn bộ, lần sau vẫn expire và hủy được',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]]);
        const before = await snapshot();
        const lock = await blocker();
        let run;
        try {
          await lock.c.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE', [
            id,
          ]);
          run = job.cleanupExpired();
          assert.equal(await bounded(run, 3000), 0);
          assert.deepEqual(await snapshot(), before);
        } finally {
          await lock.release();
          if (run) await run;
        }
        assert.equal(await job.cleanupExpired(), 1);
        await assertCancelled(id);
      },
    );

    await scenario(
      'Recovery: reservation đã EXPIRED nhưng Order còn PENDING, không trừ kho/audit thêm',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]]);
        await pool.query(
          "UPDATE stock_reservations SET status='EXPIRED',released_at=NOW() WHERE order_id=$1",
          [id],
        );
        await pool.query('UPDATE inventory SET reserved_stock=0 WHERE id=$1', [
          inv,
        ]);
        assert.equal(await job.cleanupExpired(), 0);
        await assertCancelled(id);
        assert.equal(
          (
            await pool.query(
              'SELECT count(*)::int AS n FROM inventory_audit_log',
            )
          ).rows[0].n,
          0,
        );
        const once = await snapshot();
        assert.equal(await job.cleanupExpired(), 0);
        assert.deepEqual(await snapshot(), once);
      },
    );

    await scenario(
      'Hai worker thực sự chồng lấn: worker A chờ inventory, worker B bỏ qua Order đã claim',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]]);
        const lock = await blocker();
        let run;
        try {
          await lock.c.query(
            'SELECT id FROM inventory WHERE id=$1 FOR UPDATE',
            [inv],
          );
          run = job.cleanupExpired();
          await waitBlocked(lock.pid);
          assert.equal(
            await bounded(
              new ReservationCleanupJob(prisma, changes).cleanupExpired(),
              3000,
            ),
            0,
          );
        } finally {
          await lock.release();
        }
        assert.equal(await bounded(run), 1);
        await assertCancelled(id);
        const once = await snapshot();
        await job.cleanupExpired();
        assert.deepEqual(await snapshot(), once);
      },
    );

    await scenario(
      'Đơn nhiều inventory / hạn khác nhau: chỉ giải phóng phần hết hạn, giữ Order tới khi hết toàn bộ',
      async (f) => {
        const a = await f.inventory();
        const b = await f.inventory();
        const id = await f.order([
          [a, 2],
          [b, 3],
        ]);
        await pool.query(
          "UPDATE stock_reservations SET expires_at=clock_timestamp()+interval '15 minutes' WHERE inventory_id=$1",
          [b],
        );
        assert.equal(await job.cleanupExpired(), 1);
        assert.equal(
          (await pool.query('SELECT status FROM orders WHERE id=$1', [id]))
            .rows[0].status,
          'PENDING_PAYMENT',
        );
        assert.equal(
          (
            await pool.query(
              'SELECT reserved_stock FROM inventory WHERE id=$1',
              [b],
            )
          ).rows[0].reserved_stock,
          3,
        );
        await pool.query(
          "UPDATE stock_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE inventory_id=$1",
          [b],
        );
        assert.equal(await job.cleanupExpired(), 1);
        await assertCancelled(id);
      },
    );

    await scenario(
      'Hạn TTL qua trong lúc đợi inventory: quyết định bằng giờ DB sau khóa',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]]);
        await pool.query('SELECT fn_reserve_stock($1::bigint,$2::uuid,1,15)', [
          inv,
          id,
        ]);
        await pool.query(
          "UPDATE stock_reservations SET expires_at=clock_timestamp()+interval '300 milliseconds' WHERE id=(SELECT max(id) FROM stock_reservations)",
        );
        const lock = await blocker();
        let run;
        try {
          await lock.c.query(
            'SELECT id FROM inventory WHERE id=$1 FOR UPDATE',
            [inv],
          );
          run = job.cleanupExpired();
          await waitBlocked(lock.pid);
          await waitUntil(
            async () =>
              (
                await pool.query(
                  'SELECT bool_and(expires_at<=clock_timestamp()) AS expired FROM stock_reservations',
                )
              ).rows[0].expired,
            'TTL chưa qua',
          );
        } finally {
          await lock.release();
        }
        assert.equal(await bounded(run), 2);
        await assertCancelled(id);
      },
    );

    await scenario(
      'Lỗi ghi history SAU cập nhật tồn: PostgreSQL rollback toàn bộ rồi retry thành công',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]]);
        const before = await snapshot();
        await pool.query(
          "CREATE FUNCTION w6_fail_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'W6_HISTORY_FAILURE'; END $$; CREATE TRIGGER w6_fail_history BEFORE INSERT ON order_status_history FOR EACH ROW EXECUTE FUNCTION w6_fail_history()",
        );
        try {
          await assert.rejects(job.cleanupExpired(), /W6_HISTORY_FAILURE/);
          assert.deepEqual(await snapshot(), before);
        } finally {
          await pool.query(
            'DROP TRIGGER w6_fail_history ON order_status_history; DROP FUNCTION w6_fail_history()',
          );
        }
        assert.equal(await job.cleanupExpired(), 1);
        await assertCancelled(id);
      },
    );

    await scenario(
      'Lỗi đánh giá cảnh báo SAU stock/order/history: rollback thật, không có dữ liệu ghi dở',
      async (f) => {
        const inv = await f.inventory();
        await f.order([[inv, 1]]);
        const before = await snapshot();
        const failing = new ReservationCleanupJob(prisma, changes, {
          evaluate: async () => {
            throw new Error('W6_ALERT_FAILURE');
          },
        });
        await assert.rejects(failing.cleanupExpired(), /W6_ALERT_FAILURE/);
        assert.deepEqual(await snapshot(), before);
      },
    );

    await scenario(
      '501 reservations của một đơn: xử lý nguyên đơn, không cắt ở LIMIT 500 cũ',
      async (f) => {
        const inv = await f.inventory(1000);
        const id = await f.order([]);
        await pool.query(
          'SELECT fn_reserve_stock($1::bigint,$2::uuid,1,-5) FROM generate_series(1,501)',
          [inv, id],
        );
        assert.equal(await job.cleanupExpired(), 501);
        await assertCancelled(id);
        assert.equal(
          (
            await pool.query(
              'SELECT reserved_stock FROM inventory WHERE id=$1',
              [inv],
            )
          ).rows[0].reserved_stock,
          0,
        );
      },
    );

    await scenario(
      '101 đơn: giới hạn 100 đơn mỗi batch và lần kế tiếp xử lý phần còn lại',
      async (f) => {
        const inv = await f.inventory(200);
        for (let i = 0; i < 101; i++) await f.order([[inv, 1]]);
        assert.equal(await job.cleanupExpired(), 100);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM orders WHERE status='PENDING_PAYMENT'",
            )
          ).rows[0].n,
          1,
        );
        assert.equal(await job.cleanupExpired(), 1);
        assert.equal(
          (
            await pool.query(
              'SELECT count(*)::int AS n FROM order_status_history',
            )
          ).rows[0].n,
          101,
        );
      },
    );

    await scenario(
      'Thanh toán thực tế hoàn tất: cron không đổi CONFIRMED / COMMITTED / SUCCESS',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]], 15);
        const stock = new StockReservationService(
          new PrismaInventoryStockAdapter(alerts),
          new PrismaReservationRepository(),
        );
        const payment = new PaymentsService(
          prisma,
          stock,
          new MockPaymentGatewayService(),
          changes,
        );
        assert.equal(
          (await payment.process(f.userId, id, randomUUID(), 'MOCK_CARD', true))
            .orderStatus,
          'CONFIRMED',
        );
        const before = await snapshot();
        assert.equal(await job.cleanupExpired(), 0);
        assert.deepEqual(await snapshot(), before);
        assert.deepEqual(
          (
            await pool.query(
              'SELECT stock,reserved_stock FROM inventory WHERE id=$1',
              [inv],
            )
          ).rows[0],
          { stock: 9, reserved_stock: 0 },
        );
      },
    );

    await scenario(
      'Payment giữ Order qua TTL: cron bỏ qua; payment rollback vì hết hạn; cron sau hủy đúng',
      async (f) => {
        const inv = await f.inventory();
        const id = await f.order([[inv, 1]], 15);
        await pool.query(
          "UPDATE stock_reservations SET expires_at=clock_timestamp()+interval '300 milliseconds'",
        );
        const stock = new StockReservationService(
          new PrismaInventoryStockAdapter(alerts),
          new PrismaReservationRepository(),
        );
        let unblock;
        let reached;
        const gate = new Promise((resolve) => {
          unblock = resolve;
        });
        const entered = new Promise((resolve) => {
          reached = resolve;
        });
        const commit = stock.commitForOrder.bind(stock);
        stock.commitForOrder = async (...args) => {
          reached();
          await gate;
          return commit(...args);
        };
        const payment = new PaymentsService(
          prisma,
          stock,
          new MockPaymentGatewayService(),
          changes,
        );
        // Attach a rejection handler immediately, before waiting on the barrier.
        const result = payment
          .process(f.userId, id, randomUUID(), 'MOCK_CARD', true)
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
        try {
          await bounded(entered);
          await waitUntil(
            async () =>
              (
                await pool.query(
                  'SELECT bool_and(expires_at<=clock_timestamp()) AS expired FROM stock_reservations',
                )
              ).rows[0].expired,
            'TTL chưa qua',
          );
          assert.equal(await bounded(job.cleanupExpired(), 3000), 0);
        } finally {
          unblock();
        }
        assert.ok(
          (await bounded(result)).error,
          'Thanh toán phải bị từ chối sau TTL',
        );
        assert.equal(
          (await pool.query('SELECT count(*)::int AS n FROM payments')).rows[0]
            .n,
          0,
        );
        assert.equal(await job.cleanupExpired(), 1);
        await assertCancelled(id);
      },
    );

    await scenario(
      'InventoryService: SQLSTATE CHECK qua Prisma 7 thành HTTP 409 và rollback dữ liệu',
      async (f) => {
        const inv = await f.inventory();
        const before = await snapshot();
        // A direct internal call deliberately reaches the DB CHECK; HTTP DTO
        // validation rejects this input earlier in the normal request flow.
        await assert.rejects(
          inventoryService.updateStock(inv, { threshold: -1 }, f.userId),
          (error) => error.getStatus?.() === 409,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );

    await scenario(
      'InventoryService: hai lần nhập vào hai SKU cùng kho không vượt capacity',
      async (f) => {
        const a = await f.inventory(5);
        const b = await f.inventory(5);
        await pool.query('UPDATE warehouses SET capacity=11 WHERE id=$1', [
          f.whId,
        ]);
        const results = await Promise.allSettled([
          inventoryService.restock(a, { quantity: 1 }, f.userId),
          inventoryService.restock(b, { quantity: 1 }, f.userId),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
        assert.equal(
          results.find((r) => r.status === 'rejected').reason.getStatus(),
          409,
        );
        assert.equal(
          (await pool.query('SELECT sum(stock)::int AS total FROM inventory'))
            .rows[0].total,
          11,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM inventory_audit_log WHERE reason='RESTOCK'",
            )
          ).rows[0].n,
          1,
        );
      },
    );

    await scenario(
      'InventoryService: không kiểm kê dưới reserved, BIGINT string, ẩn giá vốn và kho inactive với STAFF',
      async (f) => {
        const inv = await f.inventory();
        await f.order([[inv, 2]], 15);
        await assert.rejects(
          inventoryService.updateStock(inv, { stock: 1 }, f.userId),
          (e) => e.getStatus() === 409,
        );
        const adminView = await inventoryService.findOne(inv, UserRole.ADMIN);
        const staffView = await inventoryService.findOne(
          inv,
          UserRole.WAREHOUSE_STAFF,
        );
        assert.equal(typeof adminView.id, 'string');
        assert.equal(adminView.product.costPrice, '50000.00');
        assert.equal(Object.hasOwn(staffView.product, 'costPrice'), false);
        await pool.query('UPDATE warehouses SET is_active=false WHERE id=$1', [
          f.whId,
        ]);
        await assert.rejects(
          inventoryService.findOne(inv, UserRole.WAREHOUSE_STAFF),
          (e) => e.getStatus() === 404,
        );
        await assert.rejects(
          inventoryService.findOne('9223372036854775808', UserRole.ADMIN),
          (e) => e.getStatus() === 400,
        );
        assert.equal(
          (await inventoryService.findOne(inv, UserRole.ADMIN)).reservedStock,
          2,
        );
      },
    );

    const { OrdersService } = require('../dist/orders/orders.service');
    const { PricingService } = require('../dist/pricing/pricing.service');
    const {
      WarehousesService,
    } = require('../dist/warehouses/warehouses.service');
    const {
      LowStockNotifierService,
    } = require('../dist/notifications/low-stock-notifier.service');
    function owners(emitter = changes) {
      const stock = new StockReservationService(
        new PrismaInventoryStockAdapter(alerts),
        new PrismaReservationRepository(),
      );
      return {
        stock,
        orders: new OrdersService(prisma, new PricingService(), stock, emitter),
        payments: new PaymentsService(
          prisma,
          stock,
          new MockPaymentGatewayService(),
          emitter,
        ),
      };
    }
    async function buy(f, owner, inv, quantity) {
      const productId = (
        await pool.query('SELECT product_id FROM inventory WHERE id=$1', [inv])
      ).rows[0].product_id;
      return owner.create(f.userId, {
        items: [{ productId, quantity }],
        shippingRecipient: 'Week6',
        shippingPhone: '0900000000',
        shippingAddress: 'VN',
        shippingRegion: 'VN',
      });
    }

    await scenario(
      'Orders thật: WARNING -> CRITICAL cùng alert, hủy trả hàng -> RESOLVED, giữ lại mở episode mới',
      async (f) => {
        const inv = await f.inventory(10);
        await pool.query(
          'UPDATE warehouses SET default_low_stock_threshold=3 WHERE id=$1',
          [f.whId],
        );
        const { orders } = owners();
        const first = await buy(f, orders, inv, 7);
        const warning = (
          await pool.query("SELECT * FROM stock_alerts WHERE status='OPEN'")
        ).rows[0];
        assert.equal(warning.alert_level, 'WARNING');
        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].availableStock, 3);
        const second = await buy(f, orders, inv, 3);
        const critical = (
          await pool.query("SELECT * FROM stock_alerts WHERE status='OPEN'")
        ).rows[0];
        assert.equal(critical.id, warning.id);
        assert.equal(critical.alert_level, 'CRITICAL');
        assert.deepEqual(critical.triggered_at, warning.triggered_at);
        await orders.changeStatus(second.id, 'CANCELLED', f.userId);
        await orders.changeStatus(first.id, 'CANCELLED', f.userId);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM stock_alerts WHERE status='OPEN'",
            )
          ).rows[0].n,
          0,
        );
        await buy(f, orders, inv, 8);
        const reopened = (
          await pool.query(
            "SELECT id,alert_level FROM stock_alerts WHERE status='OPEN'",
          )
        ).rows[0];
        assert.notEqual(reopened.id, warning.id);
        assert.equal(reopened.alert_level, 'WARNING');
        assert.equal(emitted.length, 5);
        assert.ok(emitted.every((event) => !Object.hasOwn(event, 'costPrice')));
      },
    );

    await scenario(
      'Payments thật: commit giữ available, duplicate không audit/cảnh báo/realtime thêm',
      async (f) => {
        const inv = await f.inventory(10);
        const { orders, payments } = owners();
        const order = await buy(f, orders, inv, 10);
        const ref = randomUUID();
        await payments.process(f.userId, order.id, ref, 'MOCK_CARD', true);
        assert.deepEqual(
          (
            await pool.query(
              'SELECT stock,reserved_stock,available_stock FROM inventory WHERE id=$1',
              [inv],
            )
          ).rows[0],
          { stock: 0, reserved_stock: 0, available_stock: 0 },
        );
        assert.equal(emitted.length, 2);
        assert.equal(emitted[1].stock, 0);
        const before = await snapshot();
        const count = emitted.length;
        assert.equal(
          (await payments.process(f.userId, order.id, ref, 'MOCK_CARD', true))
            .duplicate,
          true,
        );
        assert.deepEqual(await snapshot(), before);
        assert.equal(emitted.length, count);
      },
    );

    await scenario(
      'Cleanup thật: expire đơn đã tạo qua Orders cập nhật cảnh báo và phát snapshot sau commit',
      async (f) => {
        const inv = await f.inventory();
        const { orders } = owners();
        const order = await buy(f, orders, inv, 10);
        await pool.query(
          "UPDATE stock_reservations SET expires_at=clock_timestamp()-interval '1 second' WHERE order_id=$1",
          [order.id],
        );
        assert.equal(await job.cleanupExpired(), 1);
        assert.equal(emitted.length, 2);
        assert.equal(emitted[1].reservedStock, 0);
        assert.equal(emitted[1].availableStock, 10);
        assert.equal(
          (
            await pool.query('SELECT status FROM orders WHERE id=$1', [
              order.id,
            ])
          ).rows[0].status,
          'CANCELLED',
        );
        assert.equal(
          (await pool.query('SELECT status FROM stock_alerts')).rows[0].status,
          'RESOLVED',
        );
      },
    );

    await scenario(
      'Lỗi tạo cảnh báo khi reserve: rollback cả Order/Items/Reservation/Audit, không phát sự kiện',
      async (f) => {
        const inv = await f.inventory();
        const { orders } = owners();
        const before = await snapshot();
        await pool.query(
          "CREATE FUNCTION w6_fail_reserve_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'W6_RESERVE_ALERT_FAILURE'; END $$; CREATE TRIGGER w6_fail_reserve_alert BEFORE INSERT ON stock_alerts FOR EACH ROW EXECUTE FUNCTION w6_fail_reserve_alert()",
        );
        try {
          await assert.rejects(
            buy(f, orders, inv, 10),
            /W6_RESERVE_ALERT_FAILURE/,
          );
          assert.deepEqual(await snapshot(), before);
          assert.equal(emitted.length, 0);
        } finally {
          await pool.query(
            'DROP TRIGGER w6_fail_reserve_alert ON stock_alerts; DROP FUNCTION w6_fail_reserve_alert()',
          );
        }
      },
    );

    await scenario(
      'Lỗi cuối payment: rollback cả stock, payment và cảnh báo; không phát sự kiện',
      async (f) => {
        const inv = await f.inventory();
        const { orders, payments } = owners();
        const order = await buy(f, orders, inv, 10);
        const before = await snapshot();
        emitted.length = 0;
        await pool.query(
          "CREATE FUNCTION w6_fail_pay_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'W6_PAY_HISTORY_FAILURE'; END $$; CREATE TRIGGER w6_fail_pay_history BEFORE INSERT ON order_status_history FOR EACH ROW EXECUTE FUNCTION w6_fail_pay_history()",
        );
        try {
          await assert.rejects(
            payments.process(
              f.userId,
              order.id,
              randomUUID(),
              'MOCK_CARD',
              true,
            ),
            /W6_PAY_HISTORY_FAILURE/,
          );
          assert.deepEqual(await snapshot(), before);
          assert.equal(emitted.length, 0);
        } finally {
          await pool.query(
            'DROP TRIGGER w6_fail_pay_history ON order_status_history; DROP FUNCTION w6_fail_pay_history()',
          );
        }
      },
    );

    await scenario(
      'Đổi ngưỡng kho: đánh giá lại các dòng kế thừa, giữ ngưỡng riêng và phát đúng snapshot',
      async (f) => {
        const inherited = await f.inventory(5);
        const own = await f.inventory(5);
        await pool.query('UPDATE inventory SET threshold=2 WHERE id=$1', [own]);
        const warehouses = new WarehousesService(prisma, alerts, changes);
        await warehouses.update(f.whId, { defaultLowStockThreshold: 5 });
        assert.equal(
          (
            await pool.query(
              "SELECT inventory_id FROM stock_alerts WHERE status='OPEN'",
            )
          ).rows[0].inventory_id,
          inherited,
        );
        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].effectiveThreshold, 5);
        await warehouses.update(f.whId, { defaultLowStockThreshold: 0 });
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM stock_alerts WHERE status='OPEN'",
            )
          ).rows[0].n,
          0,
        );
        assert.equal(emitted.length, 2);
        await warehouses.update(f.whId, { defaultLowStockThreshold: 0 });
        assert.equal(emitted.length, 2);
        assert.equal(
          (
            await pool.query('SELECT threshold FROM inventory WHERE id=$1', [
              own,
            ])
          ).rows[0].threshold,
          2,
        );
      },
    );

    await scenario(
      'Không ngừng kho trong lúc một transaction khác đang giữ chỗ',
      async (f) => {
        const inv = await f.inventory();
        const warehouses = new WarehousesService(prisma, alerts, changes);
        const lock = await blocker();
        let outcome;
        try {
          await lock.c.query(
            'SELECT id FROM inventory WHERE id=$1 FOR UPDATE',
            [inv],
          );
          outcome = warehouses.update(f.whId, { isActive: false }).then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
          await waitBlocked(lock.pid);
          const id = (
            await lock.c.query(
              "INSERT INTO orders(order_code,user_id,shipping_recipient,shipping_phone,shipping_address,updated_at) VALUES('W6-DEACTIVATE',$1,'Test','0900000000','VN',NOW()) RETURNING id",
              [f.userId],
            )
          ).rows[0].id;
          await lock.c.query(
            'SELECT fn_reserve_stock($1::bigint,$2::uuid,1,15)',
            [inv, id],
          );
          await lock.c.query('COMMIT');
        } finally {
          await lock.release();
        }
        assert.equal((await bounded(outcome)).error.getStatus(), 409);
        assert.equal(
          (
            await pool.query('SELECT is_active FROM warehouses WHERE id=$1', [
              f.whId,
            ])
          ).rows[0].is_active,
          true,
        );
      },
    );

    await scenario(
      'Inventory ghi sau commit: đổi ngưỡng, no-op, restock và đóng cảnh báo',
      async (f) => {
        const inv = await f.inventory(2);
        await inventoryService.updateStock(inv, { threshold: 5 }, f.userId);
        assert.equal(emitted.length, 1);
        assert.equal(emitted[0].isLowStock, true);
        await inventoryService.updateStock(inv, { threshold: 5 }, f.userId);
        assert.equal(emitted.length, 1);
        await inventoryService.restock(inv, { quantity: 10 }, f.userId);
        assert.equal(emitted.length, 2);
        assert.equal(emitted[1].availableStock, 12);
        assert.equal(
          (await pool.query('SELECT status FROM stock_alerts')).rows[0].status,
          'RESOLVED',
        );
      },
    );

    await scenario(
      'Notifier mới của Minh: lưu notification trước publish, WARNING/CRITICAL mỗi mức một lần',
      async (f) => {
        const inv = await f.inventory();
        await pool.query(
          'UPDATE warehouses SET default_low_stock_threshold=3 WHERE id=$1',
          [f.whId],
        );
        const { orders } = owners();
        const published = [];
        const gateway = { emitLowStockAlert: (event) => published.push(event) };
        const notifier = new LowStockNotifierService(
          prisma,
          inventoryService,
          {
            publishLowStock: async () => {
              assert.ok(
                (
                  await pool.query(
                    'SELECT count(*)::int AS n FROM notifications',
                  )
                ).rows[0].n > 0,
              );
              return 0;
            },
          },
          gateway,
        );
        await buy(f, orders, inv, 7);
        assert.equal(await notifier.dispatchOpenAlerts(), 1);
        assert.equal(await notifier.dispatchOpenAlerts(), 0);
        await buy(f, orders, inv, 3);
        assert.equal(await notifier.dispatchOpenAlerts(), 1);
        assert.equal(await notifier.dispatchOpenAlerts(), 0);
        assert.equal(published.length, 2);
        assert.equal(
          (await pool.query('SELECT count(*)::int AS n FROM notifications'))
            .rows[0].n,
          2,
        );
      },
    );

    const redisUrl = process.env.WEEK6_TEST_REDIS_URL;
    let redisValidated = false;
    await t.test(
      'Redis thật: hai instance, snapshot sau commit tới Gateway đúng room và không nhận echo trùng',
      {
        skip:
          !redisUrl && !process.argv.includes('--require-redis')
            ? 'Đặt WEEK6_TEST_REDIS_URL để kiểm thử Redis thật'
            : false,
      },
      async (sub) => {
        assert.ok(redisUrl, 'Thiếu WEEK6_TEST_REDIS_URL');
        const f = await fresh();
        const previous = process.env.REDIS_URL;
        process.env.REDIS_URL = redisUrl;
        const Redis = require('ioredis');
        const {
          InventoryPubSubService,
          INVENTORY_CHANGED_CHANNEL,
        } = require('../dist/inventory/inventory-pubsub.service');
        const {
          NotificationsGateway,
        } = require('../dist/notifications/notifications.gateway');
        const a = new InventoryPubSubService();
        const b = new InventoryPubSubService();
        const control = new Redis(redisUrl);
        const receivedA = [];
        const receivedB = [];
        let notifier;
        try {
          const beforeSubscribers = await control.pubsub(
            'NUMSUB',
            'inventory.low_stock',
            INVENTORY_CHANGED_CHANNEL,
          );
          assert.equal(
            Number(beforeSubscribers[1]) + Number(beforeSubscribers[3]),
            0,
            'Dùng Redis test riêng, không dùng Redis đang phục vụ ứng dụng',
          );
          redisValidated = true;
          a.onModuleInit();
          b.onModuleInit();
          await waitUntil(
            async () =>
              Number(
                (await control.pubsub('NUMSUB', INVENTORY_CHANGED_CHANNEL))[1],
              ) === 2,
            'Redis chưa đủ 2 subscriber',
          );
          await waitUntil(async () => {
            try {
              await a.publishInventoryChanged({
                inventoryId: '1',
                stock: 0,
                reservedStock: 0,
                availableStock: 0,
              });
              return true;
            } catch {
              return false;
            }
          }, 'Publisher chưa ready');
          a.onInventoryChanged((event) => {
            receivedA.push(event);
          });
          b.onInventoryChanged((event) => {
            receivedB.push(event);
          });
          const rooms = [];
          const gateway = new NotificationsGateway({}, prisma);
          gateway.server = {
            to: (room) => ({
              emit: (event, payload) => {
                rooms.push({ room, event, payload });
              },
            }),
          };
          const realChanges = new InventoryChangeEmitter(prisma, a);
          notifier = new LowStockNotifierService(
            prisma,
            inventoryService,
            a,
            gateway,
          );
          notifier.onModuleInit();
          const inv = await f.inventory();
          const { orders } = owners(realChanges);
          await buy(f, orders, inv, 3);
          await waitUntil(
            async () => receivedB.some((event) => event.inventoryId === inv),
            'Instance B chưa nhận sự kiện',
          );
          const event = receivedB.find((event) => event.inventoryId === inv);
          const marker = randomUUID();
          await a.publishInventoryChanged({ ...event, eventId: marker });
          await waitUntil(
            async () =>
              receivedA.some((e) => e.eventId === marker) &&
              receivedB.some((e) => e.eventId === marker),
            'Chưa nhận marker barrier',
          );
          assert.equal(
            receivedA.filter((e) => e.eventId === event.eventId).length,
            1,
          );
          assert.equal(
            receivedB.filter((e) => e.eventId === event.eventId).length,
            1,
          );
          assert.deepEqual([...new Set(rooms.map((r) => r.room))].sort(), [
            'role:ADMIN',
            'role:WAREHOUSE_STAFF',
          ]);
          assert.ok(rooms.every((r) => !Object.hasOwn(r.payload, 'costPrice')));
          assert.equal(event.reservedStock, 3);
          assert.equal(
            (
              await pool.query(
                'SELECT reserved_stock FROM inventory WHERE id=$1',
                [inv],
              )
            ).rows[0].reserved_stock,
            3,
          );
          const before = receivedB.length;
          await control.publish(
            INVENTORY_CHANGED_CHANNEL,
            JSON.stringify({
              ...event,
              eventId: randomUUID(),
              availableStock: 999,
            }),
          );
          const final = randomUUID();
          await a.publishInventoryChanged({ ...event, eventId: final });
          await waitUntil(
            async () => receivedB.some((e) => e.eventId === final),
            'Chưa nhận final barrier',
          );
          assert.equal(receivedB.length, before + 1);
          sub.diagnostic(
            (await control.info('server'))
              .split('\r\n')
              .find((line) => line.startsWith('redis_version:')),
          );
        } finally {
          notifier?.onModuleDestroy();
          a.onModuleDestroy();
          b.onModuleDestroy();
          control.disconnect();
          if (previous === undefined) delete process.env.REDIS_URL;
          else process.env.REDIS_URL = previous;
        }
      },
    );

    await scenario(
      'EXPLAIN JSON của chính query cron: Index Scan using idx_res_cleanup trên dữ liệu lịch sử chọn lọc',
      async (f, sub) => {
        const inv = await f.inventory();
        await f.order([[inv, 1]]);
        // Separate CONFIRMED historical orders, not COMMITTED rows mixed into the pending order.
        await pool.query(
          `WITH history AS (
      INSERT INTO orders(order_code,user_id,status,shipping_recipient,shipping_phone,shipping_address,updated_at)
      SELECT 'W6-HISTORY-'||g,$1::uuid,'CONFIRMED','History','0900000000','VN',NOW() FROM generate_series(1,5000) g RETURNING id
    ) INSERT INTO stock_reservations(order_id,inventory_id,quantity,status,expires_at,committed_at,updated_at)
      SELECT id,$2::bigint,1,'COMMITTED',NOW()-interval '1 day',NOW()-interval '1 day',NOW() FROM history`,
          [f.userId, inv],
        );
        await pool.query(
          'ANALYZE orders; ANALYZE stock_reservations; ANALYZE payments',
        );
        const sql = RESERVATION_CLEANUP_CANDIDATES_SQL;
        const plan = (
          await pool.query(
            'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql.text,
            sql.values,
          )
        ).rows[0]['QUERY PLAN'][0];
        const scans = planNodes(plan.Plan).filter(
          (n) => n['Index Name'] === 'idx_res_cleanup',
        );
        assert.ok(
          scans.some((n) =>
            ['Index Scan', 'Index Only Scan'].includes(n['Node Type']),
          ),
          JSON.stringify(plan, null, 2),
        );
        sub.diagnostic(
          scans
            .map(
              (n) =>
                `${n['Node Type']} using ${n['Index Name']}; actual rows=${n['Actual Rows']}`,
            )
            .join('; '),
        );
        if (process.env.WEEK6_EXPLAIN_PATH)
          fs.writeFileSync(
            process.env.WEEK6_EXPLAIN_PATH,
            JSON.stringify(plan, null, 2) + '\n',
          );
        assert.equal(await job.cleanupExpired(), 1);
      },
    );
    await t.test(
      'Bộ 12 integration test StockReservation có sẵn chạy trên PostgreSQL thật',
      async (sub) => {
        await fresh();
        const { spawnSync } = require('node:child_process');
        const run = spawnSync(
          process.execPath,
          [
            require.resolve('jest/bin/jest'),
            '--runInBand',
            '--runTestsByPath',
            'src/stock-reservation/stock-reservation.integration.spec.ts',
          ],
          {
            cwd: path.resolve(__dirname, '..'),
            env: {
              ...process.env,
              RESERVATION_TEST_DATABASE_URL: connectionString,
            },
            encoding: 'utf8',
            timeout: 60000,
          },
        );
        const log = (run.stdout ?? '') + (run.stderr ?? '');
        if (process.env.WEEK6_STOCK_TEST_LOG)
          fs.writeFileSync(process.env.WEEK6_STOCK_TEST_LOG, log);
        assert.equal(run.status, 0, log || String(run.error));
        sub.diagnostic(
          log
            .split('\n')
            .filter((line) => /^Test Suites:|^Tests:/.test(line))
            .join('; '),
        );
      },
    );
    await t.test(
      'Script tuần 3 tương thích constructor mới và Redis payload UUID',
      {
        skip:
          !process.env.WEEK6_TEST_REDIS_URL &&
          !process.argv.includes('--require-redis')
            ? 'Cần Redis thật'
            : false,
      },
      async (sub) => {
        assert.ok(
          process.env.WEEK6_TEST_REDIS_URL,
          'Thiếu WEEK6_TEST_REDIS_URL',
        );
        assert.ok(
          redisValidated,
          'Chưa xác nhận Redis kiểm thử riêng; không phát payload tuần 3',
        );
        const legacyDb = 'cnpm_week3_' + randomUUID().replaceAll('-', '');
        await admin.query(`CREATE DATABASE "${legacyDb}" TEMPLATE template0`);
        const legacyUrl = new URL(dbUrl);
        legacyUrl.pathname = '/' + legacyDb;
        legacyUrl.searchParams.delete('schema');
        legacyUrl.searchParams.delete('options');
        try {
          const { spawnSync } = require('node:child_process');
          const run = spawnSync(
            process.execPath,
            ['test/week3.integration.cjs'],
            {
              cwd: path.resolve(__dirname, '..'),
              env: {
                ...process.env,
                WEEK3_TEST_DATABASE_URL: legacyUrl.toString(),
                WEEK3_TEST_REDIS_URL: process.env.WEEK6_TEST_REDIS_URL,
              },
              encoding: 'utf8',
              timeout: 30000,
            },
          );
          const log = (run.stdout ?? '') + (run.stderr ?? '');
          if (process.env.WEEK6_LEGACY_TEST_LOG)
            fs.writeFileSync(process.env.WEEK6_LEGACY_TEST_LOG, log);
          assert.equal(run.status, 0, log || String(run.error));
          sub.diagnostic(
            log
              .split('\n')
              .filter((line) => /tests |pass |fail /.test(line))
              .join('; '),
          );
        } finally {
          await admin.query(`DROP DATABASE "${legacyDb}" WITH (FORCE)`);
        }
      },
    );
  },
);
