import { ConflictException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService ACID payment - week 4', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const tx = {
    $queryRaw: jest.fn(),
    order: { findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
    payment: { findUnique: jest.fn(), create: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const stock = { commitForOrder: jest.fn() };
  const gateway = { charge: jest.fn() };
  const service = new PaymentsService(
    prisma as never,
    stock as never,
    gateway as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: orderId }]);
    tx.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      status: 'PENDING_PAYMENT',
      grandTotal: '100',
      currency: 'VND',
    });
    tx.payment.findUnique.mockResolvedValue(null);
    tx.payment.create.mockResolvedValue({ id: 'payment-id' });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderStatusHistory.create.mockResolvedValue({ id: 1n });
    gateway.charge.mockReturnValue({ approved: true, code: 'OK' });
  });

  it('commits stock + confirms order + records history in the same transaction', async () => {
    await expect(
      service.process(userId, orderId, 'ref-1', 'MOCK_CARD', true),
    ).resolves.toMatchObject({ status: 'SUCCESS', orderStatus: 'CONFIRMED' });
    expect(stock.commitForOrder).toHaveBeenCalledWith(tx, orderId, userId);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'CONFIRMED',
        orderId,
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('records failed payment without confirming the order or consuming stock', async () => {
    gateway.charge.mockReturnValue({ approved: false, code: 'DECLINED' });
    await expect(
      service.process(userId, orderId, 'ref-fail', 'MOCK_CARD', false),
    ).resolves.toMatchObject({
      status: 'FAILED',
      orderStatus: 'PENDING_PAYMENT',
    });
    expect(stock.commitForOrder).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('returns idempotent result on replay without charging stock twice', async () => {
    tx.payment.findUnique.mockResolvedValue({
      orderId,
      method: 'MOCK_CARD',
      status: 'SUCCESS',
    });
    tx.order.findUniqueOrThrow.mockResolvedValue({
      id: orderId,
      status: 'CONFIRMED',
    });
    await expect(
      service.process(userId, orderId, 'ref-1', 'MOCK_CARD', true),
    ).resolves.toMatchObject({ duplicate: true });
    expect(stock.commitForOrder).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects payment reference belonging to another order', async () => {
    tx.payment.findUnique.mockResolvedValue({
      orderId: 'other-order',
      method: 'MOCK_CARD',
      status: 'SUCCESS',
    });
    await expect(
      service.process(userId, orderId, 'ref-1', 'MOCK_CARD', true),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propagates audit-write failures so transaction must be rolled back', async () => {
    tx.orderStatusHistory.create.mockRejectedValueOnce(
      new Error('history failed'),
    );
    await expect(
      service.process(userId, orderId, 'ref-1', 'MOCK_CARD', true),
    ).rejects.toThrow('history failed');
  });
});
