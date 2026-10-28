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
  // Các trường TÙY CHỌN do LowStockNotifierService thêm vào để giao diện Alerts hiển thị ngay, không cần gọi lại API.
  alertId?: string;
  alertLevel?: 'WARNING' | 'CRITICAL';
  sku?: string;
  productName?: string;
  warehouseCode?: string;
  triggeredAt?: string;
}

export type LowStockHandler = (event: LowStockEvent) => void;

export function isLowStockEvent(value: unknown): value is LowStockEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  const optionalStringsOk = [
    'alertId',
    'sku',
    'productName',
    'warehouseCode',
    'triggeredAt',
  ].every((key) => event[key] === undefined || typeof event[key] === 'string');
  const levelOk =
    event.alertLevel === undefined ||
    event.alertLevel === 'WARNING' ||
    event.alertLevel === 'CRITICAL';
  return (
    optionalStringsOk &&
    levelOk &&
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
  private readonly handlers = new Set<LowStockHandler>();

  onModuleInit(): void {
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
        // Tuần 4: chuyển sự kiện cho các consumer đã đăng ký (NotificationsGateway đẩy WebSocket).
        for (const handler of this.handlers) {
          try {
            handler(event);
          } catch {
            this.logger.warn('A low-stock handler failed');
          }
        }
        this.logger.log(
          `Low stock: inventory=${event.inventoryId}, available=${event.availableStock}, threshold=${event.threshold}`,
        );
      } catch {
        this.logger.warn('Ignored invalid inventory.low_stock payload');
      }
    });
    // Đăng ký kênh mỗi khi kết nối sẵn sàng (lần đầu và cả khi Redis khởi động chậm / kết nối lại).
    // Lỗi chỉ ghi cảnh báo, KHÔNG làm sập backend.
    this.subscriber.on('ready', () => {
      this.subscriber
        .subscribe(LOW_STOCK_CHANNEL)
        .then(() => this.logger.log(`Subscribed to ${LOW_STOCK_CHANNEL}`))
        .catch(() =>
          this.logger.warn(`Cannot subscribe to ${LOW_STOCK_CHANNEL}`),
        );
    });
  }

  // Đăng ký nhận sự kiện tồn thấp. Trả về hàm hủy đăng ký.
  onLowStock(handler: LowStockHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
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
