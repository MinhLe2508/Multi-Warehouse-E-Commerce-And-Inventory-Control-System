import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

export const LOW_STOCK_CHANNEL = 'inventory.low_stock';
export const INVENTORY_CHANGED_CHANNEL = 'inventory.changed';

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

export interface InventoryChangedEvent {
  eventId?: string;
  inventoryId: string;
  productId?: string;
  warehouseId?: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold?: number | null;
  effectiveThreshold?: number;
  isLowStock?: boolean;
  version?: number;
  occurredAt?: string;
}

export type LowStockHandler = (event: LowStockEvent) => void;
export type InventoryChangedHandler = (event: InventoryChangedEvent) => void;

export function isLowStockEvent(value: unknown): value is LowStockEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if ('costPrice' in event || 'productCostPrice' in event) return false;
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

export function sanitizeInventoryChangedEvent(
  raw: InventoryChangedEvent & Record<string, unknown>,
): InventoryChangedEvent {
  const occurredAt =
    typeof raw.occurredAt === 'string' && raw.occurredAt.length > 0
      ? raw.occurredAt
      : new Date().toISOString();
  const eventId =
    typeof raw.eventId === 'string' && raw.eventId.length > 0
      ? raw.eventId
      : `${String(raw.inventoryId)}:${raw.version ?? ''}:${raw.stock}:${raw.reservedStock}:${raw.availableStock}`;

  const clean: InventoryChangedEvent = {
    eventId,
    inventoryId: String(raw.inventoryId),
    stock: Number(raw.stock),
    reservedStock: Number(raw.reservedStock),
    availableStock: Number(raw.availableStock),
    occurredAt,
  };
  if (typeof raw.productId === 'string' && raw.productId.length > 0) {
    clean.productId = raw.productId;
  }
  if (typeof raw.warehouseId === 'string' && raw.warehouseId.length > 0) {
    clean.warehouseId = raw.warehouseId;
  }
  if (raw.threshold === null || Number.isSafeInteger(raw.threshold)) {
    clean.threshold = raw.threshold;
  }
  if (Number.isSafeInteger(raw.effectiveThreshold)) {
    clean.effectiveThreshold = raw.effectiveThreshold;
  }
  if (typeof raw.isLowStock === 'boolean') {
    clean.isLowStock = raw.isLowStock;
  }
  if (Number.isSafeInteger(raw.version)) {
    clean.version = raw.version;
  }
  return clean;
}

export function isInventoryChangedEvent(
  value: unknown,
): value is InventoryChangedEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  // Tuyệt đối không cho phép costPrice lọt vào kênh broadcast
  if ('costPrice' in event || 'productCostPrice' in event) return false;
  const optionalStringsOk = [
    'eventId',
    'productId',
    'warehouseId',
    'occurredAt',
  ].every((key) => event[key] === undefined || typeof event[key] === 'string');
  const thresholdOk =
    event.threshold === undefined ||
    event.threshold === null ||
    (Number.isSafeInteger(event.threshold) && (event.threshold as number) >= 0);
  const effectiveThresholdOk =
    event.effectiveThreshold === undefined ||
    (Number.isSafeInteger(event.effectiveThreshold) &&
      (event.effectiveThreshold as number) >= 0);
  const versionOk =
    event.version === undefined ||
    (Number.isSafeInteger(event.version) && (event.version as number) >= 0);
  const isLowStockOk =
    event.isLowStock === undefined || typeof event.isLowStock === 'boolean';

  return (
    optionalStringsOk &&
    thresholdOk &&
    effectiveThresholdOk &&
    versionOk &&
    isLowStockOk &&
    typeof event.inventoryId === 'string' &&
    event.inventoryId.trim().length > 0 &&
    Number.isSafeInteger(event.stock) &&
    Number.isSafeInteger(event.reservedStock) &&
    Number.isSafeInteger(event.availableStock) &&
    (event.stock as number) >= 0 &&
    (event.reservedStock as number) >= 0 &&
    (event.availableStock as number) >= 0 &&
    (event.availableStock as number) <= (event.stock as number)
  );
}

@Injectable()
export class InventoryPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryPubSubService.name);
  private publisher: Redis;
  private subscriber: Redis;
  private readonly handlers = new Set<LowStockHandler>();
  private readonly inventoryChangedHandlers =
    new Set<InventoryChangedHandler>();

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
      if (channel === LOW_STOCK_CHANNEL) {
        try {
          const event: unknown = JSON.parse(message);
          if (!isLowStockEvent(event))
            throw new Error('Invalid low-stock event');
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
        return;
      }

      if (channel === INVENTORY_CHANGED_CHANNEL) {
        try {
          const parsed: unknown = JSON.parse(message);
          if (!isInventoryChangedEvent(parsed)) {
            throw new Error('Invalid inventory.changed event');
          }
          for (const handler of this.inventoryChangedHandlers) {
            try {
              handler(parsed);
            } catch {
              this.logger.warn('An inventory.changed handler failed');
            }
          }
        } catch {
          this.logger.warn('Ignored invalid inventory.changed payload');
        }
      }
    });
    // Đăng ký kênh mỗi khi kết nối sẵn sàng (lần đầu và cả khi Redis khởi động chậm / kết nối lại).
    // Lỗi chỉ ghi cảnh báo, KHÔNG làm sập backend.
    this.subscriber.on('ready', () => {
      this.subscriber
        .subscribe(LOW_STOCK_CHANNEL, INVENTORY_CHANGED_CHANNEL)
        .then(() =>
          this.logger.log(
            `Subscribed to ${LOW_STOCK_CHANNEL}, ${INVENTORY_CHANGED_CHANNEL}`,
          ),
        )
        .catch(() =>
          this.logger.warn(
            `Cannot subscribe to ${LOW_STOCK_CHANNEL}/${INVENTORY_CHANGED_CHANNEL}`,
          ),
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

  // Đăng ký nhận sự kiện biến động tồn kho sau commit. Trả về hàm hủy đăng ký.
  onInventoryChanged(handler: InventoryChangedHandler): () => void {
    this.inventoryChangedHandlers.add(handler);
    return () => {
      this.inventoryChangedHandlers.delete(handler);
    };
  }

  // Call AFTER the inventory transaction commits. Redis is not the stock ledger.
  async publishLowStock(event: LowStockEvent): Promise<number> {
    if (!isLowStockEvent(event)) throw new Error('Invalid low-stock event');
    return this.publisher.publish(LOW_STOCK_CHANNEL, JSON.stringify(event));
  }

  // Call AFTER the inventory transaction commits. Strips costPrice and validates payload.
  async publishInventoryChanged(event: InventoryChangedEvent): Promise<number> {
    const clean = sanitizeInventoryChangedEvent(
      event as InventoryChangedEvent & Record<string, unknown>,
    );
    if (!isInventoryChangedEvent(clean)) {
      throw new Error('Invalid inventory.changed event');
    }
    return this.publisher.publish(
      INVENTORY_CHANGED_CHANNEL,
      JSON.stringify(clean),
    );
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
  }
}
