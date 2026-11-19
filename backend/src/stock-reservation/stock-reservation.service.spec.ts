import {
  DeadlockDetectedError,
  InMemoryStockDb,
} from './in-memory-stock-db.testing';
import {
  InsufficientStockException,
  InventoryNotFoundException,
  ReservationConflictException,
  ReservationExpiredException,
  ReservationNotFoundException,
  ReservationValidationException,
} from './stock-reservation.errors';
import { StockReservationService } from './stock-reservation.service';
import type {
  ReservationAllocation,
  ReservedItem,
  TransactionClient,
} from './stock-reservation.types';

// UUID v4 hợp lệ, dựng theo số để dễ đọc.
const U = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const CUSTOMER = U(900);
const WORKER = U(901);

interface Line {
  inventoryId: bigint;
  quantity: number;
}

describe('StockReservationService', () => {
  let db: InMemoryStockDb;
  let service: StockReservationService;

  beforeEach(() => {
    db = new InMemoryStockDb();
    service = new StockReservationService(db.port, db.repository);
  });

  // Mô phỏng OrdersService: tạo đơn + order items rồi giữ chỗ, tất cả trong 1 transaction.
  const placeOrder = (n: number, lines: Line[]): Promise<ReservedItem[]> =>
    db.transaction(async (tx) => {
      const orderId = U(n);
      const items = lines.map((line, i) => ({
        itemId: U(n * 100 + i + 1),
        ...line,
      }));
      await db.createOrder(tx, orderId, items);
      const allocations: ReservationAllocation[] = items.map((item) => ({
        orderItemId: item.itemId,
        inventoryId: item.inventoryId,
        quantity: item.quantity,
      }));
      return service.reserveForOrder(tx, orderId, allocations, CUSTOMER);
    });

  const inv = (id: bigint) => db.inventories.get(id)!;

  // Bất biến sau mỗi giao dịch hoàn tất (contract mục 5).
  const expectInvariant = (id: bigint) => {
    const { stock, reserved } = inv(id);
    expect(reserved).toBeGreaterThanOrEqual(0);
    expect(reserved).toBeLessThanOrEqual(stock);
    expect(reserved).toBe(db.holdingSum(id));
  };

  describe('reserveForOrder', () => {
    it('giữ chỗ: tăng reserved_stock, giữ nguyên stock, liên kết OrderItem, đặt hạn đơn', async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 5);

      const items = await placeOrder(1, [
        { inventoryId: 1n, quantity: 3 },
        { inventoryId: 2n, quantity: 2 },
      ]);

      expect(inv(1n)).toEqual({ stock: 10, reserved: 3 });
      expect(inv(2n)).toEqual({ stock: 5, reserved: 2 });
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        orderItemId: U(101),
        inventoryId: 1n,
        quantity: 3,
      });
      expect(typeof items[0].reservationId).toBe('bigint');

      // TTL 15 phút, hạn đơn = hạn của reservation.
      const expectedExpiry = db.nowMs + 15 * 60_000;
      expect(items[0].expiresAt.getTime()).toBe(expectedExpiry);
      expect(db.orders.get(U(1))!.reservationExpiresAt!.getTime()).toBe(
        expectedExpiry,
      );

      // Mỗi reservation được liên kết đúng OrderItem; audit RESERVE ghi stock không đổi.
      expect(
        [...db.reservations.values()].map((r) => [r.orderItemId, r.status]),
      ).toEqual([
        [U(101), 'HOLDING'],
        [U(102), 'HOLDING'],
      ]);
      expect(db.audits).toEqual([
        expect.objectContaining({
          inventoryId: 1n,
          reason: 'RESERVE',
          stockBefore: 10,
          stockAfter: 10,
          reservedBefore: 0,
          reservedAfter: 3,
          quantityDelta: 0,
          referenceType: 'ORDER',
          referenceId: U(1),
          actorId: CUSTOMER,
        }),
        expect.objectContaining({ inventoryId: 2n, reservedAfter: 2 }),
      ]);
      expectInvariant(1n);
      expectInvariant(2n);
    });

    it('trả kết quả theo đúng thứ tự allocations đầu vào dù xử lý theo inventoryId', async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 10);
      const items = await placeOrder(1, [
        { inventoryId: 2n, quantity: 1 },
        { inventoryId: 1n, quantity: 4 },
      ]);
      expect(items.map((i) => i.inventoryId)).toEqual([2n, 1n]);
      expect(items.map((i) => i.orderItemId)).toEqual([U(101), U(102)]);
    });

    it('xử lý inventoryId theo SỐ tăng dần (9 < 10 < 100), không theo chuỗi', async () => {
      for (const id of [9n, 10n, 100n]) db.seedInventory(id, 5);
      const spy = jest.spyOn(db.port, 'reserve');

      await placeOrder(1, [
        { inventoryId: 100n, quantity: 1 },
        { inventoryId: 9n, quantity: 1 },
        { inventoryId: 10n, quantity: 1 },
      ]);

      expect(spy.mock.calls.map(([, input]) => input.inventoryId)).toEqual([
        9n,
        10n,
        100n,
      ]);
      expect(spy.mock.calls.every(([, input]) => input.ttlMinutes === 15)).toBe(
        true,
      );
    });

    it('giữ chính xác inventoryId BIGINT lớn hơn 2^53', async () => {
      const big = 9007199254740993n; // 2^53 + 1, Number() sẽ làm tròn sai
      db.seedInventory(big, 3);
      const items = await placeOrder(1, [{ inventoryId: big, quantity: 2 }]);
      expect(items[0].inventoryId).toBe(big);
      expect(inv(big).reserved).toBe(2);
    });

    it.each([
      ['danh sách rỗng', []],
      ['quantity = 0', [{ q: 0 }]],
      ['quantity âm', [{ q: -1 }]],
      ['quantity số lẻ', [{ q: 1.5 }]],
      ['quantity NaN', [{ q: Number.NaN }]],
      ['inventoryId = 0', [{ inv: 0n }]],
      ['inventoryId âm', [{ inv: -5n }]],
      ['inventoryId vượt BIGINT', [{ inv: 9223372036854775808n }]],
      ['inventoryId là number', [{ inv: 5 as unknown as bigint }]],
      ['orderItemId không phải UUID', [{ item: 'abc' }]],
    ])('từ chối đầu vào sai (%s) trước khi chạm DB', async (_name, spec) => {
      db.seedInventory(1n, 10);
      const reserve = jest.spyOn(db.port, 'reserve');
      const lockOrder = jest.spyOn(db.repository, 'lockOrder');
      const allocations = (spec as Array<Record<string, unknown>>).map((s) => ({
        orderItemId: (s.item as string) ?? U(101),
        inventoryId: (s.inv as bigint) ?? 1n,
        quantity: (s.q as number) ?? 1,
      }));

      await expect(
        db.transaction(async (tx) => {
          await db.createOrder(tx, U(1), [
            { itemId: U(101), inventoryId: 1n, quantity: 1 },
          ]);
          return service.reserveForOrder(tx, U(1), allocations, CUSTOMER);
        }),
      ).rejects.toBeInstanceOf(ReservationValidationException);

      expect(reserve).not.toHaveBeenCalled();
      expect(lockOrder).not.toHaveBeenCalled();
      expect(inv(1n).reserved).toBe(0);
    });

    it('từ chối allocation trùng inventoryId hoặc trùng orderItemId trong cùng đơn', async () => {
      db.seedInventory(1n, 10);
      const dupInventory: ReservationAllocation[] = [
        { orderItemId: U(101), inventoryId: 1n, quantity: 1 },
        { orderItemId: U(102), inventoryId: 1n, quantity: 1 },
      ];
      const dupItem: ReservationAllocation[] = [
        { orderItemId: U(101), inventoryId: 1n, quantity: 1 },
        { orderItemId: U(101), inventoryId: 2n, quantity: 1 },
      ];
      for (const allocations of [dupInventory, dupItem]) {
        await expect(
          db.transaction((tx) =>
            service.reserveForOrder(tx, U(1), allocations, CUSTOMER),
          ),
        ).rejects.toBeInstanceOf(ReservationValidationException);
      }
      expect(inv(1n).reserved).toBe(0);
    });

    it('thiếu hàng ở một dòng -> 409 INSUFFICIENT_STOCK và rollback TOÀN BỘ đơn (R02)', async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 1);

      await expect(
        placeOrder(1, [
          { inventoryId: 1n, quantity: 4 }, // đủ hàng, được giữ trước
          { inventoryId: 2n, quantity: 2 }, // thiếu hàng
        ]),
      ).rejects.toBeInstanceOf(InsufficientStockException);

      // Dòng đầu đã giữ chỗ nhưng phải bị hoàn tác: không còn dữ liệu dở dang.
      expect(inv(1n)).toEqual({ stock: 10, reserved: 0 });
      expect(inv(2n)).toEqual({ stock: 1, reserved: 0 });
      expect(db.reservations.size).toBe(0);
      expect(db.audits).toHaveLength(0);
      expect(db.orders.size).toBe(0);
      expect(db.orderItems.size).toBe(0);
    });

    it('inventory không tồn tại -> 404 INVENTORY_NOT_FOUND và không để lại giữ chỗ (R04)', async () => {
      db.seedInventory(1n, 10);
      await expect(
        placeOrder(1, [
          { inventoryId: 1n, quantity: 1 },
          { inventoryId: 77n, quantity: 1 },
        ]),
      ).rejects.toBeInstanceOf(InventoryNotFoundException);
      expect(db.reservations.size).toBe(0);
      expect(inv(1n).reserved).toBe(0);
    });

    it('allocation không khớp OrderItem -> 500 nội bộ, không giữ chỗ nào', async () => {
      db.seedInventory(1n, 10);
      const reserve = jest.spyOn(db.port, 'reserve');
      await expect(
        db.transaction(async (tx) => {
          await db.createOrder(tx, U(1), [
            { itemId: U(101), inventoryId: 1n, quantity: 2 },
          ]);
          return service.reserveForOrder(
            tx,
            U(1),
            [{ orderItemId: U(101), inventoryId: 1n, quantity: 5 }], // sai số lượng
            CUSTOMER,
          );
        }),
      ).rejects.toMatchObject({ status: 500 });
      expect(reserve).not.toHaveBeenCalled();
    });

    it('đơn không tồn tại -> 404; đơn không phải PENDING_PAYMENT -> 409', async () => {
      db.seedInventory(1n, 10);
      const allocations = [
        { orderItemId: U(101), inventoryId: 1n, quantity: 1 },
      ];
      await expect(
        db.transaction((tx) =>
          service.reserveForOrder(tx, U(1), allocations, CUSTOMER),
        ),
      ).rejects.toBeInstanceOf(ReservationNotFoundException);

      await expect(
        db.transaction(async (tx) => {
          await db.createOrder(
            tx,
            U(2),
            [{ itemId: U(101), inventoryId: 1n, quantity: 1 }],
            'CANCELLED',
          );
          return service.reserveForOrder(tx, U(2), allocations, CUSTOMER);
        }),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_ORDER_STATE' },
      });
    });

    it('gọi reserve lần hai cho cùng đơn bị chặn, không giữ chỗ đôi (R10)', async () => {
      db.seedInventory(1n, 10);
      await placeOrder(1, [{ inventoryId: 1n, quantity: 3 }]);
      const reserve = jest.spyOn(db.port, 'reserve');

      await expect(
        db.transaction((tx) =>
          service.reserveForOrder(
            tx,
            U(1),
            [{ orderItemId: U(101), inventoryId: 1n, quantity: 3 }],
            CUSTOMER,
          ),
        ),
      ).rejects.toMatchObject({
        response: { code: 'RESERVATION_ALREADY_EXISTS' },
      });
      expect(reserve).not.toHaveBeenCalled();
      expect(inv(1n).reserved).toBe(3);
    });

    it('transaction kéo dài quá TTL -> 409 RESERVATION_EXPIRED và rollback', async () => {
      db.seedInventory(1n, 10);
      db.afterReserve = () => db.advanceMinutes(16); // chờ khóa lâu hơn 15 phút

      await expect(
        placeOrder(1, [{ inventoryId: 1n, quantity: 2 }]),
      ).rejects.toBeInstanceOf(ReservationExpiredException);

      expect(inv(1n).reserved).toBe(0);
      expect(db.reservations.size).toBe(0);
    });
  });

  describe('lockInventories (khóa kho trước khi tạo order_items)', () => {
    it('khóa theo SỐ tăng dần và loại bỏ id trùng', async () => {
      const spy = jest.spyOn(db.port, 'lockInventories');
      await db.transaction((tx) =>
        service.lockInventories(tx, [100n, 9n, 10n, 9n]),
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][1]).toEqual([9n, 10n, 100n]);
    });

    it.each([
      ['danh sách rỗng', []],
      ['id = 0', [0n]],
      ['id âm', [-1n]],
      ['id vượt BIGINT', [9223372036854775808n]],
      ['id là number', [5 as unknown as bigint]],
    ])('từ chối %s trước khi chạm DB', async (_name, ids) => {
      const spy = jest.spyOn(db.port, 'lockInventories');
      await expect(
        db.transaction((tx) => service.lockInventories(tx, ids)),
      ).rejects.toBeInstanceOf(ReservationValidationException);
      expect(spy).not.toHaveBeenCalled();
    });

    it('hai giao dịch khóa [A,B] và [B,A] qua service không deadlock', async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 10);
      const results = await Promise.allSettled([
        db.transaction((tx) => service.lockInventories(tx, [1n, 2n])),
        db.transaction((tx) => service.lockInventories(tx, [2n, 1n])),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    });
  });

  describe('commitForOrder', () => {
    beforeEach(async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 5);
      await placeOrder(1, [
        { inventoryId: 1n, quantity: 3 },
        { inventoryId: 2n, quantity: 2 },
      ]);
    });

    it('HOLDING còn hạn -> COMMITTED: stock và reserved cùng giảm, ghi audit COMMIT', async () => {
      await db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER));

      expect(inv(1n)).toEqual({ stock: 7, reserved: 0 });
      expect(inv(2n)).toEqual({ stock: 3, reserved: 0 });
      expect(db.reservationsByStatus('COMMITTED')).toHaveLength(2);
      const committed = db.reservationsByStatus('COMMITTED')[0];
      expect(committed.committedAt).toEqual(db.now());
      expect(committed.releasedAt).toBeNull();

      const commitAudits = db.audits.filter((a) => a.reason === 'COMMIT');
      expect(commitAudits).toEqual([
        expect.objectContaining({
          inventoryId: 1n,
          stockBefore: 10,
          stockAfter: 7,
          reservedBefore: 3,
          reservedAfter: 0,
          quantityDelta: -3,
          referenceType: 'ORDER',
          referenceId: U(1),
          actorId: WORKER,
        }),
        expect.objectContaining({ inventoryId: 2n, quantityDelta: -2 }),
      ]);
      expectInvariant(1n);
      expectInvariant(2n);
    });

    it.each(['commit', 'release', 'expire'] as const)(
      'thứ tự khóa của %s: Order -> Inventory (tăng dần) -> Reservation (D08)',
      async (action) => {
        const lockOrder = jest.spyOn(db.repository, 'lockOrder');
        const lockInventories = jest.spyOn(db.port, 'lockInventories');
        const lockReservations = jest.spyOn(db.repository, 'lockReservations');
        if (action === 'expire') db.advanceMinutes(15);

        await db.transaction((tx) =>
          action === 'commit'
            ? service.commitForOrder(tx, U(1), WORKER)
            : action === 'release'
              ? service.releaseForOrder(tx, U(1), CUSTOMER)
              : service.expireForOrder(tx, U(1)),
        );

        expect(lockOrder.mock.invocationCallOrder[0]).toBeLessThan(
          lockInventories.mock.invocationCallOrder[0],
        );
        expect(lockInventories.mock.invocationCallOrder[0]).toBeLessThan(
          lockReservations.mock.invocationCallOrder[0],
        );
        expect(lockInventories.mock.calls[0][1]).toEqual([1n, 2n]);
      },
    );

    it('commit lần hai là no-op: không trừ kho thêm, không ghi audit thêm', async () => {
      await db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER));
      const auditsAfterFirst = db.audits.length;

      await db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER));

      expect(inv(1n)).toEqual({ stock: 7, reserved: 0 });
      expect(db.audits).toHaveLength(auditsAfterFirst);
    });

    it('commit hai callback SUCCESS song song chỉ trừ kho đúng một lần (R05)', async () => {
      const results = await Promise.allSettled([
        db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER)),
        db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER)),
      ]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(inv(1n)).toEqual({ stock: 7, reserved: 0 });
      expect(db.audits.filter((a) => a.reason === 'COMMIT')).toHaveLength(2);
      expectInvariant(1n);
    });

    it('giữ chỗ đã quá hạn -> 409 RESERVATION_EXPIRED, không đổi dữ liệu', async () => {
      db.advanceMinutes(15);

      await expect(
        db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER)),
      ).rejects.toBeInstanceOf(ReservationExpiredException);

      expect(inv(1n)).toEqual({ stock: 10, reserved: 3 });
      expect(db.reservationsByStatus('HOLDING')).toHaveLength(2);
    });

    it('callback chờ khóa qua hạn thì bị từ chối: dùng giờ SAU khi có khóa (R13)', async () => {
      // Một giao dịch khác (vd. hủy đơn) đang giữ khóa đơn và kéo dài quá hạn giữ chỗ.
      const holder = db.transaction(async (tx) => {
        await db.repository.lockOrder(tx, U(1));
        await db.tick();
        await db.tick();
        db.advanceMinutes(16);
      });
      await db.tick();
      const callback = db.transaction((tx) =>
        service.commitForOrder(tx, U(1), WORKER),
      );

      await holder;
      await expect(callback).rejects.toBeInstanceOf(
        ReservationExpiredException,
      );
      expect(inv(1n)).toEqual({ stock: 10, reserved: 3 });
    });

    it('xung đột khi giữ chỗ đã RELEASED hoặc EXPIRED, và 404 khi đơn chưa có giữ chỗ', async () => {
      await db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER));
      await expect(
        db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER)),
      ).rejects.toMatchObject({
        response: { code: 'INVALID_RESERVATION_STATE' },
      });

      await expect(
        db.transaction(async (tx) => {
          await db.createOrder(tx, U(2), []);
          return service.commitForOrder(tx, U(2), WORKER);
        }),
      ).rejects.toMatchObject({
        response: { code: 'RESERVATION_NOT_FOUND' },
      });
    });

    it('gộp nhiều reservation của cùng một inventory thành một UPDATE và một audit', async () => {
      // Dữ liệu cũ/nhập tay có thể có 2 HOLDING trên cùng inventory của một đơn.
      db.seedInventory(3n, 10, 5);
      await db.transaction(async (tx) => {
        await db.createOrder(tx, U(3), []);
      });
      for (const q of [2, 3]) {
        const id = db.nextId();
        db.reservations.set(id, {
          id,
          orderId: U(3),
          orderItemId: null,
          inventoryId: 3n,
          quantity: q,
          status: 'HOLDING',
          expiresAt: new Date(db.nowMs + 60_000),
          committedAt: null,
          releasedAt: null,
        });
      }

      await db.transaction((tx) => service.commitForOrder(tx, U(3), WORKER));

      expect(inv(3n)).toEqual({ stock: 5, reserved: 0 });
      expect(
        db.audits.filter((a) => a.inventoryId === 3n && a.reason === 'COMMIT'),
      ).toEqual([expect.objectContaining({ quantityDelta: -5 })]);
    });
  });

  describe('releaseForOrder', () => {
    beforeEach(async () => {
      db.seedInventory(1n, 10);
      await placeOrder(1, [{ inventoryId: 1n, quantity: 4 }]);
    });

    it('HOLDING còn hạn -> RELEASED: chỉ giảm reserved_stock, stock giữ nguyên', async () => {
      await db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER));

      expect(inv(1n)).toEqual({ stock: 10, reserved: 0 });
      const released = db.reservationsByStatus('RELEASED')[0];
      expect(released.releasedAt).toEqual(db.now());
      expect(released.committedAt).toBeNull();
      expect(db.audits.at(-1)).toMatchObject({
        reason: 'RELEASE',
        stockBefore: 10,
        stockAfter: 10,
        reservedBefore: 4,
        reservedAfter: 0,
        quantityDelta: 0,
        actorId: CUSTOMER,
      });
      expectInvariant(1n);
    });

    it('release lần hai là no-op', async () => {
      await db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER));
      const audits = db.audits.length;
      await db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER));
      expect(db.audits).toHaveLength(audits);
      expect(inv(1n).reserved).toBe(0);
    });

    it('quá hạn thì không release được (phải dùng expire); đã COMMITTED thì xung đột', async () => {
      db.advanceMinutes(20);
      await expect(
        db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER)),
      ).rejects.toBeInstanceOf(ReservationExpiredException);

      db.advanceMinutes(-20);
      await db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER));
      await expect(
        db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER)),
      ).rejects.toBeInstanceOf(ReservationConflictException);
      expect(inv(1n)).toEqual({ stock: 6, reserved: 0 });
    });
  });

  describe('expireForOrder', () => {
    beforeEach(async () => {
      db.seedInventory(1n, 10);
      await placeOrder(1, [{ inventoryId: 1n, quantity: 4 }]);
    });

    it('HOLDING quá hạn -> EXPIRED: giảm reserved_stock, audit EXPIRE với actor null', async () => {
      db.advanceMinutes(15);
      await db.transaction((tx) => service.expireForOrder(tx, U(1)));

      expect(inv(1n)).toEqual({ stock: 10, reserved: 0 });
      expect(db.reservationsByStatus('EXPIRED')).toHaveLength(1);
      expect(db.audits.at(-1)).toMatchObject({
        reason: 'EXPIRE',
        quantityDelta: 0,
        reservedBefore: 4,
        reservedAfter: 0,
        actorId: null,
      });
      expectInvariant(1n);
    });

    it('cleanup chạy hai lần: lần hai không giảm reserved_stock hay ghi audit thêm (R09)', async () => {
      db.seedInventory(2n, 10);
      await placeOrder(2, [{ inventoryId: 2n, quantity: 1 }]);
      db.advanceMinutes(15);

      await db.transaction((tx) => service.expireForOrder(tx, U(1)));
      const audits = db.audits.length;
      await db.transaction((tx) => service.expireForOrder(tx, U(1)));

      expect(db.audits).toHaveLength(audits);
      expect(inv(1n).reserved).toBe(0);
      expect(inv(2n).reserved).toBe(1); // đơn khác không bị ảnh hưởng
    });

    it('chưa quá hạn -> 409 RESERVATION_NOT_EXPIRED; đã COMMITTED -> xung đột, không expire', async () => {
      await expect(
        db.transaction((tx) => service.expireForOrder(tx, U(1))),
      ).rejects.toMatchObject({
        response: { code: 'RESERVATION_NOT_EXPIRED' },
      });

      await db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER));
      db.advanceMinutes(30);
      await expect(
        db.transaction((tx) => service.expireForOrder(tx, U(1))),
      ).rejects.toBeInstanceOf(ReservationConflictException);
      expect(inv(1n)).toEqual({ stock: 6, reserved: 0 });
    });
  });

  // Kịch bản US-301 / mục 9.2 tài liệu CSDL&ERD: tranh mua đơn vị tồn kho cuối cùng.
  describe('tranh chấp đồng thời (US-301, NFR-04.1: 0 oversell)', () => {
    it('2 khách tranh 1 đơn vị cuối: đúng 1 giữ được, 1 nhận INSUFFICIENT_STOCK', async () => {
      db.seedInventory(1n, 1);

      const results = await Promise.allSettled([
        placeOrder(1, [{ inventoryId: 1n, quantity: 1 }]),
        placeOrder(2, [{ inventoryId: 1n, quantity: 1 }]),
      ]);

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(lost[0].reason).toBeInstanceOf(InsufficientStockException);

      // reserved_stock nhất quán, không oversell.
      expect(inv(1n)).toEqual({ stock: 1, reserved: 1 });
      expect(db.reservationsByStatus('HOLDING')).toHaveLength(1);
      expectInvariant(1n);

      // Không có "reservation ma": giao dịch thua rollback sạch (đơn, dòng hàng, audit).
      expect(db.reservations.size).toBe(1);
      expect(db.audits).toHaveLength(1);
      expect(db.orders.size).toBe(1);
      expect(db.orderItems.size).toBe(1);
    });

    it('20 khách cùng tranh 5 đơn vị: đúng 5 thành công, reserved = 5', async () => {
      db.seedInventory(1n, 5);

      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          placeOrder(i + 1, [{ inventoryId: 1n, quantity: 1 }]),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(rejected).toHaveLength(15);
      expect(
        rejected.every((r) => r.reason instanceof InsufficientStockException),
      ).toBe(true);
      expect(inv(1n)).toEqual({ stock: 5, reserved: 5 });
      expect(db.reservations.size).toBe(5);
      expect(db.audits).toHaveLength(5);
      expectInvariant(1n);
    });

    it('hai đơn giữ [A,B] và [B,A] cùng lúc không bị deadlock vì luôn khóa tăng dần', async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 10);

      const results = await Promise.allSettled([
        placeOrder(1, [
          { inventoryId: 1n, quantity: 1 },
          { inventoryId: 2n, quantity: 1 },
        ]),
        placeOrder(2, [
          { inventoryId: 2n, quantity: 1 },
          { inventoryId: 1n, quantity: 1 },
        ]),
      ]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(inv(1n).reserved).toBe(2);
      expect(inv(2n).reserved).toBe(2);
    });

    it('đối chứng: nếu khóa theo thứ tự ngược nhau thì CSDL giả lập phát hiện deadlock', async () => {
      db.seedInventory(1n, 10);
      db.seedInventory(2n, 10);
      const lockInOrder = (ids: bigint[]) =>
        db.transaction(async (tx: TransactionClient) => {
          for (const id of ids) await db.port.lockInventories(tx, [id]);
        });

      const results = await Promise.allSettled([
        lockInOrder([1n, 2n]),
        lockInOrder([2n, 1n]),
      ]);

      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(DeadlockDetectedError);
    });

    it('commit và release của cùng một đơn chạy song song: chỉ một kết cục hợp lệ', async () => {
      db.seedInventory(1n, 10);
      await placeOrder(1, [{ inventoryId: 1n, quantity: 4 }]);

      const results = await Promise.allSettled([
        db.transaction((tx) => service.commitForOrder(tx, U(1), WORKER)),
        db.transaction((tx) => service.releaseForOrder(tx, U(1), CUSTOMER)),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const { stock, reserved } = inv(1n);
      expect(reserved).toBe(0);
      expect([10, 6]).toContain(stock); // release giữ nguyên stock, commit trừ 4
      expectInvariant(1n);
    });
  });
});
