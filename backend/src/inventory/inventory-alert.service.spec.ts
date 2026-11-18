import { InventoryAlertService } from './inventory-alert.service';

describe('InventoryAlertService', () => {
  const service = new InventoryAlertService();
  function tx() {
    return {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
    };
  }
  it('locks deduplicated inventory IDs in numeric order and uses only the caller transaction', async () => {
    const client = tx();
    await expect(
      service.evaluate(client as never, [10n, 2n, 2n]),
    ).resolves.toEqual({ raised: 1, resolved: 2 });
    expect(client.$queryRaw.mock.calls[0][1]).toEqual([2n, 10n]);
    expect(client.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      client.$executeRaw.mock.invocationCallOrder[0],
    );
    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
  });
  it('does not query for an empty list', async () => {
    const client = tx();
    await expect(service.evaluate(client as never, [])).resolves.toEqual({
      raised: 0,
      resolved: 0,
    });
    expect(client.$queryRaw).not.toHaveBeenCalled();
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });
  it.each([0n, -1n, 9223372036854775808n, 1, '1', null])(
    'rejects invalid inventory ID %s before SQL',
    async (bad) => {
      const client = tx();
      await expect(
        service.evaluate(client as never, [bad] as never),
      ).rejects.toThrow('InventoryId');
      expect(client.$queryRaw).not.toHaveBeenCalled();
    },
  );
  it('rejects an invalid actor before SQL', async () => {
    const client = tx();
    await expect(
      service.evaluate(client as never, [1n], 'bad'),
    ).rejects.toThrow('Resolved By');
    expect(client.$queryRaw).not.toHaveBeenCalled();
  });
  it('lets a second-statement error escape to the transaction owner', async () => {
    const client = tx();
    client.$executeRaw
      .mockReset()
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('resolve failed'));
    await expect(service.evaluate(client as never, [1n])).rejects.toThrow(
      'resolve failed',
    );
  });
});
