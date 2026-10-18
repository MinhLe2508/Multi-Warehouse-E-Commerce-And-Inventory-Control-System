import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

export const LOW_STOCK_CHANNEL = 'inventory.low_stock';

export interface LowStockEvent {
  inventoryId: string;
  productId: string;
  warehouseId: string;
  availableStock: number;
  threshold: number;
}

export function isLowStockEvent(value: unknown): value is LowStockEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return (
    ['inventoryId', 'productId', 'warehouseId'].every(
      (key) => typeof event[key] === 'string' && event[key].length > 0,
    ) &&
    Number.isSafeInteger(event.availableStock) &&
    Number.isSafeInteger(event.threshold) &&
    (event.availableStock as number) >= 0 &&
    (event.threshold as number) >= 0 &&
    (event.availableStock as number) <= (event.threshold as number)
  );
}

@Injectable()
export class InventoryPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryPubSubService.name);
  private publisher: Redis;
  private subscriber: Redis;

  async onModuleInit(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const options = {
      connectTimeout: 2000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
    };
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    this.publisher.on('error', () =>
      this.logger.warn('Redis publisher unavailable'),
    );
    this.subscriber.on('error', () =>
      this.logger.warn('Redis subscriber unavailable'),
    );
    this.subscriber.on('message', (channel, message) => {
      if (channel !== LOW_STOCK_CHANNEL) return;
      try {
        const event: unknown = JSON.parse(message);
        if (!isLowStockEvent(event)) throw new Error('Invalid low-stock event');
        // Week 4 consumer can dispatch authenticated notifications here.
        this.logger.log(
          `Low stock: inventory=${event.inventoryId}, available=${event.availableStock}, threshold=${event.threshold}`,
        );
      } catch {
        this.logger.warn('Ignored invalid inventory.low_stock payload');
      }
    });
    try {
      await this.subscriber.subscribe(LOW_STOCK_CHANNEL);
      this.logger.log(`Subscribed to ${LOW_STOCK_CHANNEL}`);
    } catch (error) {
      this.onModuleDestroy();
      throw error;
    }
  }

  // Call AFTER the inventory transaction commits. Redis is not the stock ledger.
  async publishLowStock(event: LowStockEvent): Promise<number> {
    if (!isLowStockEvent(event)) throw new Error('Invalid low-stock event');
    return this.publisher.publish(LOW_STOCK_CHANNEL, JSON.stringify(event));
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
  }
}
