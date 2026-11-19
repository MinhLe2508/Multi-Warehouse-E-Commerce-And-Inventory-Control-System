import { PrismaInventoryStockAdapter } from './prisma-inventory-stock.adapter';

const actor = '11111111-1111-4111-8111-111111111111';
function build() {
  const alerts = {
    evaluate: jest.fn().mockResolvedValue({ raised: 1, resolved: 0 }),
  };
  const tx = {
    $queryRaw: jest.fn(),
    inventoryAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  return {
    alerts,
    tx,
    adapter: new PrismaInventoryStockAdapter(alerts as never),
  };
}
describe('PrismaInventoryStockAdapter alerts inside caller transaction', () => {
  it('evaluates after reserve and audit, using the same tx', async () => {
    const { adapter, tx, alerts } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 101n }])
      .mockResolvedValueOnce([{ stock: 10, reserved_stock: 3 }]);
    await expect(
      adapter.reserve(tx as never, {
        inventoryId: 1n,
        orderId: actor,
        quantity: 3,
        ttlMinutes: 15,
        actorId: actor,
      }),
    ).resolves.toBe(101n);
    expect(alerts.evaluate).toHaveBeenCalledWith(tx, [1n], actor);
    expect(
      tx.inventoryAuditLog.create.mock.invocationCallOrder[0],
    ).toBeLessThan(alerts.evaluate.mock.invocationCallOrder[0]);
  });
  it.each(['COMMIT', 'RELEASE', 'EXPIRE'] as const)(
    'evaluates %s once after settling the batch',
    async (reason) => {
      const { adapter, tx, alerts } = build();
      tx.$queryRaw.mockResolvedValue([{ stock: 7, reserved_stock: 0 }]);
      await adapter.settle(tx as never, {
        orderId: actor,
        actorId: null,
        reason,
        changes: [
          { inventoryId: 10n, quantity: 1 },
          { inventoryId: 2n, quantity: 2 },
        ],
      });
      expect(alerts.evaluate).toHaveBeenCalledTimes(1);
      expect(alerts.evaluate).toHaveBeenCalledWith(tx, [2n, 10n], null);
      const data = tx.inventoryAuditLog.create.mock.calls[0][0].data;
      expect(data.quantityDelta).toBe(reason === 'COMMIT' ? -2 : 0);
    },
  );
  it('propagates an alert failure to rollback the caller transaction', async () => {
    const { adapter, tx, alerts } = build();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 101n }])
      .mockResolvedValueOnce([{ stock: 10, reserved_stock: 1 }]);
    alerts.evaluate.mockRejectedValue(new Error('alerts failed'));
    await expect(
      adapter.reserve(tx as never, {
        inventoryId: 1n,
        orderId: actor,
        quantity: 1,
        ttlMinutes: 15,
        actorId: null,
      }),
    ).rejects.toThrow('alerts failed');
  });
});
