import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminOrdersQueryService } from './admin-orders.service';

describe('AdminOrdersQueryService (FR-ORD-05)', () => {
  let service: AdminOrdersQueryService;

  const tx = {
    $executeRaw: jest.fn(),
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const mockPrisma = {
    order: tx.order,
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };

  const mockOrdersService = {
    changeStatus: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOrdersQueryService(
      mockPrisma as unknown as PrismaService,
      mockOrdersService as unknown as OrdersService,
    );
  });

  it('findAll throws 422 when from > to', async () => {
    await expect(
      service.findAll({ from: '2026-11-12', to: '2026-11-01' }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the same warehouse and date filter for count and page queries', async () => {
    const warehouseId = 'aa147233-506a-4181-a913-c6766b575a36';
    tx.order.count.mockResolvedValue(3);
    tx.order.findMany.mockResolvedValue([]);

    const result = await service.findAll({
      warehouseId,
      status: OrderStatus.CONFIRMED,
      from: '2026-11-18',
      to: '2026-11-18',
      page: 2,
      limit: 2,
    });

    const where = {
      items: { some: { warehouseId } },
      status: OrderStatus.CONFIRMED,
      createdAt: {
        gte: new Date('2026-11-17T17:00:00.000Z'),
        lt: new Date('2026-11-18T17:00:00.000Z'),
      },
    };
    expect(tx.order.count).toHaveBeenCalledWith({ where });
    expect(tx.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 2,
        take: 2,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalledWith(["SET LOCAL TIME ZONE 'UTC'"]);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(result).toEqual({
      items: [],
      total: 3,
      page: 2,
      limit: 2,
      totalPages: 2,
    });
  });

  it('findOne throws 404 when order does not exist', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updateStatus rejects non-SHIPPING/DELIVERED targets with 409', async () => {
    await expect(
      service.updateStatus(
        'ord-1',
        { targetStatus: OrderStatus.CANCELLED },
        'staff-1',
      ),
    ).rejects.toThrow(ConflictException);
    expect(mockOrdersService.changeStatus).not.toHaveBeenCalled();
  });

  it('updateStatus delegates valid SHIPPING transition to OrdersService.changeStatus', async () => {
    mockOrdersService.changeStatus.mockResolvedValue({ id: 'ord-1' });
    mockPrisma.order.findUnique.mockResolvedValue({
      id: 'ord-1',
      orderCode: 'ORD-001',
      userId: 'cust-1',
      status: OrderStatus.SHIPPING,
      subtotal: { toFixed: () => '100000.00' },
      discountTotal: { toFixed: () => '0.00' },
      shippingFee: { toFixed: () => '0.00' },
      grandTotal: { toFixed: () => '100000.00' },
      currency: 'VND',
      shippingRecipient: 'Nguyen Van A',
      shippingPhone: '0900000000',
      shippingAddress: 'TP HCM',
      shippingRegion: null,
      confirmedAt: new Date(),
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'cust-1',
        username: 'a',
        fullName: 'A',
        email: 'a@gmail.com',
      },
      items: [],
      payments: [],
      statusHistory: [],
    });

    const res = await service.updateStatus(
      'ord-1',
      { targetStatus: OrderStatus.SHIPPING, note: 'Đã giao ĐVVC' },
      'staff-1',
    );

    expect(mockOrdersService.changeStatus).toHaveBeenCalledWith(
      'ord-1',
      OrderStatus.SHIPPING,
      'staff-1',
      'Đã giao ĐVVC',
    );
    expect(res.status).toBe(OrderStatus.SHIPPING);
    expect(res.grandTotal).toBe('100000.00');
  });
});
