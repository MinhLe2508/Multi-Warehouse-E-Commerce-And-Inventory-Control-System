// Run only against a fresh, disposable database. Never loads the project .env.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const {
  ReservationCleanupJob,
} = require('../dist/inventory/reservation-cleanup.job');
const {
  InventoryPubSubService,
  isLowStockEvent,
} = require('../dist/inventory/inventory-pubsub.service');
const Redis = require('ioredis');

test('cleanup against real PostgreSQL with project constraints and triggers', async (t) => {
  const connectionString = process.env.WEEK3_TEST_DATABASE_URL;
  assert.ok(
    connectionString,
    'Set WEEK3_TEST_DATABASE_URL to a disposable EMPTY database',
  );
  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  t.after(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  assert.equal(
    tables.rowCount,
    0,
    'Refusing to initialize a non-empty database',
  );
  for (const name of [
    '20261008010100_init',
    '20261008012516_manual_constraints_and_functions',
  ]) {
    await pool.query(
      fs.readFileSync(
        path.join(__dirname, '../prisma/migrations', name, 'migration.sql'),
        'utf8',
      ),
    );
  }
  const user = (
    await pool.query(
      "INSERT INTO users(email,password_hash,full_name,updated_at) VALUES ('week3@example.test','unused','Week3',NOW()) RETURNING id",
    )
  ).rows[0].id;
  const wh = (
    await pool.query(
      "INSERT INTO warehouses(code,name,region,updated_at) VALUES ('W3','Test','Test',NOW()) RETURNING id",
    )
  ).rows[0].id;
  let seq = 0;
  async function fixture() {
    const code = `test-${++seq}`;
    const product = (
      await pool.query(
        'INSERT INTO products(sku,name,slug,base_price,updated_at) VALUES ($1,$1,$1,10,NOW()) RETURNING id',
        [code],
      )
    ).rows[0].id;
    const inv = (
      await pool.query(
        'INSERT INTO inventory(product_id,warehouse_id,stock,updated_at) VALUES ($1,$2,10,NOW()) RETURNING id',
        [product, wh],
      )
    ).rows[0].id;
    const order = (
      await pool.query(
        "INSERT INTO orders(order_code,user_id,shipping_recipient,shipping_phone,shipping_address,updated_at) VALUES ($1,$2,'Test','000','Test',NOW()) RETURNING id",
        [code, user],
      )
    ).rows[0].id;
    await pool.query('SELECT fn_reserve_stock($1::bigint,$2::uuid,3,-1)', [
      inv,
      order,
    ]);
    await pool.query('SELECT fn_reserve_stock($1::bigint,$2::uuid,2,15)', [
      inv,
      order,
    ]);
    return inv;
  }
  const job = new ReservationCleanupJob(prisma);
  await t.test(
    'expire only overdue HOLDING, preserve stock, audit, rerun is idempotent',
    async () => {
      const id = await fixture();
      assert.equal(await job.cleanupExpired(), 1);
      assert.equal(await job.cleanupExpired(), 0);
      const row = (
        await pool.query(
          'SELECT stock,reserved_stock,available_stock FROM inventory WHERE id=$1',
          [id],
        )
      ).rows[0];
      assert.deepEqual(row, {
        stock: 10,
        reserved_stock: 2,
        available_stock: 8,
      });
      const logs = (
        await pool.query(
          'SELECT reason,stock_before,stock_after,reserved_before,reserved_after,quantity_delta FROM inventory_audit_log WHERE inventory_id=$1',
          [id],
        )
      ).rows;
      assert.deepEqual(logs, [
        {
          reason: 'EXPIRE',
          stock_before: 10,
          stock_after: 10,
          reserved_before: 5,
          reserved_after: 2,
          quantity_delta: -3,
        },
      ]);
      const states = (
        await pool.query(
          'SELECT status,released_at FROM stock_reservations WHERE inventory_id=$1 ORDER BY id',
          [id],
        )
      ).rows;
      assert.equal(states[0].status, 'EXPIRED');
      assert.ok(states[0].released_at);
      assert.equal(states[1].status, 'HOLDING');
    },
  );
  await t.test('two concurrent workers release exactly once', async () => {
    await fixture();
    const counts = await Promise.all([
      job.cleanupExpired(),
      new ReservationCleanupJob(prisma).cleanupExpired(),
    ]);
    assert.equal(
      counts.reduce((a, b) => a + b, 0),
      1,
    );
  });
  for (const target of ['inventory', 'stock_reservations']) {
    await t.test(`skip locked ${target}, process after unlock`, async () => {
      const id = await fixture();
      const blocker = await pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          target === 'inventory'
            ? 'SELECT id FROM inventory WHERE id=$1 FOR UPDATE'
            : 'SELECT id FROM stock_reservations WHERE inventory_id=$1 AND expires_at<NOW() FOR UPDATE',
          [id],
        );
        assert.equal(await job.cleanupExpired(), 0);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
      }
      assert.equal(await job.cleanupExpired(), 1);
    });
  }
  await t.test(
    'audit failure rolls back reservation and inventory',
    async () => {
      const id = await fixture();
      await pool.query(
        "CREATE FUNCTION fail_week3_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER fail_week3 BEFORE INSERT ON inventory_audit_log FOR EACH ROW EXECUTE FUNCTION fail_week3_audit()",
      );
      try {
        await assert.rejects(job.cleanupExpired());
        assert.equal(
          (
            await pool.query(
              'SELECT reserved_stock FROM inventory WHERE id=$1',
              [id],
            )
          ).rows[0].reserved_stock,
          5,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM stock_reservations WHERE inventory_id=$1 AND status='HOLDING'",
              [id],
            )
          ).rows[0].n,
          2,
        );
      } finally {
        await pool.query(
          'DROP TRIGGER fail_week3 ON inventory_audit_log; DROP FUNCTION fail_week3_audit()',
        );
      }
      assert.equal(await job.cleanupExpired(), 1);
    },
  );
});

test('real Redis publisher and subscriber lifecycle', async (t) => {
  assert.ok(process.env.WEEK3_TEST_REDIS_URL, 'Set WEEK3_TEST_REDIS_URL');
  process.env.REDIS_URL = process.env.WEEK3_TEST_REDIS_URL;
  const service = new InventoryPubSubService();
  const subscriber = new Redis(process.env.REDIS_URL);
  t.after(() => {
    service.onModuleDestroy();
    subscriber.disconnect();
  });
  await service.onModuleInit();
  await subscriber.subscribe('inventory.low_stock');
  const event = {
    inventoryId: '1',
    productId: 'test-product',
    warehouseId: 'test-warehouse',
    availableStock: 2,
    threshold: 5,
  };
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('No pub/sub message')),
      3000,
    );
    subscriber.once('message', (channel, payload) => {
      clearTimeout(timeout);
      resolve({ channel, payload });
    });
  });
  assert.ok((await service.publishLowStock(event)) >= 2);
  assert.deepEqual(await received, {
    channel: 'inventory.low_stock',
    payload: JSON.stringify(event),
  });
  assert.equal(isLowStockEvent({ ...event, availableStock: -1 }), false);
  assert.equal(isLowStockEvent({ ...event, availableStock: 6 }), false);
  await assert.rejects(service.publishLowStock({ ...event, threshold: -1 }));
});
