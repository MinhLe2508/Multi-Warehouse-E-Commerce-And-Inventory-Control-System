import { Injectable } from '@nestjs/common';
import type { OrderStatus, ReservationStatus } from '@prisma/client';
import { ReservationRepository } from './reservation.repository';
import type {
  LockedOrder,
  OrderItemRef,
  ReservationRecord,
  TransactionClient,
} from './stock-reservation.types';

interface ReservationRow {
  id: bigint;
  order_id: string;
  order_item_id: string | null;
  inventory_id: bigint;
  quantity: number;
  status: ReservationStatus;
  expires_at: Date;
}

const toRecord = (row: ReservationRow): ReservationRecord => ({
  id: row.id,
  orderId: row.order_id,
  orderItemId: row.order_item_id,
  inventoryId: row.inventory_id,
  quantity: row.quantity,
  status: row.status,
  expiresAt: row.expires_at,
});

@Injectable()
export class PrismaReservationRepository extends ReservationRepository {
  async lockOrder(
    tx: TransactionClient,
    orderId: string,
  ): Promise<LockedOrder | null> {
    const rows = await tx.$queryRaw<Array<{ id: string; status: OrderStatus }>>`
      SELECT id, status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  async now(tx: TransactionClient): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`
      SELECT clock_timestamp() AS now`;
    return rows[0].now;
  }

  async findOrderItems(
    tx: TransactionClient,
    orderId: string,
    orderItemIds: string[],
  ): Promise<OrderItemRef[]> {
    return tx.orderItem.findMany({
      where: { orderId, id: { in: orderItemIds } },
      select: { id: true, inventoryId: true, quantity: true },
    });
  }

  async getReservations(
    tx: TransactionClient,
    orderId: string,
  ): Promise<ReservationRecord[]> {
    return tx.stockReservation.findMany({
      where: { orderId },
      orderBy: [{ inventoryId: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        orderId: true,
        orderItemId: true,
        inventoryId: true,
        quantity: true,
        status: true,
        expiresAt: true,
      },
    });
  }

  async lockReservations(
    tx: TransactionClient,
    orderId: string,
  ): Promise<ReservationRecord[]> {
    const rows = await tx.$queryRaw<ReservationRow[]>`
      SELECT id, order_id, order_item_id, inventory_id, quantity,
             status, expires_at
        FROM stock_reservations
       WHERE order_id = ${orderId}::uuid
       ORDER BY id
         FOR UPDATE`;
    return rows.map(toRecord);
  }

  async linkReservation(
    tx: TransactionClient,
    reservationId: bigint,
    orderItemId: string,
  ): Promise<ReservationRecord> {
    return tx.stockReservation.update({
      where: { id: reservationId },
      data: { orderItemId },
      select: {
        id: true,
        orderId: true,
        orderItemId: true,
        inventoryId: true,
        quantity: true,
        status: true,
        expiresAt: true,
      },
    });
  }

  async setOrderReservationExpiry(
    tx: TransactionClient,
    orderId: string,
    expiresAt: Date,
  ): Promise<void> {
    await tx.order.update({
      where: { id: orderId },
      data: { reservationExpiresAt: expiresAt },
    });
  }

  async markReservations(
    tx: TransactionClient,
    reservationIds: bigint[],
    to: Exclude<ReservationStatus, 'HOLDING'>,
    at: Date,
  ): Promise<number> {
    if (reservationIds.length === 0) return 0;
    const result = await tx.stockReservation.updateMany({
      // Điều kiện status = HOLDING bảo vệ thêm: không bao giờ đổi lại một trạng thái terminal.
      where: { id: { in: reservationIds }, status: 'HOLDING' },
      data:
        to === 'COMMITTED'
          ? { status: to, committedAt: at }
          : { status: to, releasedAt: at },
    });
    return result.count;
  }
}
