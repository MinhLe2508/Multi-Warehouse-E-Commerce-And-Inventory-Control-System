import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';

describe('OrdersService status history - week 4', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const tx = {
    $queryRaw: jest.fn(),
    order: { findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
  const stock = { releaseForOrder: jest.fn() };
  const service = new OrdersService(prisma as never, {} as never, stock as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: orderId }]);
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.orderStatusHistory.create.mockResolvedValue({ id: 1n });
  });

  it.each([
    ['CONFIRMED', 'SHIPPING'],
    ['SHIPPING', 'DELIVERED'],
  ] as const)('changes %s to %s and records audit in same transaction', async (from, to) => {
    tx.order.findUniqueOrThrow.mockResolvedValue({ id: orderId, status: from });
    await expect(service.changeStatus(orderId, to, actorId)).resolves.toMatchObject({ status: to });
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: orderId, status: from } }));
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      orderId, fromStatus: from, toStatus: to, actorId,
    }) });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects illegal transitions without changing order/history', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({ id: orderId, status: 'PENDING_PAYMENT' });
    await expect(service.changeStatus(orderId, 'DELIVERED', actorId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });

  it('cancels a pending order only after releasing reservations in the transaction', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({ id: orderId, status: 'PENDING_PAYMENT' });
    await service.changeStatus(orderId, 'CANCELLED', actorId, 'Khách yêu cầu');
    expect(stock.releaseForOrder).toHaveBeenCalledWith(tx, orderId, actorId);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      fromStatus: 'PENDING_PAYMENT', toStatus: 'CANCELLED', reason: 'Khách yêu cầu',
    }) });
  });

  it('propagates history-write errors so database transaction can roll back', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({ id: orderId, status: 'CONFIRMED' });
    tx.orderStatusHistory.create.mockRejectedValueOnce(new Error('audit insert failed'));
    await expect(service.changeStatus(orderId, 'SHIPPING', actorId)).rejects.toThrow('audit insert failed');
  });

  it('does not log a status change when conditional update fails', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({ id: orderId, status: 'CONFIRMED' });
    tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.changeStatus(orderId, 'SHIPPING', actorId)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
  });
});
