import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryPubSubService } from './inventory-pubsub.service';

interface InventorySnapshot {
  id: bigint;
  product_id: string;
  warehouse_id: string;
  stock: number;
  reserved_stock: number;
  available_stock: number;
  threshold: number | null;
  effective_threshold: number;
  version: number;
  occurred_at: string;
}

/** Only transaction owners call this AFTER await $transaction(...).
 * Reads committed, whitelisted fields. Redis/notification failure must never
 * turn an already committed stock mutation into an HTTP failure/retry.
 */
@Injectable()
export class InventoryChangeEmitter {
  private readonly logger = new Logger(InventoryChangeEmitter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: InventoryPubSubService,
  ) {}

  async publishInventory(inventoryIds: bigint[]): Promise<void> {
    if (inventoryIds.length === 0) return;
    try {
      const ids = [...new Set(inventoryIds)].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      const rows = await this.prisma.$queryRaw<InventorySnapshot[]>`
        SELECT i.id, i.product_id, i.warehouse_id, i.stock, i.reserved_stock,
               i.available_stock, i.threshold, i.version,
               COALESCE(i.threshold, w.default_low_stock_threshold) AS effective_threshold,
               to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at
          FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id
         WHERE i.id = ANY(${ids}::bigint[])
         ORDER BY i.id
      `;
      await Promise.all(
        rows.map(async (row) => {
          await this.pubsub.notifyInventoryChanged({
            inventoryId: row.id.toString(),
            productId: row.product_id,
            warehouseId: row.warehouse_id,
            stock: row.stock,
            reservedStock: row.reserved_stock,
            availableStock: row.available_stock,
            threshold: row.threshold,
            effectiveThreshold: row.effective_threshold,
            isLowStock: row.available_stock <= row.effective_threshold,
            version: row.version,
            occurredAt: row.occurred_at,
          });
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Inventory committed; realtime refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async publishOrder(orderId: string): Promise<void> {
    try {
      const rows = await this.prisma.stockReservation.findMany({
        where: { orderId },
        select: { inventoryId: true },
        distinct: ['inventoryId'],
      });
      await this.publishInventory(rows.map((row) => row.inventoryId));
    } catch (error) {
      this.logger.warn(
        `Order committed; inventory refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
