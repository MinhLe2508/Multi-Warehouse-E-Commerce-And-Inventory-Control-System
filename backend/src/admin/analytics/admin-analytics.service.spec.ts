import { UnprocessableEntityException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAnalyticsService } from './admin-analytics.service';

describe('AdminAnalyticsService (FR-DASH-02)', () => {
  let service: AdminAnalyticsService;

  const mockPrisma = {
    order: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    orderItem: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    warehouse: {
      findMany: jest.fn(),
    },
    inventory: {
      findMany: jest.fn(),
    },
    stockReservation: {
      count: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminAnalyticsService(mockPrisma as unknown as PrismaService);
  });

  it('throws 422 when fromDate > toDate', async () => {
    await expect(
      service.getSummary({ fromDate: '2026-11-15', toDate: '2026-11-10' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns zeroed metrics and string revenue when there are no orders', async () => {
    mockPrisma.order.groupBy.mockResolvedValue([]);
    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: { grandTotal: null },
      _count: { _all: 0 },
    });
    mockPrisma.orderItem.groupBy.mockResolvedValue([]);
    mockPrisma.warehouse.findMany.mockResolvedValue([
      {
        id: 'wh-1',
        code: 'WH-HCM',
        name: 'Kho HCM',
        defaultLowStockThreshold: 10,
      },
    ]);
    mockPrisma.inventory.findMany.mockResolvedValue([]);
    mockPrisma.stockReservation.count.mockResolvedValue(0);

    const res = await service.getSummary({
      fromDate: '2026-11-01',
      toDate: '2026-11-12',
    });

    expect(res.revenue.total).toBe('0.00');
    expect(typeof res.revenue.total).toBe('string');
    expect(res.revenue.orderCount).toBe(0);
    expect(res.topProducts).toEqual([]);
    expect(res.ordersByStatus.CONFIRMED).toBe(0);
    expect(res.expiredReservations).toBe(0);
  });

  it('computes string revenue, top products, and low-stock by warehouse', async () => {
    mockPrisma.order.groupBy.mockResolvedValue([
      { status: OrderStatus.CONFIRMED, _count: { _all: 2 } },
      { status: OrderStatus.CANCELLED, _count: { _all: 1 } },
    ]);
    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: { grandTotal: new Prisma.Decimal('1500000.50') },
      _count: { _all: 2 },
    });
    mockPrisma.orderItem.groupBy.mockResolvedValue([
      {
        productId: 'p1',
        sku: 'SKU-001',
        _sum: { quantity: 3, lineTotal: new Prisma.Decimal('900000') },
        _max: { productName: 'Bàn phím cơ' },
      },
    ]);
    mockPrisma.warehouse.findMany.mockResolvedValue([
      {
        id: 'wh-1',
        code: 'WH-HCM',
        name: 'Kho HCM',
        defaultLowStockThreshold: 10,
      },
    ]);
    mockPrisma.inventory.findMany.mockResolvedValue([
      { warehouseId: 'wh-1', availableStock: 0, threshold: null },
      { warehouseId: 'wh-1', availableStock: 8, threshold: 10 },
      { warehouseId: 'wh-1', availableStock: 25, threshold: 10 },
    ]);
    mockPrisma.stockReservation.count.mockResolvedValue(4);

    const res = await service.getSummary({
      fromDate: '2026-11-01',
      toDate: '2026-11-12',
    });

    expect(res.revenue.total).toBe('1500000.50');
    expect(res.revenue.orderCount).toBe(2);
    expect(res.ordersByStatus.CONFIRMED).toBe(2);
    expect(res.ordersByStatus.CANCELLED).toBe(1);
    expect(res.topProducts[0]).toEqual({
      productId: 'p1',
      sku: 'SKU-001',
      name: 'Bàn phím cơ',
      quantitySold: 3,
      revenue: '900000.00',
    });
    expect(res.lowStockByWarehouse[0]).toEqual({
      warehouseId: 'wh-1',
      code: 'WH-HCM',
      name: 'Kho HCM',
      lowStockItems: 2,
      outOfStockItems: 1,
    });
    expect(res.expiredReservations).toBe(4);
  });
});
