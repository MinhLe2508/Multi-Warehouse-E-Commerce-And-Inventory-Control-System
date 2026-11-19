import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  InventoryPubSubService,
  type InventoryChangedEvent,
} from './inventory-pubsub.service';

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

/** Publish only after a transaction commits. A caller can read the snapshot
 * in its transaction so publishing only needs to wait for Redis.
 */
@Injectable()
export class InventoryChangeEmitter {
  private readonly logger = new Logger(InventoryChangeEmitter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: InventoryPubSubService,
  ) {}

  async readSnapshots(
    inventoryIds: bigint[],
    client: Pick<PrismaService, '$queryRaw'> = this.prisma,
  ): Promise<InventoryChangedEvent[]> {
    if (inventoryIds.length === 0) return [];
    const ids = [...new Set(inventoryIds)].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const rows = await client.$queryRaw<InventorySnapshot[]>`
        SELECT i.id, i.product_id, i.warehouse_id, i.stock, i.reserved_stock,
               i.available_stock, i.threshold, i.version,
               COALESCE(i.threshold, w.default_low_stock_threshold) AS effective_threshold,
               to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at
          FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id
         WHERE i.id = ANY(${ids}::bigint[])
         ORDER BY i.id
      `;
    return rows.map((row) => ({
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
    }));
  }

  async publishSnapshots(snapshots: InventoryChangedEvent[]): Promise<void> {
    try {
      await Promise.all(
        snapshots.map((snapshot) =>
          this.pubsub.notifyInventoryChanged(snapshot),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Inventory committed; realtime publish failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async publishInventory(inventoryIds: bigint[]): Promise<void> {
    try {
      await this.publishSnapshots(await this.readSnapshots(inventoryIds));
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
