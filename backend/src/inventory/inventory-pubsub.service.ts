import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
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

export type LowStockHandler = (event: LowStockEvent) => void | Promise<void>;
export type InventoryChangedHandler = (
  event: InventoryChangedEvent,
) => void | Promise<void>;
const INT4_MAX = 2147483647;
const MAX_BIGINT = 9223372036854775807n;
const quantity = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= INT4_MAX;
const bigId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[1-9][0-9]{0,18}$/.test(v) &&
  BigInt(v) <= MAX_BIGINT;
const uuid = (v: unknown): v is string => typeof v === 'string' && isUUID(v);
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function isLowStockEvent(value: unknown): value is LowStockEvent {
  if (!object(value) || 'costPrice' in value || 'productCostPrice' in value)
    return false;
  return (
    bigId(value.inventoryId) &&
    uuid(value.productId) &&
    uuid(value.warehouseId) &&
    quantity(value.availableStock) &&
    quantity(value.threshold) &&
    value.availableStock <= value.threshold &&
    (value.alertId === undefined || bigId(value.alertId)) &&
    (value.alertLevel === undefined ||
      value.alertLevel === 'WARNING' ||
      value.alertLevel === 'CRITICAL') &&
    ['sku', 'productName', 'warehouseCode'].every(
      (key) => value[key] === undefined || typeof value[key] === 'string',
    ) &&
    (value.triggeredAt === undefined || timestamp(value.triggeredAt))
  );
}

function cleanLowStock(raw: LowStockEvent): LowStockEvent {
  const clean: LowStockEvent = {
    inventoryId: raw.inventoryId,
    productId: raw.productId,
    warehouseId: raw.warehouseId,
    availableStock: raw.availableStock,
    threshold: raw.threshold,
  };
  for (const key of [
    'alertId',
    'alertLevel',
    'sku',
    'productName',
    'warehouseCode',
    'triggeredAt',
  ] as const) {
    if (raw[key] !== undefined) Object.assign(clean, { [key]: raw[key] });
  }
  return clean;
}

// Whitelist fields; never coerce null/boolean/string quantities into valid stock.
export function sanitizeInventoryChangedEvent<T extends InventoryChangedEvent>(
  raw: T,
): InventoryChangedEvent {
  const clean: InventoryChangedEvent = {
    inventoryId: raw.inventoryId,
    stock: raw.stock,
    reservedStock: raw.reservedStock,
    availableStock: raw.availableStock,
    eventId: raw.eventId === undefined ? randomUUID() : raw.eventId,
    occurredAt:
      raw.occurredAt === undefined ? new Date().toISOString() : raw.occurredAt,
  };
  for (const key of [
    'productId',
    'warehouseId',
    'threshold',
    'effectiveThreshold',
    'isLowStock',
    'version',
  ] as const) {
    if (raw[key] !== undefined) Object.assign(clean, { [key]: raw[key] });
  }
  return clean;
}

export function isInventoryChangedEvent(
  value: unknown,
): value is InventoryChangedEvent {
  if (!object(value) || 'costPrice' in value || 'productCostPrice' in value)
    return false;
  return (
    bigId(value.inventoryId) &&
    quantity(value.stock) &&
    quantity(value.reservedStock) &&
    quantity(value.availableStock) &&
    value.reservedStock <= value.stock &&
    value.availableStock === value.stock - value.reservedStock &&
    (value.eventId === undefined ||
      (typeof value.eventId === 'string' &&
        value.eventId.trim().length > 0 &&
        value.eventId.length <= 128)) &&
    (value.productId === undefined || uuid(value.productId)) &&
    (value.warehouseId === undefined || uuid(value.warehouseId)) &&
    (value.occurredAt === undefined || timestamp(value.occurredAt)) &&
    (value.threshold === undefined ||
      value.threshold === null ||
      quantity(value.threshold)) &&
    (value.effectiveThreshold === undefined ||
      quantity(value.effectiveThreshold)) &&
    (value.version === undefined || quantity(value.version)) &&
    (value.isLowStock === undefined ||
      (typeof value.isLowStock === 'boolean' &&
        (value.effectiveThreshold === undefined ||
          value.isLowStock ===
            value.availableStock <= value.effectiveThreshold)))
  );
}

@Injectable()
export class InventoryPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InventoryPubSubService.name);
  private publisher?: Redis;
  private subscriber?: Redis;
  private readonly handlers = new Set<LowStockHandler>();
  private readonly inventoryChangedHandlers =
    new Set<InventoryChangedHandler>();
  private readonly seenChanges = new Map<string, number>();

  onModuleInit(): void {
    if (this.publisher || this.subscriber) return;
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const options = {
      connectTimeout: 2000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
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
      try {
        if (channel === LOW_STOCK_CHANNEL) {
          const parsed: unknown = JSON.parse(message);
          if (!isLowStockEvent(parsed))
            throw new Error('Invalid low-stock event');
          this.deliver(this.handlers, cleanLowStock(parsed));
        } else if (channel === INVENTORY_CHANGED_CHANNEL) {
          const parsed: unknown = JSON.parse(message);
          if (!isInventoryChangedEvent(parsed))
            throw new Error('Invalid inventory.changed event');
          this.deliverChange(sanitizeInventoryChangedEvent(parsed));
        }
      } catch {
        this.logger.warn(`Ignored invalid ${channel} payload`);
      }
    });
    this.subscriber.on('ready', () => {
      this.subscriber
        ?.subscribe(LOW_STOCK_CHANNEL, INVENTORY_CHANGED_CHANNEL)
        .then(() =>
          this.logger.log(
            `Subscribed to ${LOW_STOCK_CHANNEL}, ${INVENTORY_CHANGED_CHANNEL}`,
          ),
        )
        .catch(() =>
          this.logger.warn('Cannot subscribe to inventory channels'),
        );
    });
  }

  onLowStock(handler: LowStockHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onInventoryChanged(handler: InventoryChangedHandler): () => void {
    this.inventoryChangedHandlers.add(handler);
    return () => {
      this.inventoryChangedHandlers.delete(handler);
    };
  }

  async publishLowStock(event: LowStockEvent): Promise<number> {
    if (!isLowStockEvent(event)) throw new Error('Invalid low-stock event');
    return this.readyPublisher().publish(
      LOW_STOCK_CHANNEL,
      JSON.stringify(cleanLowStock(event)),
    );
  }

  async publishInventoryChanged(event: InventoryChangedEvent): Promise<number> {
    const clean = sanitizeInventoryChangedEvent(event);
    if (!isInventoryChangedEvent(clean))
      throw new Error('Invalid inventory.changed event');
    return this.readyPublisher().publish(
      INVENTORY_CHANGED_CHANNEL,
      JSON.stringify(clean),
    );
  }

  // Called AFTER commit. Deliver locally even if our Redis subscription is down;
  // deduplicate the echo when Redis subsequently delivers this same eventId.
  async notifyInventoryChanged(event: InventoryChangedEvent): Promise<void> {
    const clean = sanitizeInventoryChangedEvent(event);
    if (!isInventoryChangedEvent(clean))
      throw new Error('Invalid inventory.changed event');
    this.deliverChange(clean);
    try {
      await this.publishInventoryChanged(clean);
    } catch {
      this.logger.warn(
        'Inventory committed; Redis publish unavailable, delivered locally',
      );
    }
  }

  private readyPublisher(): Redis {
    if (this.publisher?.status !== 'ready')
      throw new Error('Redis publisher is not ready');
    return this.publisher;
  }

  private deliver<T extends LowStockEvent | InventoryChangedEvent>(
    handlers: Set<(event: T) => void | Promise<void>>,
    event: T,
  ): void {
    for (const handler of handlers) {
      try {
        const pending = handler({ ...event });
        if (pending)
          void Promise.resolve(pending).catch(() =>
            this.logger.warn('A realtime handler failed'),
          );
      } catch {
        this.logger.warn('A realtime handler failed');
      }
    }
  }

  private deliverChange(event: InventoryChangedEvent): void {
    const now = Date.now();
    const id = event.eventId!;
    const previous = this.seenChanges.get(id);
    if (previous !== undefined && now - previous < 300000) return;
    this.seenChanges.delete(id);
    this.seenChanges.set(id, now);
    // Bound deduplication memory. Pub/Sub is a refresh hint, not a durable log.
    while (this.seenChanges.size > 1000) {
      const oldest = this.seenChanges.keys().next();
      if (oldest.done) break;
      this.seenChanges.delete(oldest.value);
    }
    this.deliver(this.inventoryChangedHandlers, event);
  }

  onModuleDestroy(): void {
    this.publisher?.disconnect();
    this.subscriber?.disconnect();
    this.publisher = undefined;
    this.subscriber = undefined;
    this.handlers.clear();
    this.inventoryChangedHandlers.clear();
    this.seenChanges.clear();
  }
}
