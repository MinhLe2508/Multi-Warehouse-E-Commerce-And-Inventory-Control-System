import type { OrderStatus, ReservationStatus } from '@prisma/client';
import { InventoryStockPort } from './inventory-stock.port';
import { ReservationRepository } from './reservation.repository';
import {
  InsufficientStockException,
  InventoryNotFoundException,
} from './stock-reservation.errors';
import type {
  LockedOrder,
  OrderItemRef,
  ReservationRecord,
  ReserveStockInput,
  SettleStockInput,
  TransactionClient,
} from './stock-reservation.types';

/**
  CSDL giả lập TRONG BỘ NHỚ dùng cho unit test của StockReservationService (chỉ dùng trong test).

  Mô phỏng đúng những tính chất mà service phụ thuộc vào PostgreSQL:
  - Mỗi "transaction" có khóa dòng (SELECT ... FOR UPDATE) cho order, inventory, reservation.
    Giao dịch đến sau PHẢI CHỜ giao dịch giữ khóa kết thúc (commit/rollback).
  - Phát hiện deadlock như PostgreSQL (chu trình chờ khóa -> ném DeadlockDetectedError).
  - Rollback hoàn tác mọi ghi của transaction khi có lỗi (không còn "reservation ma").
  - fn_reserve_stock: khóa inventory, kiểm tra available, tăng reserved_stock, tạo HOLDING + audit.

  Đây KHÔNG chứng minh hành vi của PostgreSQL thật; phần đó do file
  stock-reservation.integration.spec.ts chạy với DB thật kiểm tra.
 */

export class DeadlockDetectedError extends Error {
  constructor() {
    super('deadlock detected');
    this.name = 'DeadlockDetectedError';
  }
}

export interface FakeAudit {
  inventoryId: bigint;
  reason: string;
  stockBefore: number;
  stockAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  quantityDelta: number;
  referenceType: string;
  referenceId: string;
  actorId: string | null;
}

interface FakeReservation extends ReservationRecord {
  committedAt: Date | null;
  releasedAt: Date | null;
}

interface FakeOrder {
  status: OrderStatus;
  reservationExpiresAt: Date | null;
}

export class FakeTx {
  readonly held = new Set<string>();
  readonly undo: Array<() => void> = [];
  waitingFor: string | undefined;
  constructor(readonly id: number) {}
}

const asFake = (tx: TransactionClient): FakeTx => tx as unknown as FakeTx;
const asTx = (tx: FakeTx): TransactionClient =>
  tx as unknown as TransactionClient;

export class InMemoryStockDb {
  readonly inventories = new Map<bigint, { stock: number; reserved: number }>();
  readonly reservations = new Map<bigint, FakeReservation>();
  readonly audits: FakeAudit[] = [];
  readonly orders = new Map<string, FakeOrder>();
  readonly orderItems = new Map<string, OrderItemRef & { orderId: string }>();

  nowMs = Date.parse('2026-10-20T08:00:00.000Z');
  // Móc để test mô phỏng "transaction kéo dài" (đồng hồ chạy trong lúc giữ chỗ).
  afterReserve: (() => void) | undefined;

  private seq = 0n;
  private txSeq = 0;
  private readonly owners = new Map<string, FakeTx>();
  private readonly waiters = new Map<
    string,
    Array<{ tx: FakeTx; resolve: () => void }>
  >();

  readonly port: InventoryStockPort = new FakeInventoryPort(this);
  readonly repository: ReservationRepository = new FakeReservationRepository(
    this,
  );

  // ---- dựng dữ liệu ----
  seedInventory(id: bigint, stock: number, reserved = 0): void {
    this.inventories.set(id, { stock, reserved });
  }

  advanceMinutes(minutes: number): void {
    this.nowMs += minutes * 60_000;
  }

  now(): Date {
    return new Date(this.nowMs);
  }

  // Tạo đơn + order items trong transaction (như OrdersService làm); rollback sẽ xóa đơn.
  async createOrder(
    tx: TransactionClient,
    orderId: string,
    lines: Array<{ itemId: string; inventoryId: bigint; quantity: number }>,
    status: OrderStatus = 'PENDING_PAYMENT',
  ): Promise<void> {
    const t = asFake(tx);
    await this.tick();
    this.orders.set(orderId, { status, reservationExpiresAt: null });
    t.undo.push(() => this.orders.delete(orderId));
    this.acquireSync(t, `order:${orderId}`);
    for (const line of lines) {
      this.orderItems.set(line.itemId, {
        id: line.itemId,
        orderId,
        inventoryId: line.inventoryId,
        quantity: line.quantity,
      });
      t.undo.push(() => this.orderItems.delete(line.itemId));
    }
  }

  // ---- transaction ----
  async transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
    const tx = new FakeTx(++this.txSeq);
    try {
      const result = await fn(asTx(tx));
      this.release(tx);
      return result;
    } catch (error) {
      for (const undo of tx.undo.reverse()) undo();
      this.release(tx);
      throw error;
    }
  }

  // Nhường lượt để các transaction chạy song song được xen kẽ (giống độ trễ mạng).
  tick(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  nextId(): bigint {
    this.seq += 1n;
    return this.seq;
  }

  // ---- khóa dòng ----
  async acquire(tx: FakeTx, key: string): Promise<void> {
    const owner = this.owners.get(key);
    if (!owner) {
      this.acquireSync(tx, key);
      return;
    }
    if (owner === tx) return;

    // Phát hiện chu trình chờ khóa giống PostgreSQL.
    let current: FakeTx | undefined = owner;
    while (current) {
      if (current === tx) throw new DeadlockDetectedError();
      current = current.waitingFor
        ? this.owners.get(current.waitingFor)
        : undefined;
    }

    tx.waitingFor = key;
    await new Promise<void>((resolve) => {
      const queue = this.waiters.get(key) ?? [];
      queue.push({ tx, resolve });
      this.waiters.set(key, queue);
    });
    tx.waitingFor = undefined;
  }

  private acquireSync(tx: FakeTx, key: string): void {
    if (!this.owners.has(key)) {
      this.owners.set(key, tx);
      tx.held.add(key);
    }
  }

  private release(tx: FakeTx): void {
    for (const key of tx.held) {
      this.owners.delete(key);
      const next = this.waiters.get(key)?.shift();
      if (next) {
        this.owners.set(key, next.tx);
        next.tx.held.add(key);
        next.resolve();
      }
    }
    tx.held.clear();
  }

  // ---- truy vấn kiểm tra bất biến ----
  holdingSum(inventoryId: bigint): number {
    return [...this.reservations.values()]
      .filter((r) => r.inventoryId === inventoryId && r.status === 'HOLDING')
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  reservationsByStatus(status: ReservationStatus): FakeReservation[] {
    return [...this.reservations.values()].filter((r) => r.status === status);
  }
}

class FakeInventoryPort extends InventoryStockPort {
  constructor(private readonly db: InMemoryStockDb) {
    super();
  }

  async reserve(
    tx: TransactionClient,
    input: ReserveStockInput,
  ): Promise<bigint> {
    const t = asFake(tx);
    const { db } = this;
    await db.tick();
    await db.acquire(t, `inv:${input.inventoryId}`);

    const inv = db.inventories.get(input.inventoryId);
    if (!inv) throw new InventoryNotFoundException(input.inventoryId);
    if (inv.stock - inv.reserved < input.quantity) {
      throw new InsufficientStockException(input.inventoryId);
    }

    const before = { ...inv };
    inv.reserved += input.quantity;
    t.undo.push(() => Object.assign(inv, before));

    const id = db.nextId();
    db.reservations.set(id, {
      id,
      orderId: input.orderId,
      orderItemId: null,
      inventoryId: input.inventoryId,
      quantity: input.quantity,
      status: 'HOLDING',
      expiresAt: new Date(db.nowMs + input.ttlMinutes * 60_000),
      committedAt: null,
      releasedAt: null,
    });
    t.undo.push(() => db.reservations.delete(id));

    const audit: FakeAudit = {
      inventoryId: input.inventoryId,
      reason: 'RESERVE',
      stockBefore: inv.stock,
      stockAfter: inv.stock,
      reservedBefore: before.reserved,
      reservedAfter: inv.reserved,
      quantityDelta: 0,
      referenceType: 'ORDER',
      referenceId: input.orderId,
      actorId: input.actorId,
    };
    db.audits.push(audit);
    t.undo.push(() => db.audits.splice(db.audits.indexOf(audit), 1));

    db.afterReserve?.();
    return id;
  }

  async lockInventories(tx: TransactionClient, ids: bigint[]): Promise<void> {
    // Khóa ĐÚNG thứ tự được truyền vào, nên service nào quên sắp xếp sẽ bị deadlock.
    for (const id of ids) {
      await this.db.tick();
      await this.db.acquire(asFake(tx), `inv:${id}`);
    }
  }

  async settle(tx: TransactionClient, input: SettleStockInput): Promise<void> {
    const t = asFake(tx);
    const { db } = this;
    for (const { inventoryId, quantity } of input.changes) {
      await db.tick();
      await db.acquire(t, `inv:${inventoryId}`);
      const inv = db.inventories.get(inventoryId);
      if (!inv) throw new InventoryNotFoundException(inventoryId);

      const before = { ...inv };
      const stockDelta = input.reason === 'COMMIT' ? quantity : 0;
      inv.stock -= stockDelta;
      inv.reserved -= quantity;
      if (inv.stock < 0 || inv.reserved < 0 || inv.reserved > inv.stock) {
        throw new Error('CHECK constraint violated (fake)');
      }
      t.undo.push(() => Object.assign(inv, before));

      const audit: FakeAudit = {
        inventoryId,
        reason: input.reason,
        stockBefore: before.stock,
        stockAfter: inv.stock,
        reservedBefore: before.reserved,
        reservedAfter: inv.reserved,
        quantityDelta: inv.stock - before.stock,
        referenceType: 'ORDER',
        referenceId: input.orderId,
        actorId: input.actorId,
      };
      db.audits.push(audit);
      t.undo.push(() => db.audits.splice(db.audits.indexOf(audit), 1));
    }
  }
}

class FakeReservationRepository extends ReservationRepository {
  constructor(private readonly db: InMemoryStockDb) {
    super();
  }

  async lockOrder(
    tx: TransactionClient,
    orderId: string,
  ): Promise<LockedOrder | null> {
    await this.db.tick();
    await this.db.acquire(asFake(tx), `order:${orderId}`);
    const order = this.db.orders.get(orderId);
    return order ? { id: orderId, status: order.status } : null;
  }

  async now(): Promise<Date> {
    await this.db.tick();
    return this.db.now();
  }

  async findOrderItems(
    _tx: TransactionClient,
    orderId: string,
    ids: string[],
  ): Promise<OrderItemRef[]> {
    await this.db.tick();
    const found: OrderItemRef[] = [];
    for (const id of ids) {
      const item = this.db.orderItems.get(id);
      if (item && item.orderId === orderId) {
        found.push({
          id: item.id,
          inventoryId: item.inventoryId,
          quantity: item.quantity,
        });
      }
    }
    return found;
  }

  async getReservations(
    _tx: TransactionClient,
    orderId: string,
  ): Promise<ReservationRecord[]> {
    await this.db.tick();
    return this.listFor(orderId);
  }

  async lockReservations(
    tx: TransactionClient,
    orderId: string,
  ): Promise<ReservationRecord[]> {
    for (const r of this.listFor(orderId).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )) {
      await this.db.tick();
      await this.db.acquire(asFake(tx), `res:${r.id}`);
    }
    return this.listFor(orderId).sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async linkReservation(
    tx: TransactionClient,
    reservationId: bigint,
    orderItemId: string,
  ): Promise<ReservationRecord> {
    await this.db.tick();
    const row = this.db.reservations.get(reservationId);
    if (!row) throw new Error('reservation not found (fake)');
    const previous = row.orderItemId;
    row.orderItemId = orderItemId;
    asFake(tx).undo.push(() => {
      row.orderItemId = previous;
    });
    return { ...row };
  }

  async setOrderReservationExpiry(
    tx: TransactionClient,
    orderId: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.tick();
    const order = this.db.orders.get(orderId);
    if (!order) throw new Error('order not found (fake)');
    const previous = order.reservationExpiresAt;
    order.reservationExpiresAt = expiresAt;
    asFake(tx).undo.push(() => {
      order.reservationExpiresAt = previous;
    });
  }

  async markReservations(
    tx: TransactionClient,
    ids: bigint[],
    to: Exclude<ReservationStatus, 'HOLDING'>,
    at: Date,
  ): Promise<number> {
    await this.db.tick();
    let count = 0;
    for (const id of ids) {
      const row = this.db.reservations.get(id);
      if (!row || row.status !== 'HOLDING') continue;
      const before = { ...row };
      row.status = to;
      if (to === 'COMMITTED') row.committedAt = at;
      else row.releasedAt = at;
      asFake(tx).undo.push(() => Object.assign(row, before));
      count += 1;
    }
    return count;
  }

  private listFor(orderId: string): FakeReservation[] {
    return [...this.db.reservations.values()]
      .filter((r) => r.orderId === orderId)
      .sort((a, b) =>
        a.inventoryId < b.inventoryId
          ? -1
          : a.inventoryId > b.inventoryId
            ? 1
            : a.id < b.id
              ? -1
              : 1,
      )
      .map((r) => ({ ...r }));
  }
}
