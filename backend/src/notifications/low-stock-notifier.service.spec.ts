import {
  isInventoryChangedEvent,
  sanitizeInventoryChangedEvent,
} from '../inventory/inventory-pubsub.service';
import { LowStockNotifierService } from './low-stock-notifier.service';

const alert = (
  id: string,
  warehouseId = 'w1',
  alertLevel: 'WARNING' | 'CRITICAL' = 'WARNING',
) => ({
  id,
  inventoryId: '10',
  alertLevel,
  status: 'OPEN' as const,
  stockAtTrigger: alertLevel === 'CRITICAL' ? 0 : 3,
  availableAtTrigger: alertLevel === 'CRITICAL' ? 0 : 3,
  thresholdAtTrigger: 5,
  triggeredAt: new Date('2026-10-27T00:00:00Z'),
  resolvedAt: null,
  resolvedBy: null,
  currentStock: alertLevel === 'CRITICAL' ? 0 : 3,
  currentAvailable: alertLevel === 'CRITICAL' ? 0 : 3,
  product: { id: 'p1', sku: 'SKU1', name: 'Áo thun' },
  warehouse: { id: warehouseId, code: 'WH1', name: 'Kho 1' },
});

function build(opts: {
  alerts: ReturnType<typeof alert>[];
  nextPageAlerts?: ReturnType<typeof alert>[];
  existing?: { userId: string; referenceId: string; title?: string }[];
  locked?: boolean;
  publish?: jest.Mock;
  publishInvChanged?: jest.Mock;
}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: opts.locked ?? true }]),
    notification: {
      findMany: jest.fn().mockResolvedValue(opts.existing ?? []),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    warehouse: { findMany: jest.fn().mockResolvedValue([{ id: 'w1' }]) },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const inventory = {
    findOpenAlerts: jest.fn().mockResolvedValue(opts.alerts),
    findAlerts: jest
      .fn()
      .mockResolvedValueOnce({
        items: opts.nextPageAlerts ?? [],
        total: opts.alerts.length + (opts.nextPageAlerts?.length ?? 0),
        limit: 100,
        offset: opts.alerts.length,
      })
      .mockResolvedValue({ items: [], total: 0, limit: 100, offset: 600 }),
  };
  const pubsub = {
    onLowStock: jest.fn(),
    onInventoryChanged: jest.fn(),
    publishLowStock: opts.publish ?? jest.fn().mockResolvedValue(1),
    publishInventoryChanged:
      opts.publishInvChanged ?? jest.fn().mockResolvedValue(1),
  };
  const gateway = {
    emitLowStockAlert: jest.fn(),
    emitInventoryChanged: jest.fn(),
  };
  const service = new LowStockNotifierService(
    prisma as never,
    inventory as never,
    pubsub as never,
    gateway as never,
  );
  return { service, tx, prisma, inventory, pubsub, gateway };
}

describe('LowStockNotifierService', () => {
  it('tạo Notification cho từng người nhận và publish sau khi lưu', async () => {
    const { service, tx, pubsub, gateway } = build({ alerts: [alert('1')] });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(2);
    const calls = tx.notification.createMany.mock.calls as unknown as [
      { data: Record<string, unknown>[] },
    ][];
    const data = calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      type: 'LOW_STOCK',
      referenceType: 'StockAlert',
      referenceId: '1',
    });
    expect(pubsub.publishLowStock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: '1',
        availableStock: 3,
        threshold: 5,
      }),
    );
    expect(gateway.emitLowStockAlert).not.toHaveBeenCalled();
  });

  it('bỏ qua alert đã có Notification', async () => {
    const { service, tx, pubsub } = build({
      alerts: [alert('1')],
      existing: [
        { userId: 'u1', referenceId: '1' },
        { userId: 'u2', referenceId: '1' },
      ],
    });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
    expect(pubsub.publishLowStock).not.toHaveBeenCalled();
  });

  it('bỏ qua alert của kho đã ngừng hoạt động', async () => {
    const { service, prisma } = build({ alerts: [alert('1', 'w-off')] });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('không làm gì khi instance khác đang giữ khóa', async () => {
    const { service, tx } = build({ alerts: [alert('1')], locked: false });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(0);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('Redis lỗi: không ném lỗi, emit trực tiếp qua gateway', async () => {
    const { service, gateway } = build({
      alerts: [alert('1')],
      publish: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    await expect(service.dispatchOpenAlerts()).resolves.toBe(2);
    expect(gateway.emitLowStockAlert).toHaveBeenCalledTimes(1);
  });

  it('onModuleInit nối sự kiện Redis (low_stock và inventory.changed) với gateway', () => {
    const { service, pubsub, gateway } = build({ alerts: [] });
    service.onModuleInit();
    const lowStockHandler = (
      pubsub.onLowStock.mock.calls as unknown as [(e: object) => void][]
    )[0][0];
    lowStockHandler({ inventoryId: '1' });
    expect(gateway.emitLowStockAlert).toHaveBeenCalledWith({
      inventoryId: '1',
    });

    const invChangedHandler = (
      pubsub.onInventoryChanged.mock.calls as unknown as [(e: object) => void][]
    )[0][0];
    invChangedHandler({
      inventoryId: '10',
      stock: 20,
      reservedStock: 2,
      availableStock: 18,
    });
    expect(gateway.emitInventoryChanged).toHaveBeenCalledWith({
      inventoryId: '10',
      stock: 20,
      reservedStock: 2,
      availableStock: 18,
    });
  });

  it('nâng mức cảnh báo WARNING -> CRITICAL: tạo thông báo Hết hàng mới, không gửi trùng khi đã ở CRITICAL', async () => {
    const { service, tx, pubsub } = build({
      alerts: [alert('1', 'w1', 'CRITICAL')],
      existing: [
        { userId: 'u1', referenceId: '1', title: 'Sắp hết hàng: Áo thun' },
        { userId: 'u2', referenceId: '1', title: 'Hết hàng: Áo thun' },
      ],
    });

    // u1 mới chỉ nhận WARNING -> cần nhận CRITICAL; u2 đã nhận CRITICAL -> bỏ qua
    await expect(service.dispatchOpenAlerts()).resolves.toBe(1);
    const createdBatch = (
      tx.notification.createMany.mock.calls as unknown as [
        { data: Array<{ userId: string; title: string }> },
      ][]
    )[0][0].data;
    expect(createdBatch).toHaveLength(1);
    expect(createdBatch[0].userId).toBe('u1');
    expect(createdBatch[0].title).toBe('Hết hàng: Áo thun');
    expect(pubsub.publishLowStock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertId: '1',
        alertLevel: 'CRITICAL',
      }),
    );
  });

  it('batch > 500 alerts: phân trang không bỏ đói cảnh báo thứ 501+ và chia batch createMany', async () => {
    const first500 = Array.from({ length: 500 }, (_, idx) =>
      alert(String(idx + 1), 'w1'),
    );
    const extra20 = Array.from({ length: 20 }, (_, idx) =>
      alert(String(501 + idx), 'w1'),
    );
    // Giả sử 500 cảnh báo đầu đều đã gửi xong cho cả u1 và u2
    const existingForFirst500 = first500.flatMap((a) => [
      { userId: 'u1', referenceId: a.id },
      { userId: 'u2', referenceId: a.id },
    ]);

    const { service, inventory, tx } = build({
      alerts: first500,
      nextPageAlerts: extra20,
      existing: existingForFirst500,
    });

    const count = await service.dispatchOpenAlerts();
    expect(inventory.findAlerts).toHaveBeenCalled();
    // 20 cảnh báo mới * 2 người nhận = 40 thông báo được tạo, không bị bỏ đói
    expect(count).toBe(40);
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('notifyInventoryChanged: Redis lỗi hoặc 0 subscriber -> fallback sang gateway cục bộ mà không ném lỗi', async () => {
    const { service, gateway } = build({
      alerts: [],
      publishInvChanged: jest.fn().mockRejectedValue(new Error('redis down')),
    });

    await expect(
      service.notifyInventoryChanged({
        inventoryId: '15',
        stock: 10,
        reservedStock: 1,
        availableStock: 9,
      }),
    ).resolves.toBeUndefined();

    expect(gateway.emitInventoryChanged).toHaveBeenCalledWith({
      inventoryId: '15',
      stock: 10,
      reservedStock: 1,
      availableStock: 9,
    });
  });

  it('sanitizeInventoryChangedEvent & isInventoryChangedEvent: loại bỏ costPrice và kiểm tra ID string', () => {
    const sanitized = sanitizeInventoryChangedEvent({
      inventoryId: '100',
      stock: 50,
      reservedStock: 5,
      availableStock: 45,
      version: 3,
      costPrice: '100000.00',
      productCostPrice: '100000.00',
    });

    expect(
      (sanitized as unknown as Record<string, unknown>).costPrice,
    ).toBeUndefined();
    expect(
      (sanitized as unknown as Record<string, unknown>).productCostPrice,
    ).toBeUndefined();
    // A fresh event ID also distinguishes threshold-only changes at the same stock version.
    expect(sanitized.eventId).toEqual(expect.any(String));
    expect(isInventoryChangedEvent(sanitized)).toBe(true);
    expect(
      isInventoryChangedEvent({
        ...sanitized,
        costPrice: '99999',
      }),
    ).toBe(false);
  });
});
