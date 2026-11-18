import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import {
  InventoryPubSubService,
  INVENTORY_CHANGED_CHANNEL,
  LOW_STOCK_CHANNEL,
  isInventoryChangedEvent,
  isLowStockEvent,
} from './inventory-pubsub.service';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));
const good = {
  inventoryId: '9007199254740993',
  productId: '11111111-1111-4111-8111-111111111111',
  warehouseId: '22222222-2222-4222-8222-222222222222',
  stock: 10,
  reservedStock: 3,
  availableStock: 7,
  threshold: null,
  effectiveThreshold: 8,
  isLowStock: true,
  version: 4,
};
const low = {
  inventoryId: '1',
  productId: good.productId,
  warehouseId: good.warehouseId,
  availableStock: 0,
  threshold: 5,
  alertId: '2',
  alertLevel: 'CRITICAL' as const,
};
function build() {
  const clients: Array<
    EventEmitter & {
      status: string;
      publish: jest.Mock;
      subscribe: jest.Mock;
      disconnect: jest.Mock;
    }
  > = [];
  (Redis as unknown as jest.Mock).mockImplementation(() => {
    const client = Object.assign(new EventEmitter(), {
      status: 'ready',
      publish: jest.fn().mockResolvedValue(1),
      subscribe: jest.fn().mockResolvedValue(2),
      disconnect: jest.fn(),
    });
    clients.push(client);
    return client;
  });
  const service = new InventoryPubSubService();
  service.onModuleInit();
  return { service, publisher: clients[0], subscriber: clients[1] };
}
describe('InventoryPubSubService contracts and delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  it('preserves BIGINT strings and validates a consistent stock snapshot', () => {
    expect(isInventoryChangedEvent(good)).toBe(true);
    expect(isLowStockEvent(low)).toBe(true);
  });
  it.each([
    { stock: null },
    { stock: '10' },
    { reservedStock: true },
    { reservedStock: 11 },
    { availableStock: 8 },
    { inventoryId: '9223372036854775808' },
    { inventoryId: '01' },
    { productId: 'bad' },
    { occurredAt: 'invalid' },
    { version: -1 },
    { isLowStock: false },
  ])('rejects malformed stock payload (%#)', (bad) => {
    expect(isInventoryChangedEvent({ ...good, ...bad })).toBe(false);
  });
  it('subscribes to both channels, including after a reconnect', async () => {
    const { service, subscriber } = build();
    subscriber.emit('ready');
    await Promise.resolve();
    subscriber.emit('ready');
    await Promise.resolve();
    expect(subscriber.subscribe).toHaveBeenCalledWith(
      LOW_STOCK_CHANNEL,
      INVENTORY_CHANGED_CHANNEL,
    );
    expect(subscriber.subscribe).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });
  it('strips price and unexpected nested fields from outbound events', async () => {
    const { service, publisher } = build();
    await service.publishInventoryChanged({
      ...good,
      costPrice: 'secret',
      product: { costPrice: 'nested' },
    } as never);
    const sent = JSON.parse(publisher.publish.mock.calls[0][1]);
    expect(sent).not.toHaveProperty('costPrice');
    expect(sent).not.toHaveProperty('product');
    expect(sent.inventoryId).toBe(good.inventoryId);
    expect(sent.eventId).toEqual(expect.any(String));
    service.onModuleDestroy();
  });
  it('does not coerce malformed values when publishing', async () => {
    const { service, publisher } = build();
    await expect(
      service.publishInventoryChanged({ ...good, stock: null } as never),
    ).rejects.toThrow('Invalid');
    expect(publisher.publish).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
  it('whitelists incoming events before calling consumers', () => {
    const { service, subscriber } = build();
    const handler = jest.fn();
    service.onInventoryChanged(handler);
    subscriber.emit(
      'message',
      INVENTORY_CHANGED_CHANNEL,
      JSON.stringify({ ...good, product: { costPrice: 'nested' } }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).not.toHaveProperty('product');
    service.onModuleDestroy();
  });
  it('rejects invalid JSON and direct sensitive fields', () => {
    const { service, subscriber } = build();
    const handler = jest.fn();
    service.onInventoryChanged(handler);
    subscriber.emit('message', INVENTORY_CHANGED_CHANNEL, '{bad');
    subscriber.emit(
      'message',
      INVENTORY_CHANGED_CHANNEL,
      JSON.stringify({ ...good, costPrice: 'secret' }),
    );
    expect(handler).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
  it('delivers locally once and deduplicates the Redis echo', async () => {
    const { service, publisher, subscriber } = build();
    const handler = jest.fn();
    service.onInventoryChanged(handler);
    await service.notifyInventoryChanged(good);
    const json = publisher.publish.mock.calls[0][1];
    subscriber.emit('message', INVENTORY_CHANGED_CHANNEL, json);
    subscriber.emit('message', INVENTORY_CHANGED_CHANNEL, json);
    expect(handler).toHaveBeenCalledTimes(1);
    service.onModuleDestroy();
  });
  it('delivers locally when Redis is offline without queuing a stale command', async () => {
    const { service, publisher } = build();
    publisher.status = 'reconnecting';
    const handler = jest.fn();
    service.onInventoryChanged(handler);
    await expect(service.notifyInventoryChanged(good)).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
  it('isolates synchronous/async consumer failures and mutations', async () => {
    const { service, subscriber } = build();
    service.onLowStock((event) => {
      event.availableStock = 999;
      throw new Error('sync');
    });
    service.onLowStock(() => Promise.reject(new Error('async')));
    const next = jest.fn();
    service.onLowStock(next);
    subscriber.emit('message', LOW_STOCK_CHANNEL, JSON.stringify(low));
    await Promise.resolve();
    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ availableStock: 0 }),
    );
    service.onModuleDestroy();
  });
  it('unsubscribes handlers and disconnects both clients on shutdown', async () => {
    const { service, publisher, subscriber } = build();
    const handler = jest.fn();
    const unsubscribe = service.onInventoryChanged(handler);
    unsubscribe();
    await service.notifyInventoryChanged(good);
    expect(handler).not.toHaveBeenCalled();
    service.onModuleDestroy();
    expect(publisher.disconnect).toHaveBeenCalledTimes(1);
    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
  });
});
