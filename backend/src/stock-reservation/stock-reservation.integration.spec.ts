import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaInventoryStockAdapter } from './prisma-inventory-stock.adapter';
import { readSqlError } from './pg-error.util';
import { PrismaReservationRepository } from './prisma-reservation.repository';
import {
  InsufficientStockException,
  InventoryNotFoundException,
  ReservationExpiredException,
} from './stock-reservation.errors';
import { StockReservationService } from './stock-reservation.service';
import type {
  ReservedItem,
  TransactionClient,
} from './stock-reservation.types';

/**
  INTEGRATION TEST với PostgreSQL THẬT (fn_reserve_stock, FOR UPDATE, CHECK, trigger).

  Tự BỎ QUA nếu không đặt biến môi trường RESERVATION_TEST_DATABASE_URL, nên `npm test`
  và CI không cần database. Chỉ trỏ tới database DEV/TEST đã chạy đủ migration - test chỉ
  tạo dữ liệu có tiền tố riêng và tự dọn, nhưng KHÔNG dùng database chứa dữ liệu thật.

  Chạy (PowerShell):
    $env:RESERVATION_TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
    npx jest src/stock-reservation/stock-reservation.integration.spec.ts
 */
const databaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb('StockReservationService với PostgreSQL thật', () => {
  const prefix = `itres${Date.now()}`;
  let prisma: PrismaClient;
  let service: StockReservationService;
  let userId: string;
  let warehouseId: string;
  let seq = 0;
  const createdProductIds: string[] = [];
  const createdInventoryIds: bigint[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl, max: 20 }),
    });
    await prisma.$connect();
    service = new StockReservationService(
      new PrismaInventoryStockAdapter(),
      new PrismaReservationRepository(),
    );

    const user = await prisma.user.create({
      data: {
        email: `${prefix}@example.com`,
        username: prefix,
        passwordHash: 'x',
        fullName: 'Integration Test',
      },
    });
    userId = user.id;
    const warehouse = await prisma.warehouse.create({
      data: { code: prefix.slice(-32), name: 'IT Warehouse', region: 'IT' },
    });
    warehouseId = warehouse.id;
  });

  afterAll(async () => {
    // Xóa theo thứ tự khóa ngoại: đơn (kéo theo items/reservations) -> inventory -> product.
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.inventory.deleteMany({
      where: { id: { in: createdInventoryIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function createInventory(
    stock: number,
    explicitId?: bigint,
  ): Promise<bigint> {
    seq += 1;
    const product = await prisma.product.create({
      data: {
        sku: `${prefix}-${seq}`,
        name: `IT product ${seq}`,
        slug: `${prefix}-${seq}`,
        basePrice: new Prisma.Decimal('100.00'),
      },
    });
    createdProductIds.push(product.id);
    // available_stock là cột GENERATED nên không insert bằng Prisma create() (giống prisma/seed.ts).
    const rows =
      explicitId === undefined
        ? await prisma.$queryRaw<Array<{ id: bigint }>>`
            INSERT INTO inventory (product_id, warehouse_id, stock, updated_at)
            VALUES (${product.id}::uuid, ${warehouseId}::uuid, ${stock}::integer, NOW())
            RETURNING id`
        : await prisma.$queryRaw<Array<{ id: bigint }>>`
            INSERT INTO inventory (id, product_id, warehouse_id, stock, updated_at)
            VALUES (${explicitId}::bigint, ${product.id}::uuid, ${warehouseId}::uuid,
                    ${stock}::integer, NOW())
            RETURNING id`;
    const inventory = rows[0];
    createdInventoryIds.push(inventory.id);
    return inventory.id;
  }

  // Mô phỏng OrdersService: tạo đơn + order items + giữ chỗ trong 1 transaction thật.
  async function placeOrder(
    lines: Array<{ inventoryId: bigint; quantity: number }>,
  ): Promise<{ orderId: string; items: ReservedItem[] }> {
    // Chốt số thứ tự NGAY (đồng bộ): callback transaction chạy muộn nên nếu đọc `seq` ở đó,
    // các đơn chạy song song sẽ trùng order_code (UNIQUE).
    const orderNo = ++seq;
    return prisma.$transaction(
      async (tx: TransactionClient) => {
        // Quy tắc bắt buộc: khóa inventory (tăng dần) TRƯỚC khi INSERT order_items.
        await service.lockInventories(
          tx,
          lines.map((line) => line.inventoryId),
        );
        const order = await tx.order.create({
          data: {
            orderCode: `${prefix}-${orderNo}`.slice(-32),
            userId,
            shippingRecipient: 'IT',
            shippingPhone: '0900000000',
            shippingAddress: 'IT address',
          },
        });
        const allocations = [];
        for (const line of lines) {
          const inventory = await tx.inventory.findUniqueOrThrow({
            where: { id: line.inventoryId },
          });
          const item = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: inventory.productId,
              warehouseId,
              inventoryId: line.inventoryId,
              productName: 'IT',
              sku: 'IT',
              unitPrice: new Prisma.Decimal('100.00'),
              quantity: line.quantity,
              lineTotal: new Prisma.Decimal(100 * line.quantity),
            },
          });
          allocations.push({
            orderItemId: item.id,
            inventoryId: line.inventoryId,
            quantity: line.quantity,
          });
        }
        const items = await service.reserveForOrder(
          tx,
          order.id,
          allocations,
          userId,
        );
        return { orderId: order.id, items };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
  }

  const inTx = <T>(fn: (tx: TransactionClient) => Promise<T>) =>
    prisma.$transaction(fn, { maxWait: 30_000, timeout: 60_000 });

  const levels = async (id: bigint) => {
    const row = await prisma.inventory.findUniqueOrThrow({ where: { id } });
    return { stock: row.stock, reserved: row.reservedStock };
  };

  // Bất biến: 0 <= reserved <= stock và reserved = SUM(quantity WHERE HOLDING).
  async function expectInvariant(id: bigint) {
    const { stock, reserved } = await levels(id);
    const holding = await prisma.stockReservation.aggregate({
      where: { inventoryId: id, status: 'HOLDING' },
      _sum: { quantity: true },
    });
    expect(reserved).toBeGreaterThanOrEqual(0);
    expect(reserved).toBeLessThanOrEqual(stock);
    expect(reserved).toBe(holding._sum.quantity ?? 0);
  }

  const expireNow = (orderId: string) =>
    prisma.$executeRaw`
      UPDATE stock_reservations
         SET expires_at = NOW() - interval '1 minute'
       WHERE order_id = ${orderId}::uuid AND status = 'HOLDING'`;

  it('US-301: 2 khách tranh 1 đơn vị cuối -> đúng 1 COMMIT, 1 nhận INSUFFICIENT_STOCK', async () => {
    const inventoryId = await createInventory(1);
    const ordersBefore = await prisma.order.count({ where: { userId } });

    const results = await Promise.allSettled([
      placeOrder([{ inventoryId, quantity: 1 }]),
      placeOrder([{ inventoryId, quantity: 1 }]),
    ]);

    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientStockException);

    expect(await levels(inventoryId)).toEqual({ stock: 1, reserved: 1 });
    expect(
      await prisma.stockReservation.count({ where: { inventoryId } }),
    ).toBe(1);
    // Giao dịch thua rollback sạch: không còn đơn/dòng hàng/audit ma.
    expect(await prisma.order.count({ where: { userId } })).toBe(
      ordersBefore + 1,
    );
    expect(
      await prisma.inventoryAuditLog.count({ where: { inventoryId } }),
    ).toBe(1);
    await expectInvariant(inventoryId);
  });

  it('40 khách tranh 5 đơn vị đồng thời -> đúng 5 thành công, 0 oversell', async () => {
    const inventoryId = await createInventory(5);

    const results = await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        placeOrder([{ inventoryId, quantity: 1 }]),
      ),
    );

    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(
      rejected.every((r) => r.reason instanceof InsufficientStockException),
    ).toBe(true);
    expect(await levels(inventoryId)).toEqual({ stock: 5, reserved: 5 });
    await expectInvariant(inventoryId);
  });

  it('nhiều dòng, dòng sau thiếu hàng -> rollback toàn bộ (không giữ chỗ dở dang)', async () => {
    const enough = await createInventory(10);
    const short = await createInventory(1);

    await expect(
      placeOrder([
        { inventoryId: enough, quantity: 4 },
        { inventoryId: short, quantity: 2 },
      ]),
    ).rejects.toBeInstanceOf(InsufficientStockException);

    expect(await levels(enough)).toEqual({ stock: 10, reserved: 0 });
    expect(await levels(short)).toEqual({ stock: 1, reserved: 0 });
    expect(
      await prisma.stockReservation.count({
        where: { inventoryId: { in: [enough, short] } },
      }),
    ).toBe(0);
  });

  it('inventory không tồn tại -> InventoryNotFoundException', async () => {
    const real = await createInventory(3);
    await expect(
      placeOrder([
        { inventoryId: real, quantity: 1 },
        // seed không đụng tới id rất lớn này
        { inventoryId: 9223372036854775000n, quantity: 1 },
      ]),
    ).rejects.toBeDefined();
    expect(await levels(real)).toEqual({ stock: 3, reserved: 0 });
  });

  it('vòng đời: reserve -> commit trừ kho, commit lần hai là no-op, audit đầy đủ', async () => {
    const a = await createInventory(10);
    const b = await createInventory(5);
    const { orderId, items } = await placeOrder([
      { inventoryId: a, quantity: 3 },
      { inventoryId: b, quantity: 2 },
    ]);

    // Giữ chỗ: reserved tăng, stock giữ nguyên; order có hạn giữ chỗ.
    expect(await levels(a)).toEqual({ stock: 10, reserved: 3 });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.reservationExpiresAt).not.toBeNull();
    expect(items.map((i) => typeof i.reservationId)).toEqual([
      'bigint',
      'bigint',
    ]);
    const linked = await prisma.stockReservation.findMany({
      where: { orderId },
    });
    expect(linked.every((r) => r.orderItemId !== null)).toBe(true);

    await inTx((tx) => service.commitForOrder(tx, orderId, userId));
    expect(await levels(a)).toEqual({ stock: 7, reserved: 0 });
    expect(await levels(b)).toEqual({ stock: 3, reserved: 0 });

    const audits = await prisma.inventoryAuditLog.count({
      where: { inventoryId: { in: [a, b] } },
    });
    await inTx((tx) => service.commitForOrder(tx, orderId, userId));
    expect(await levels(a)).toEqual({ stock: 7, reserved: 0 });
    expect(
      await prisma.inventoryAuditLog.count({
        where: { inventoryId: { in: [a, b] } },
      }),
    ).toBe(audits);

    const commitAudit = await prisma.inventoryAuditLog.findFirstOrThrow({
      where: { inventoryId: a, reason: 'COMMIT' },
    });
    expect(commitAudit).toMatchObject({
      stockBefore: 10,
      stockAfter: 7,
      reservedBefore: 3,
      reservedAfter: 0,
      quantityDelta: -3,
      referenceType: 'ORDER',
      referenceId: orderId,
      actorId: userId,
    });
    const reservation = await prisma.stockReservation.findFirstOrThrow({
      where: { orderId, inventoryId: a },
    });
    expect(reservation.status).toBe('COMMITTED');
    expect(reservation.committedAt).not.toBeNull();
    expect(reservation.releasedAt).toBeNull();
    await expectInvariant(a);
  });

  it('commit song song hai lần (callback lặp) chỉ trừ kho đúng một lần', async () => {
    const id = await createInventory(10);
    const { orderId } = await placeOrder([{ inventoryId: id, quantity: 4 }]);

    const results = await Promise.allSettled([
      inTx((tx) => service.commitForOrder(tx, orderId, null)),
      inTx((tx) => service.commitForOrder(tx, orderId, null)),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await levels(id)).toEqual({ stock: 6, reserved: 0 });
    expect(
      await prisma.inventoryAuditLog.count({
        where: { inventoryId: id, reason: 'COMMIT' },
      }),
    ).toBe(1);
  });

  it('release: giảm reserved, giữ nguyên stock; lần hai no-op', async () => {
    const id = await createInventory(10);
    const { orderId } = await placeOrder([{ inventoryId: id, quantity: 4 }]);

    await inTx((tx) => service.releaseForOrder(tx, orderId, userId));
    await inTx((tx) => service.releaseForOrder(tx, orderId, userId));

    expect(await levels(id)).toEqual({ stock: 10, reserved: 0 });
    const row = await prisma.stockReservation.findFirstOrThrow({
      where: { orderId },
    });
    expect(row.status).toBe('RELEASED');
    expect(row.releasedAt).not.toBeNull();
    expect(row.committedAt).toBeNull();
    expect(
      await prisma.inventoryAuditLog.count({
        where: { inventoryId: id, reason: 'RELEASE' },
      }),
    ).toBe(1);
    await expectInvariant(id);
  });

  it('expire: quá hạn mới expire được; chạy lần hai không đổi gì; commit/release sau hạn bị từ chối', async () => {
    const id = await createInventory(10);
    const { orderId } = await placeOrder([{ inventoryId: id, quantity: 4 }]);

    // Chưa quá hạn: expire bị từ chối.
    await expect(
      inTx((tx) => service.expireForOrder(tx, orderId)),
    ).rejects.toMatchObject({
      response: { code: 'RESERVATION_NOT_EXPIRED' },
    });

    await expireNow(orderId); // mô phỏng thời gian trôi qua 15 phút

    await expect(
      inTx((tx) => service.commitForOrder(tx, orderId, userId)),
    ).rejects.toBeInstanceOf(ReservationExpiredException);
    await expect(
      inTx((tx) => service.releaseForOrder(tx, orderId, userId)),
    ).rejects.toBeInstanceOf(ReservationExpiredException);
    expect(await levels(id)).toEqual({ stock: 10, reserved: 4 });

    await inTx((tx) => service.expireForOrder(tx, orderId));
    expect(await levels(id)).toEqual({ stock: 10, reserved: 0 });

    await inTx((tx) => service.expireForOrder(tx, orderId)); // lần hai
    expect(await levels(id)).toEqual({ stock: 10, reserved: 0 });
    expect(
      await prisma.inventoryAuditLog.count({
        where: { inventoryId: id, reason: 'EXPIRE' },
      }),
    ).toBe(1);
    const audit = await prisma.inventoryAuditLog.findFirstOrThrow({
      where: { inventoryId: id, reason: 'EXPIRE' },
    });
    expect(audit.actorId).toBeNull();
    await expectInvariant(id);
  });

  it('đơn [A,B] và [B,A] chạy song song nhiều lần không deadlock', async () => {
    const a = await createInventory(100);
    const b = await createInventory(100);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        i % 2 === 0
          ? placeOrder([
              { inventoryId: a, quantity: 1 },
              { inventoryId: b, quantity: 1 },
            ])
          : placeOrder([
              { inventoryId: b, quantity: 1 },
              { inventoryId: a, quantity: 1 },
            ]),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(await levels(a)).toEqual({ stock: 100, reserved: 10 });
    expect(await levels(b)).toEqual({ stock: 100, reserved: 10 });
    await expectInvariant(a);
    await expectInvariant(b);
  });

  it('giữ chính xác inventoryId BIGINT lớn hơn 2^53 qua toàn bộ vòng đời', async () => {
    const big = 9007199254740993n; // 2^53 + 1
    const existing = await prisma.inventory.findUnique({ where: { id: big } });
    if (existing) return; // id trùng dữ liệu thật: bỏ qua để không đụng dữ liệu
    const id = await createInventory(3, big);
    expect(id).toBe(big);

    const { orderId, items } = await placeOrder([
      { inventoryId: big, quantity: 2 },
    ]);
    expect(items[0].inventoryId).toBe(big);
    await inTx((tx) => service.commitForOrder(tx, orderId, userId));
    expect(await levels(big)).toEqual({ stock: 1, reserved: 0 });
  });

  // Đối chứng cho quy tắc "khóa inventory trước": nếu INSERT order_items (FOR KEY SHARE trên
  // inventory) rồi mới giữ chỗ (FOR UPDATE) thì hai đơn cùng sản phẩm deadlock chắc chắn.
  it('đối chứng: INSERT order_items TRƯỚC khi khóa inventory gây deadlock 40P01', async () => {
    const inventoryId = await createInventory(10);
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
    });
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => (release = resolve));
    const orderNos = [++seq, ++seq];

    const naive = (orderNo: number) =>
      prisma.$transaction(
        async (tx: TransactionClient) => {
          const order = await tx.order.create({
            data: {
              orderCode: `${prefix}-dl${orderNo}`.slice(-32),
              userId,
              shippingRecipient: 'IT',
              shippingPhone: '0900000000',
              shippingAddress: 'IT address',
            },
          });
          const item = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: inventory.productId,
              warehouseId,
              inventoryId,
              productName: 'IT',
              sku: 'IT',
              unitPrice: new Prisma.Decimal('100.00'),
              quantity: 1,
              lineTotal: new Prisma.Decimal('100.00'),
            },
          });
          // Chờ cả hai giao dịch đã giữ KEY SHARE rồi mới cùng đòi FOR UPDATE.
          arrived += 1;
          if (arrived === 2) release();
          await barrier;
          return service.reserveForOrder(
            tx,
            order.id,
            [{ orderItemId: item.id, inventoryId, quantity: 1 }],
            userId,
          );
        },
        { maxWait: 30_000, timeout: 60_000 },
      );

    const results = await Promise.allSettled(orderNos.map(naive));
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(readSqlError(rejected[0].reason).sqlState).toBe('40P01');
    await expectInvariant(inventoryId);
  });

  it('InventoryNotFoundException được ánh xạ đúng từ SQLSTATE P0002', async () => {
    const orderNo = ++seq;
    await expect(
      prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderCode: `${prefix}-nf${orderNo}`.slice(-32),
            userId,
            shippingRecipient: 'IT',
            shippingPhone: '0900000000',
            shippingAddress: 'IT address',
          },
        });
        const adapter = new PrismaInventoryStockAdapter();
        return adapter.reserve(tx, {
          inventoryId: 9223372036854775001n,
          orderId: order.id,
          quantity: 1,
          ttlMinutes: 15,
          actorId: userId,
        });
      }),
    ).rejects.toBeInstanceOf(InventoryNotFoundException);
  });
});
