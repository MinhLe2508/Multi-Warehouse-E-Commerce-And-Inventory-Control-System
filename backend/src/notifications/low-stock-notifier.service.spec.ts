import { LowStockNotifierService } from './low-stock-notifier.service';

const alert = (id: string, warehouseId = 'w1') => ({
  id,
  inventoryId: '10',
  alertLevel: 'WARNING' as const,
  status: 'OPEN' as const,
  stockAtTrigger: 3,
  availableAtTrigger: 3,
  thresholdAtTrigger: 5,
  triggeredAt: new Date('2026-10-27T00:00:00Z'),
  resolvedAt: null,
  resolvedBy: null,
  currentStock: 3,
  currentAvailable: 3,
  product: { id: 'p1', sku: 'SKU1', name: 'Áo thun' },
  warehouse: { id: warehouseId, code: 'WH1', name: 'Kho 1' },
});

function build(opts: {
  alerts: ReturnType<typeof alert>[];
  existing?: { userId: string; referenceId: string }[];
  locked?: boolean;
  publish?: jest.Mock;
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
  };
  const pubsub = {
    onLowStock: jest.fn(),
    publishLowStock: opts.publish ?? jest.fn().mockResolvedValue(1),
  };
  const gateway = { emitLowStockAlert: jest.fn() };
  const service = new LowStockNotifierService(
    prisma as never,
    inventory as never,
    pubsub as never,
    gateway as never,
  );
  return { service, tx, prisma, pubsub, gateway };
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

  it('onModuleInit nối sự kiện Redis với gateway', () => {
    const { service, pubsub, gateway } = build({ alerts: [] });
    service.onModuleInit();
    const handler = (
      pubsub.onLowStock.mock.calls as unknown as [(e: object) => void][]
    )[0][0];
    handler({ inventoryId: '1' });
    expect(gateway.emitLowStockAlert).toHaveBeenCalledWith({
      inventoryId: '1',
    });
  });
});
