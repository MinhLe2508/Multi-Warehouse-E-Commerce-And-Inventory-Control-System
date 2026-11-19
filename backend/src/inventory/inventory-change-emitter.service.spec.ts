import { Logger } from '@nestjs/common';
import { InventoryChangeEmitter } from './inventory-change-emitter.service';

const row = {
  id: 9007199254740993n,
  product_id: '11111111-1111-4111-8111-111111111111',
  warehouse_id: '22222222-2222-4222-8222-222222222222',
  stock: 10,
  reserved_stock: 2,
  available_stock: 8,
  threshold: null,
  effective_threshold: 9,
  version: 2,
  occurred_at: '2026-11-17T10:00:00.000Z',
  costPrice: 'secret',
};
function build() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([row]),
    stockReservation: {
      findMany: jest.fn().mockResolvedValue([{ inventoryId: row.id }]),
    },
  };
  const pubsub = {
    notifyInventoryChanged: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    pubsub,
    service: new InventoryChangeEmitter(prisma as never, pubsub as never),
  };
}
describe('InventoryChangeEmitter', () => {
  beforeEach(() =>
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
  );
  afterEach(() => jest.restoreAllMocks());
  it('uses string BIGINT IDs and whitelists the committed snapshot', async () => {
    const { service, pubsub } = build();
    await service.publishInventory([row.id]);
    expect(pubsub.notifyInventoryChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryId: '9007199254740993',
        availableStock: 8,
        isLowStock: true,
      }),
    );
    expect(pubsub.notifyInventoryChanged.mock.calls[0][0]).not.toHaveProperty(
      'costPrice',
    );
  });
  it('does not query or emit for an empty list', async () => {
    const { service, prisma, pubsub } = build();
    await service.publishInventory([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(pubsub.notifyInventoryChanged).not.toHaveBeenCalled();
  });
  it('does not reject a committed operation if the refresh query fails', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockRejectedValue(new Error('db read failed'));
    await expect(service.publishInventory([row.id])).resolves.toBeUndefined();
  });
  it('does not reject a committed operation if transport fails', async () => {
    const { service, pubsub } = build();
    pubsub.notifyInventoryChanged.mockRejectedValue(
      new Error('transport failed'),
    );
    await expect(service.publishInventory([row.id])).resolves.toBeUndefined();
  });
  it('finds inventory IDs from an order after its transaction', async () => {
    const { service, prisma, pubsub } = build();
    await service.publishOrder('order-id');
    expect(prisma.stockReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: 'order-id' } }),
    );
    expect(pubsub.notifyInventoryChanged).toHaveBeenCalledTimes(1);
  });
});
