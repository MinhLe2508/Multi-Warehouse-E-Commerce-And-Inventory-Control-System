import * as fs from 'node:fs';
import * as path from 'node:path';
import { ReservationCleanupJob } from './reservation-cleanup.job';

const ORDER_1 = '11111111-1111-4111-8111-111111111111';
const ORDER_2 = '22222222-2222-4222-8222-222222222222';

interface StatefulFixtureOptions {
  initialStock?: number;
  initialReserved?: number;
  reservations?: Array<{
    id: bigint;
    inventoryId: bigint;
    orderId: string;
    quantity: number;
    status: 'HOLDING' | 'EXPIRED' | 'COMMITTED' | 'RELEASED';
    expired: boolean;
  }>;
  orders?: Array<{
    id: string;
    status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED';
    cancelledReason?: string | null;
  }>;
}

function createStatefulCleanupHarness(opts: StatefulFixtureOptions = {}) {
  const inventoryState = new Map<
    bigint,
    { id: bigint; stock: number; reserved_stock: number }
  >([
    [
      1n,
      {
        id: 1n,
        stock: opts.initialStock ?? 10,
        reserved_stock: opts.initialReserved ?? 1,
      },
    ],
  ]);

  const reservationsState = (
    opts.reservations ?? [
      {
        id: 101n,
        inventoryId: 1n,
        orderId: ORDER_1,
        quantity: 1,
        status: 'HOLDING' as const,
        expired: true,
      },
    ]
  ).map((r) => ({ ...r, releasedAt: null as Date | null }));

  const ordersState = new Map(
    (opts.orders ?? [{ id: ORDER_1, status: 'PENDING_PAYMENT' as const }]).map(
      (o) => [
        o.id,
        {
          id: o.id,
          status: o.status,
          cancelledReason: o.cancelledReason ?? null,
          cancelledAt: null as Date | null,
        },
      ],
    ),
  );

  const auditLogs: Array<Record<string, unknown>> = [];
  const statusHistory: Array<Record<string, unknown>> = [];
  const rawQueries: string[] = [];

  const tx = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join(' ? ').replace(/\s+/g, ' ').trim();
        rawQueries.push(sql);

        // Bước 1: Quét partial index idx_res_cleanup
        if (sql.includes('SELECT DISTINCT r.inventory_id')) {
          const ids = [
            ...new Set(
              reservationsState
                .filter((r) => r.status === 'HOLDING' && r.expired)
                .map((r) => r.inventoryId),
            ),
          ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          return Promise.resolve(ids.map((inventory_id) => ({ inventory_id })));
        }

        // Bước 2: Khóa dòng inventory theo thứ tự ID tăng dần
        if (sql.includes('FROM inventory i')) {
          const candidateIds = (values[0] as bigint[]) ?? [];
          return Promise.resolve(
            candidateIds
              .map((id) => inventoryState.get(id))
              .filter((row): row is NonNullable<typeof row> => Boolean(row))
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
              .map((row) => ({ ...row })),
          );
        }

        // Bước 3: Khóa các reservation HOLDING đã quá hạn của inventory
        if (sql.includes('SELECT id, order_id, quantity')) {
          const invId = values[0] as bigint;
          return Promise.resolve(
            reservationsState
              .filter(
                (r) =>
                  r.inventoryId === invId &&
                  r.status === 'HOLDING' &&
                  r.expired,
              )
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
              .map((r) => ({
                id: r.id,
                order_id: r.orderId,
                quantity: r.quantity,
              })),
          );
        }

        // Bước 4: Tìm các đơn PENDING_PAYMENT đã hết sạch HOLDING để hủy
        if (sql.includes('FROM orders o')) {
          const orderIds = (values[0] as string[]) ?? [];
          return Promise.resolve(
            orderIds
              .filter((id) => {
                const order = ordersState.get(id);
                if (!order || order.status !== 'PENDING_PAYMENT') return false;
                const stillHolding = reservationsState.some(
                  (r) => r.orderId === id && r.status === 'HOLDING',
                );
                return !stillHolding;
              })
              .sort()
              .map((id) => ({ id })),
          );
        }

        return Promise.resolve([]);
      },
    ),
    stockReservation: {
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: bigint };
          data: { status: 'EXPIRED'; releasedAt: Date };
        }) => {
          const row = reservationsState.find((r) => r.id === where.id);
          if (!row) return Promise.reject(new Error('Reservation not found'));
          row.status = data.status;
          row.releasedAt = data.releasedAt;
          return Promise.resolve(row);
        },
      ),
    },
    inventory: {
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: bigint };
          data: { reservedStock: { decrement: number } };
        }) => {
          const inv = inventoryState.get(where.id);
          if (!inv) return Promise.reject(new Error('Inventory not found'));
          inv.reserved_stock -= data.reservedStock.decrement;
          return Promise.resolve(inv);
        },
      ),
    },
    inventoryAuditLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return Promise.resolve(data);
      }),
    },
    order: {
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status: string };
          data: {
            status: 'CANCELLED';
            cancelledReason: string;
            cancelledAt: Date;
          };
        }) => {
          const order = ordersState.get(where.id);
          if (!order || order.status !== where.status) {
            return Promise.resolve({ count: 0 });
          }
          order.status = data.status;
          order.cancelledReason = data.cancelledReason;
          order.cancelledAt = data.cancelledAt;
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    orderStatusHistory: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        statusHistory.push(data);
        return Promise.resolve(data);
      }),
    },
  };

  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };

  const alertService = {
    evaluate: jest.fn().mockResolvedValue({ raised: 0, resolved: 0 }),
  };

  const job = new ReservationCleanupJob(prisma as never, alertService as never);

  return {
    job,
    tx,
    prisma,
    alertService,
    inventoryState,
    reservationsState,
    ordersState,
    auditLogs,
    statusHistory,
    rawQueries,
  };
}

describe('ReservationCleanupJob — Tuần 6 (STT 33 & Mục 9.3)', () => {
  it('giải phóng reserved_stock (1 -> 0), chuyển HOLDING -> EXPIRED, hủy đơn PENDING_PAYMENT -> CANCELLED (EXPIRED) và ghi lịch sử', async () => {
    const {
      job,
      inventoryState,
      reservationsState,
      ordersState,
      auditLogs,
      statusHistory,
      alertService,
    } = createStatefulCleanupHarness({
      initialStock: 10,
      initialReserved: 1,
    });

    const expiredCount = await job.cleanupExpired();

    expect(expiredCount).toBe(1);
    expect(inventoryState.get(1n)).toEqual({
      id: 1n,
      stock: 10,
      reserved_stock: 0,
    });
    expect(reservationsState[0].status).toBe('EXPIRED');
    expect(reservationsState[0].releasedAt).toBeInstanceOf(Date);

    const order = ordersState.get(ORDER_1)!;
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelledReason).toBe('EXPIRED');
    expect(order.cancelledAt).toBeInstanceOf(Date);

    expect(auditLogs).toEqual([
      expect.objectContaining({
        inventoryId: 1n,
        reason: 'EXPIRE',
        stockBefore: 10,
        stockAfter: 10,
        reservedBefore: 1,
        reservedAfter: 0,
        quantityDelta: 0,
        referenceType: 'stock_reservation',
        referenceId: '101',
      }),
    ]);

    expect(statusHistory).toEqual([
      {
        orderId: ORDER_1,
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'CANCELLED',
        actorId: null,
        reason: 'EXPIRED',
      },
    ]);

    expect(alertService.evaluate).toHaveBeenCalledWith(expect.anything(), [1n]);
  });

  it('tính idempotent: chạy lần 2 trả về 0, không trừ reserved_stock thêm và không ghi trùng audit/history', async () => {
    const {
      job,
      tx,
      inventoryState,
      ordersState,
      auditLogs,
      statusHistory,
      alertService,
    } = createStatefulCleanupHarness({
      initialStock: 10,
      initialReserved: 1,
    });

    // Lần chạy 1: giải phóng 1 bản ghi hết hạn
    await expect(job.cleanupExpired()).resolves.toBe(1);
    expect(inventoryState.get(1n)!.reserved_stock).toBe(0);
    expect(ordersState.get(ORDER_1)!.status).toBe('CANCELLED');
    expect(auditLogs).toHaveLength(1);
    expect(statusHistory).toHaveLength(1);

    // Lần chạy 2 (idempotent): UPDATE 0 dòng, reserved_stock giữ nguyên 0
    await expect(job.cleanupExpired()).resolves.toBe(0);
    expect(inventoryState.get(1n)!.reserved_stock).toBe(0);
    expect(tx.stockReservation.update).toHaveBeenCalledTimes(1);
    expect(tx.inventory.update).toHaveBeenCalledTimes(1);
    expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(auditLogs).toHaveLength(1);
    expect(statusHistory).toHaveLength(1);
    expect(alertService.evaluate).toHaveBeenCalledTimes(1);
  });

  it('chỉ giải phóng giữ chỗ đã quá hạn; giữ nguyên giữ chỗ còn hạn và chưa hủy đơn còn HOLDING', async () => {
    const {
      job,
      inventoryState,
      reservationsState,
      ordersState,
      statusHistory,
    } = createStatefulCleanupHarness({
      initialStock: 10,
      initialReserved: 5,
      reservations: [
        {
          id: 101n,
          inventoryId: 1n,
          orderId: ORDER_1,
          quantity: 3,
          status: 'HOLDING',
          expired: true,
        },
        {
          id: 102n,
          inventoryId: 1n,
          orderId: ORDER_1,
          quantity: 2,
          status: 'HOLDING',
          expired: false,
        },
      ],
      orders: [{ id: ORDER_1, status: 'PENDING_PAYMENT' }],
    });

    await expect(job.cleanupExpired()).resolves.toBe(1);
    expect(inventoryState.get(1n)!.reserved_stock).toBe(2);
    expect(reservationsState[0].status).toBe('EXPIRED');
    expect(reservationsState[1].status).toBe('HOLDING');
    // Đơn vẫn còn 1 reservation HOLDING chưa hết hạn nên chưa bị hủy
    expect(ordersState.get(ORDER_1)!.status).toBe('PENDING_PAYMENT');
    expect(statusHistory).toHaveLength(0);
  });

  it('sử dụng truy vấn khớp partial index idx_res_cleanup và khóa FOR UPDATE SKIP LOCKED theo thứ tự tăng dần', async () => {
    const { job, rawQueries } = createStatefulCleanupHarness({
      initialStock: 10,
      initialReserved: 2,
      reservations: [
        {
          id: 201n,
          inventoryId: 1n,
          orderId: ORDER_2,
          quantity: 2,
          status: 'HOLDING',
          expired: true,
        },
      ],
      orders: [{ id: ORDER_2, status: 'PENDING_PAYMENT' }],
    });

    await job.cleanupExpired();

    // Truy vấn đầu tiên phải lọc trực tiếp trên stock_reservations với status = 'HOLDING' AND expires_at <= NOW()
    // để PostgreSQL Planner chọn Index Scan using idx_res_cleanup.
    expect(rawQueries[0]).toContain('FROM stock_reservations r');
    expect(rawQueries[0]).toContain("r.status = 'HOLDING'");
    expect(rawQueries[0]).toContain('r.expires_at <= NOW()');
    expect(rawQueries[0]).toContain('ORDER BY r.inventory_id ASC');

    // Truy vấn thứ hai khóa inventory theo i.id tăng dần + FOR UPDATE OF i SKIP LOCKED
    expect(rawQueries[1]).toContain('FROM inventory i');
    expect(rawQueries[1]).toContain('ORDER BY i.id');
    expect(rawQueries[1]).toContain('FOR UPDATE OF i SKIP LOCKED');

    // Truy vấn thứ ba khóa stock_reservations theo id tăng dần + FOR UPDATE SKIP LOCKED
    expect(rawQueries[2]).toContain('FROM stock_reservations');
    expect(rawQueries[2]).toContain('ORDER BY id');
    expect(rawQueries[2]).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('ném lỗi để rollback transaction nếu reserved_stock nhỏ hơn quantity cần giải phóng', async () => {
    const { job } = createStatefulCleanupHarness({
      initialStock: 10,
      initialReserved: 1,
      reservations: [
        {
          id: 301n,
          inventoryId: 1n,
          orderId: ORDER_1,
          quantity: 4,
          status: 'HOLDING',
          expired: true,
        },
      ],
    });

    await expect(job.cleanupExpired()).rejects.toThrow(
      'Invalid reserved stock for inventory 1',
    );
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
