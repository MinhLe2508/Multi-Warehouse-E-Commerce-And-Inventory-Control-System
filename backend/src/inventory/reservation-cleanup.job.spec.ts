import * as fs from 'node:fs';
import * as path from 'node:path';
import { Prisma } from '@prisma/client';
import {
  ReservationCleanupJob,
  RESERVATION_CLEANUP_CANDIDATES_SQL,
} from './reservation-cleanup.job';

const ORDER_1 = '11111111-1111-4111-8111-111111111111';
const DB_TIME = '2026-11-17 12:00:00.123456+00';
const reservation = (id = 101n, inventoryId = 1n, quantity = 1) => ({
  id,
  order_id: ORDER_1,
  inventory_id: inventoryId,
  quantity,
  status: 'HOLDING',
});

// These are unit doubles for the service's decisions. They do NOT simulate
// PostgreSQL locks/rollback; those are exercised by the live integration suite.
function harness(
  options: {
    orders?: { id: string }[];
    inventories?: { id: bigint; stock: number; reserved_stock: number }[];
    reservations?: ReturnType<typeof reservation>[];
    expiredIds?: bigint[];
  } = {},
) {
  const tx = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce(options.orders ?? [{ id: ORDER_1 }])
      .mockResolvedValueOnce(
        options.inventories ?? [{ id: 1n, stock: 10, reserved_stock: 1 }],
      )
      .mockResolvedValueOnce(options.reservations ?? [reservation()])
      .mockResolvedValueOnce([{ at: DB_TIME }])
      .mockResolvedValueOnce(
        (options.expiredIds ?? [101n]).map((id) => ({ id })),
      ),
    stockReservation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    inventory: { update: jest.fn().mockResolvedValue({}) },
    inventoryAuditLog: { create: jest.fn().mockResolvedValue({}) },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => Promise<number>) =>
      run(tx),
    ),
  };
  const alerts = {
    evaluate: jest.fn().mockResolvedValue({ raised: 0, resolved: 0 }),
  };
  return {
    tx,
    prisma,
    alerts,
    job: new ReservationCleanupJob(prisma as never, alerts as never),
  };
}

describe('ReservationCleanupJob — transaction decisions (DB semantics tested live)', () => {
  it('does nothing when no unlocked order can be claimed', async () => {
    const { job, tx, alerts } = harness({ orders: [] });
    await expect(job.cleanupExpired()).resolves.toBe(0);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(alerts.evaluate).not.toHaveBeenCalled();
  });

  it('expires stock, cancels the order and records audit/history in the same tx', async () => {
    const { job, tx, prisma, alerts } = harness();
    await expect(job.cleanupExpired()).resolves.toBe(1);
    expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
      where: { id: 101n, status: 'HOLDING' },
      data: { status: 'EXPIRED', releasedAt: new Date(DB_TIME) },
    });
    expect(tx.inventory.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { reservedStock: { decrement: 1 } },
    });
    expect(tx.inventoryAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stockBefore: 10,
        stockAfter: 10,
        reservedBefore: 1,
        reservedAfter: 0,
        quantityDelta: 0,
        reason: 'EXPIRE',
        referenceId: '101',
      }),
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: ORDER_1, status: 'PENDING_PAYMENT' },
      data: {
        status: 'CANCELLED',
        cancelledReason: 'EXPIRED',
        cancelledAt: new Date(DB_TIME),
      },
    });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: {
        orderId: ORDER_1,
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'CANCELLED',
        actorId: null,
        reason: 'EXPIRED',
      },
    });
    expect(alerts.evaluate).toHaveBeenCalledWith(tx, [1n]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('keeps an order pending while another reservation is still HOLDING', async () => {
    const { job, tx } = harness({
      inventories: [{ id: 1n, stock: 10, reserved_stock: 3 }],
      reservations: [reservation(), reservation(102n, 1n, 2)],
    });
    await expect(job.cleanupExpired()).resolves.toBe(1);
    expect(tx.stockReservation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('recovers a legacy order with all reservations EXPIRED, without decrementing stock again', async () => {
    const { job, tx } = harness({
      inventories: [],
      reservations: [{ ...reservation(), status: 'EXPIRED' }],
      expiredIds: [],
    });
    await expect(job.cleanupExpired()).resolves.toBe(0);
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.inventoryAuditLog.create).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('tracks audit balances correctly across multiple rows of the same inventory', async () => {
    const { job, tx, alerts } = harness({
      inventories: [{ id: 1n, stock: 10, reserved_stock: 5 }],
      reservations: [reservation(101n, 1n, 3), reservation(102n, 1n, 2)],
      expiredIds: [101n, 102n],
    });
    await expect(job.cleanupExpired()).resolves.toBe(2);
    expect(
      tx.inventoryAuditLog.create.mock.calls.map(
        ([arg]) => arg.data.reservedAfter,
      ),
    ).toEqual([2, 0]);
    expect(alerts.evaluate).toHaveBeenCalledWith(tx, [1n]);
  });

  it('claims orders before inventory/reservation locks and skips only unclaimed orders', async () => {
    const { job, tx } = harness();
    await job.cleanupExpired();
    expect(tx.$queryRaw.mock.calls[0][0]).toBe(
      RESERVATION_CLEANUP_CANDIDATES_SQL,
    );
    expect(RESERVATION_CLEANUP_CANDIDATES_SQL.text).toContain(
      'FOR UPDATE OF o SKIP LOCKED',
    );
    const lockInventory = (
      tx.$queryRaw.mock.calls[1][0] as TemplateStringsArray
    ).join('?');
    const lockReservations = (
      tx.$queryRaw.mock.calls[2][0] as TemplateStringsArray
    ).join('?');
    expect(lockInventory).toContain('ORDER BY i.id');
    expect(lockInventory).toContain('FOR UPDATE OF i');
    expect(lockReservations).toContain('ORDER BY id');
    expect(lockReservations).toContain('FOR UPDATE');
    expect(lockInventory + lockReservations).not.toContain('SKIP LOCKED');
  });

  it('propagates an invalid reserved balance to the transaction owner', async () => {
    const { job, tx } = harness({ reservations: [reservation(101n, 1n, 4)] });
    await expect(job.cleanupExpired()).rejects.toThrow(
      'Invalid reserved stock for inventory 1',
    );
    expect(tx.inventory.update).not.toHaveBeenCalled();
  });

  it('rejects a lost reservation update before decrementing inventory', async () => {
    const { job, tx } = harness();
    tx.stockReservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(job.cleanupExpired()).rejects.toThrow(
      'Reservation 101 changed under lock',
    );
    expect(tx.inventory.update).not.toHaveBeenCalled();
  });

  it('propagates a history failure after stock writes so PostgreSQL can roll back', async () => {
    const { job, tx, alerts } = harness();
    tx.orderStatusHistory.create.mockRejectedValue(new Error('history failed'));
    await expect(job.cleanupExpired()).rejects.toThrow('history failed');
    expect(tx.inventory.update).toHaveBeenCalledTimes(1);
    expect(alerts.evaluate).not.toHaveBeenCalled();
  });

  it('propagates alert failures instead of committing stock without alert changes', async () => {
    const { job, alerts } = harness();
    alerts.evaluate.mockRejectedValue(new Error('alert failed'));
    await expect(job.cleanupExpired()).rejects.toThrow('alert failed');
  });
});

describe('STT 31 — Kiểm chứng script DDL, hàm fn_reserve_stock và đối chiếu mục 9.1–9.4', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  const ddlPath = path.join(backendRoot, 'prisma/ddl.sql');
  const mig1Path = path.join(
    backendRoot,
    'prisma/migrations/20261008010100_init/migration.sql',
  );
  const mig2Path = path.join(
    backendRoot,
    'prisma/migrations/20261008012516_manual_constraints_and_functions/migration.sql',
  );

  const ddl = fs.readFileSync(ddlPath, 'utf8');
  const mig1 = fs.readFileSync(mig1Path, 'utf8');
  const mig2 = fs.readFileSync(mig2Path, 'utf8');

  it('Mục 9.1: ddl.sql tạo đủ 18 bảng, 10 kiểu ENUM, 25 khóa ngoại, 62 index, 11 trigger updated_at và 20 CHECK (sau khi gỡ 1 CHECK ở mục 9.4)', () => {
    const tables = ddl.match(/CREATE TABLE\s+\w+/g) ?? [];
    const enums = ddl.match(/CREATE TYPE\s+\w+\s+AS ENUM/g) ?? [];
    const fks = ddl.match(/REFERENCES\s+\w+\s*\(/g) ?? [];
    const checks = ddl.match(/CONSTRAINT\s+chk_\w+\s+CHECK/g) ?? [];
    const createIndexes =
      ddl.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+/g) ?? [];
    const inlineUniques =
      ddl.match(/\bNOT NULL UNIQUE\b|CONSTRAINT\s+uq_\w+\s+UNIQUE/g) ?? [];
    const updatedAtLoop = ddl.match(/FOREACH t IN ARRAY ARRAY\[\s*([^\]]+)\]/s);
    const updatedAtTables = updatedAtLoop
      ? (updatedAtLoop[1].match(/'\w+'/g) ?? [])
      : [];

    expect(tables).toHaveLength(18);
    expect(enums).toHaveLength(10);
    expect(fks).toHaveLength(25);
    // 21 CHECK thiết kế ban đầu trừ 1 CHECK (expires_at > created_at) đã loại bỏ ở mục 9.4 = 20 CHECK
    expect(checks).toHaveLength(20);
    // 18 PK + 11 UNIQUE constraint + 33 CREATE [UNIQUE] INDEX = 62 index trong pg_indexes
    expect(tables.length + inlineUniques.length + createIndexes.length).toBe(
      62,
    );
    expect(updatedAtTables).toHaveLength(11);
  });

  it('Mục 9.2 & 10.2: hàm fn_reserve_stock và trigger ctrg_reservation_consistency khớp chữ ký và thuật toán chống oversell', () => {
    for (const sql of [ddl, mig2]) {
      expect(sql).toMatch(
        /CREATE OR REPLACE FUNCTION fn_reserve_stock\(\s*p_inventory_id\s+BIGINT,\s*p_order_id\s+UUID,\s*p_quantity\s+INTEGER,\s*p_ttl_minutes\s+INTEGER DEFAULT 15\s*\)\s*RETURNS BIGINT/s,
      );
      expect(sql).toContain('SELECT available_stock INTO v_available');
      expect(sql).toContain('FOR UPDATE;');
      expect(sql).toContain(
        "RAISE EXCEPTION 'INVENTORY_NOT_FOUND' USING ERRCODE = 'P0002';",
      );
      expect(sql).toContain(
        "RAISE EXCEPTION 'INSUFFICIENT_STOCK: con % can %', v_available, p_quantity",
      );
      expect(sql).toContain("USING ERRCODE = '23514';");
      expect(sql).toContain('SET reserved_stock = reserved_stock + p_quantity');
      expect(sql).toContain('INSERT INTO stock_reservations');
      expect(sql).toContain(
        'CREATE CONSTRAINT TRIGGER ctrg_reservation_consistency',
      );
      expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    }
  });

  it('Mục 9.3: partial index idx_res_cleanup trên stock_reservations(expires_at) WHERE status = HOLDING tồn tại', () => {
    expect(ddl).toMatch(
      /CREATE INDEX\s+"?idx_res_cleanup"?\s+ON\s+"?stock_reservations"?\s*\(\s*"?expires_at"?\s*\)\s*WHERE\s+"?status"?\s*=\s*'HOLDING'/i,
    );
    expect(mig2).toMatch(
      /CREATE INDEX\s+"?idx_res_cleanup"?\s+ON\s+"?stock_reservations"?\s*\(\s*"?expires_at"?\s*\)\s*WHERE\s+"?status"?\s*=\s*'HOLDING'/i,
    );
  });

  it('Mục 9.4: bảng stock_reservations chỉ giữ chk_res_qty_pos và đã loại bỏ CHECK (expires_at > created_at)', () => {
    expect(ddl).toContain('CONSTRAINT chk_res_qty_pos CHECK (quantity > 0)');
    expect(mig2).toContain(
      'ALTER TABLE "stock_reservations" ADD CONSTRAINT "chk_res_qty_pos" CHECK ("quantity" > 0);',
    );
    // Không tồn tại câu lệnh ADD CONSTRAINT / CONSTRAINT nào kiểm tra expires_at > created_at
    expect(ddl).not.toMatch(
      /CONSTRAINT\s+\w+\s+CHECK\s*\(\s*expires_at\s*>\s*created_at\s*\)/i,
    );
    expect(mig1 + '\n' + mig2).not.toMatch(
      /CHECK\s*\(\s*"?expires_at"?\s*>\s*"?created_at"?\s*\)/i,
    );
  });
});
