import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, type ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryAlertService } from './inventory-alert.service';
import { InventoryChangeEmitter } from './inventory-change-emitter.service';

// Test EXPLAINs this actual query. Skip a locked order BEFORE any stock writes.
export const RESERVATION_CLEANUP_CANDIDATES_SQL = Prisma.sql`
  WITH candidates AS MATERIALIZED (
    SELECT r.order_id
      FROM stock_reservations r
     WHERE r.status = 'HOLDING'
       AND r.expires_at <= NOW()
    UNION
    SELECT pending.id
      FROM orders pending
     WHERE pending.status = 'PENDING_PAYMENT'
       AND EXISTS (
         SELECT 1 FROM stock_reservations expired
          WHERE expired.order_id = pending.id AND expired.status = 'EXPIRED'
       )
       AND NOT EXISTS (
         SELECT 1 FROM stock_reservations holding
          WHERE holding.order_id = pending.id AND holding.status = 'HOLDING'
       )
  )
  SELECT o.id
    FROM orders o
   WHERE o.status = 'PENDING_PAYMENT'
     AND o.id IN (SELECT order_id FROM candidates)
     AND NOT EXISTS (
       SELECT 1 FROM stock_reservations terminal
        WHERE terminal.order_id = o.id
          AND terminal.status IN ('COMMITTED', 'RELEASED')
     )
     AND NOT EXISTS (
       SELECT 1 FROM payments p
        WHERE p.order_id = o.id AND p.status = 'SUCCESS'
     )
   ORDER BY o.id
   LIMIT 100
     FOR UPDATE OF o SKIP LOCKED
`;

interface LockedReservation {
  id: bigint;
  order_id: string;
  inventory_id: bigint;
  quantity: number;
  status: ReservationStatus;
}

@Injectable()
export class ReservationCleanupJob {
  private readonly logger = new Logger(ReservationCleanupJob.name);
  private readonly alertService: InventoryAlertService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly changes: InventoryChangeEmitter,
    @Optional() alertService?: InventoryAlertService,
  ) {
    this.alertService = alertService ?? new InventoryAlertService();
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'reservation-cleanup',
    waitForCompletion: true,
  })
  async handleCron(): Promise<void> {
    try {
      const count = await this.cleanupExpired();
      if (count > 0) this.logger.log(`Expired ${count} reservation(s)`);
    } catch (error) {
      this.logger.error(
        'Reservation cleanup failed; transaction rolled back',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Claim ALL orders before locking ANY inventory/reservation, matching
        // PaymentsService and StockReservationService. Batch by whole orders.
        const orders = await tx.$queryRaw<{ id: string }[]>(
          RESERVATION_CLEANUP_CANDIDATES_SQL,
        );
        if (orders.length === 0)
          return { count: 0, inventoryIds: [] as bigint[] };
        const orderIds = orders.map((order) => order.id);

        const inventories = await tx.$queryRaw<
          { id: bigint; stock: number; reserved_stock: number }[]
        >`
          SELECT i.id, i.stock, i.reserved_stock
            FROM inventory i
           WHERE EXISTS (
             SELECT 1 FROM stock_reservations r
              WHERE r.inventory_id = i.id
                AND r.order_id = ANY(${orderIds}::uuid[])
                AND r.status = 'HOLDING'
           )
           ORDER BY i.id
             FOR UPDATE OF i
        `;
        // After claiming an order, wait for its stock locks; never skip only
        // part of that order. All inventory/reservation locks use ascending ID.
        const reservations = await tx.$queryRaw<LockedReservation[]>`
          SELECT id, order_id, inventory_id, quantity, status
            FROM stock_reservations
           WHERE order_id = ANY(${orderIds}::uuid[])
           ORDER BY id
             FOR UPDATE
        `;

        // DB time AFTER locks. Text preserves microseconds for SQL comparisons;
        // JS Date is only used for the timestamps written to Prisma models.
        const [clock] = await tx.$queryRaw<{ at: string }[]>`
          SELECT clock_timestamp()::text AS at
        `;
        const expired = await tx.$queryRaw<{ id: bigint }[]>`
          SELECT id FROM stock_reservations
           WHERE order_id = ANY(${orderIds}::uuid[])
             AND status = 'HOLDING'
             AND expires_at <= ${clock.at}::timestamptz
           ORDER BY id
        `;
        const expiredIds = new Set(expired.map((row) => row.id));
        const releasedAt = new Date(clock.at);
        const inventoryById = new Map(inventories.map((row) => [row.id, row]));
        const touched = new Set<bigint>();

        for (const reservation of reservations) {
          if (!expiredIds.has(reservation.id)) continue;
          const inventory = inventoryById.get(reservation.inventory_id);
          if (
            !inventory ||
            reservation.quantity <= 0 ||
            inventory.reserved_stock < reservation.quantity
          ) {
            throw new Error(
              `Invalid reserved stock for inventory ${reservation.inventory_id}`,
            );
          }
          const changed = await tx.stockReservation.updateMany({
            where: { id: reservation.id, status: 'HOLDING' },
            data: { status: 'EXPIRED', releasedAt },
          });
          if (changed.count !== 1) {
            throw new Error(`Reservation ${reservation.id} changed under lock`);
          }
          await tx.inventory.update({
            where: { id: inventory.id },
            data: { reservedStock: { decrement: reservation.quantity } },
          });
          await tx.inventoryAuditLog.create({
            data: {
              inventoryId: inventory.id,
              reason: 'EXPIRE',
              stockBefore: inventory.stock,
              stockAfter: inventory.stock,
              reservedBefore: inventory.reserved_stock,
              reservedAfter: inventory.reserved_stock - reservation.quantity,
              quantityDelta: 0,
              referenceType: 'stock_reservation',
              referenceId: reservation.id.toString(),
              note: 'Reservation TTL expired',
            },
          });
          inventory.reserved_stock -= reservation.quantity;
          touched.add(inventory.id);
        }

        for (const order of orders) {
          const own = reservations.filter((row) => row.order_id === order.id);
          // Also repairs legacy pending orders with only EXPIRED reservations.
          if (
            own.length === 0 ||
            own.some(
              (row) => row.status !== 'EXPIRED' && !expiredIds.has(row.id),
            )
          )
            continue;
          const changed = await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING_PAYMENT' },
            data: {
              status: 'CANCELLED',
              cancelledReason: 'EXPIRED',
              cancelledAt: releasedAt,
            },
          });
          if (changed.count !== 1) {
            throw new Error(`Order ${order.id} changed under lock`);
          }
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              fromStatus: 'PENDING_PAYMENT',
              toStatus: 'CANCELLED',
              actorId: null,
              reason: 'EXPIRED',
            },
          });
        }
        await this.alertService.evaluate(tx, [...touched]);
        return { count: expired.length, inventoryIds: [...touched] };
      },
      {
        timeout: 30000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
    if (result.inventoryIds.length)
      await this.changes.publishInventory(result.inventoryIds);
    return result.count;
  }
}
