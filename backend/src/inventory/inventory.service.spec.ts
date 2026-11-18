import { ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

const ACTOR = '11111111-1111-4111-8111-111111111111';

function serviceRejecting(error: unknown) {
  const prisma = { $transaction: jest.fn().mockRejectedValue(error) };
  const alerts = { evaluate: jest.fn() };
  return new InventoryService(prisma as never, alerts as never);
}

describe('InventoryService — database error translation', () => {
  it.each([
    [{ code: '23514' }, ConflictException],
    [{ code: 'P2010', meta: { code: '23514' } }, ConflictException],
    [
      {
        code: 'P2010',
        meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
      },
      ConflictException,
    ],
    [
      {
        code: 'P2039',
        meta: { driverAdapterError: { cause: { originalCode: '23503' } } },
      },
      NotFoundException,
    ],
  ])(
    'maps SQLSTATE for supported driver error shapes (%#)',
    async (error, expected) => {
      const service = serviceRejecting(error);
      await expect(
        service.restock('1', { quantity: 1 }, ACTOR),
      ).rejects.toBeInstanceOf(expected);
    },
  );

  it('preserves an existing HTTP exception', async () => {
    const error = new ConflictException('capacity');
    await expect(
      serviceRejecting(error).restock('1', { quantity: 1 }, ACTOR),
    ).rejects.toBe(error);
  });

  it('preserves unexpected infrastructure failures', async () => {
    const error = new Error('connection lost');
    await expect(
      serviceRejecting(error).restock('1', { quantity: 1 }, ACTOR),
    ).rejects.toBe(error);
  });
});
