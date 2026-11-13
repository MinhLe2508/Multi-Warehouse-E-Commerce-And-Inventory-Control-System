import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryAlertService } from './inventory-alert.service';

@Injectable()
export class ReservationCleanupJob {
  private readonly logger = new Logger(ReservationCleanupJob.name);
  private readonly alertService: InventoryAlertService;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() alertService?: InventoryAlertService,
  ) {
    // Đánh giá lại cảnh báo tồn thấp sau khi giữ chỗ hết hạn.
    this.alertService = alertService ?? new InventoryAlertService();
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'reservation-cleanup',
    waitForCompletion: true,
  })
  async handleCron(): Promise<void> {
    try {
      const count = await this.cleanupExpired();
      if (count > 0) {
        this.logger.log(`Expired ${count} reservation(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Reservation cleanup failed; transaction rolled back',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async cleanupExpired(): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        // Bước 1: Quét partial index idx_res_cleanup (status = 'HOLDING' AND expires_at <= NOW())
        // để tìm nhanh các inventory có giữ chỗ quá hạn mà không phải quét toàn bảng.
        const candidates = await tx.$queryRaw<{ inventory_id: bigint }[]>`
          SELECT DISTINCT r.inventory_id
            FROM stock_reservations r
           WHERE r.status = 'HOLDING'
             AND r.expires_at <= NOW()
           ORDER BY r.inventory_id ASC
           LIMIT 100
        `;
        if (candidates.length === 0) {
          return 0;
        }
        const candidateInventoryIds = candidates.map((c) => c.inventory_id);

        // Bước 2: Khóa dòng inventory theo thứ tự ID tăng dần (chống deadlock),
        // dùng SKIP LOCKED để nhiều backend instance có thể chia tải.
        const inventories = await tx.$queryRaw<
          { id: bigint; stock: number; reserved_stock: number }[]
        >`
          SELECT i.id, i.stock, i.reserved_stock
            FROM inventory i
           WHERE i.id = ANY(${candidateInventoryIds}::bigint[])
           ORDER BY i.id
           LIMIT 100
             FOR UPDATE OF i SKIP LOCKED
        `;
        let count = 0;
        // Các dòng inventory có ít nhất một giữ chỗ vừa hết hạn, để đánh giá lại cảnh báo.
        const touchedInventoryIds: bigint[] = [];
        const expiredOrderIds = new Set<string>();

        for (const inventory of inventories) {
          const reservations = await tx.$queryRaw<
            { id: bigint; order_id: string; quantity: number }[]
          >`
            SELECT id, order_id, quantity
              FROM stock_reservations
             WHERE inventory_id = ${inventory.id}
               AND status = 'HOLDING'
               AND expires_at <= NOW()
             ORDER BY id
             LIMIT 500
               FOR UPDATE SKIP LOCKED
          `;
          let reserved = inventory.reserved_stock;
          if (reservations.length > 0) {
            touchedInventoryIds.push(inventory.id);
          }
          for (const reservation of reservations) {
            if (reservation.quantity <= 0 || reserved < reservation.quantity) {
              throw new Error(
                `Invalid reserved stock for inventory ${inventory.id}`,
              );
            }
            await tx.stockReservation.update({
              where: { id: reservation.id },
              data: { status: 'EXPIRED', releasedAt: new Date() },
            });
            // available_stock is GENERATED; version is maintained by a DB trigger.
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
                reservedBefore: reserved,
                reservedAfter: reserved - reservation.quantity,
                quantityDelta: 0,
                referenceType: 'stock_reservation',
                referenceId: reservation.id.toString(),
                note: 'Reservation TTL expired',
              },
            });
            reserved -= reservation.quantity;
            expiredOrderIds.add(reservation.order_id);
            count++;
          }
        }

        // Bước 3: Hủy các đơn PENDING_PAYMENT đã hết toàn bộ giữ chỗ HOLDING (Mục 9.3 & 10.2).
        if (expiredOrderIds.size > 0) {
          const orderIds = [...expiredOrderIds].sort();
          const cancellableOrders = await tx.$queryRaw<{ id: string }[]>`
            SELECT o.id
              FROM orders o
             WHERE o.id = ANY(${orderIds}::uuid[])
               AND o.status = 'PENDING_PAYMENT'
               AND NOT EXISTS (
                 SELECT 1
                   FROM stock_reservations sr
                  WHERE sr.order_id = o.id
                    AND sr.status = 'HOLDING'
               )
             ORDER BY o.id
               FOR UPDATE OF o SKIP LOCKED
          `;
          const cancelledAt = new Date();
          for (const order of cancellableOrders) {
            const changed = await tx.order.updateMany({
              where: { id: order.id, status: 'PENDING_PAYMENT' },
              data: {
                status: 'CANCELLED',
                cancelledReason: 'EXPIRED',
                cancelledAt,
              },
            });
            if (changed.count === 1) {
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
          }
        }

        await this.alertService.evaluate(tx, touchedInventoryIds);
        return count;
      },
      { timeout: 30000 },
    );
  }
}
