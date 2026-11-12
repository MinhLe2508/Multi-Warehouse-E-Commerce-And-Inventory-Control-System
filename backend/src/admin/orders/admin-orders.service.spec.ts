import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminOrdersQueryService } from './admin-orders.service';

describe('AdminOrdersQueryService (FR-ORD-05)', () => {
  let service: AdminOrdersQueryService;

  const mockPrisma = {
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
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
