import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryAlertService } from './inventory-alert.service';

@Injectable()
export class ReservationCleanupJob {
  private readonly logger = new Logger(ReservationCleanupJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertService: InventoryAlertService, // Đánh giá lại cảnh báo tồn thấp sau khi giữ chỗ hết hạn.
  ) {}

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
        // Match the reserve path: inventory first, ascending ID, then reservations.
        // SKIP LOCKED lets multiple backend instances share the work.
        const inventories = await tx.$queryRaw<
          { id: bigint; stock: number; reserved_stock: number }[]
        >`
        SELECT i.id, i.stock, i.reserved_stock FROM inventory i
        WHERE EXISTS (
          SELECT 1 FROM stock_reservations r
          WHERE r.inventory_id = i.id AND r.status = 'HOLDING'
            AND r.expires_at <= NOW()
        )
        ORDER BY i.id LIMIT 100 FOR UPDATE OF i SKIP LOCKED
      `;
        let count = 0;
        // Các dòng inventory có ít nhất một giữ chỗ vừa hết hạn, để đánh giá lại cảnh báo.
        const touchedInventoryIds: bigint[] = []; 
        for (const inventory of inventories) {
          const reservations = await tx.$queryRaw<
            { id: bigint; quantity: number }[]
          >`
          SELECT id, quantity FROM stock_reservations
          WHERE inventory_id = ${inventory.id} AND status = 'HOLDING'
            AND expires_at <= NOW()
          ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED
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
            count++;
          }
        }
        await this.alertService.evaluate(tx, touchedInventoryIds);
        return count;
      },
      { timeout: 30000 },
    );
  }
}
