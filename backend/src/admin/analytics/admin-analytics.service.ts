import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { OrderStatus, Prisma, ReservationStatus } from '@prisma/client';
import { isDateString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AnalyticsQueryDto,
  RevenueSeriesQueryDto,
} from './dto/analytics-query.dto';

interface ReportingRange {
  fromDate: string;
  toDate: string;
  startUtc: Date;
  endExclusiveUtc: Date;
}

const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
];

export interface AnalyticsSummaryResponse {
  range: {
    fromDate: string;
    toDate: string;
    warehouseId: string | null;
  };
  ordersByStatus: Record<OrderStatus, number>;
  revenue: {
    total: string;
    currency: 'VND';
    orderCount: number;
  };
  topProducts: Array<{
    productId: string;
    sku: string;
    name: string;
    quantitySold: number;
    revenue: string;
  }>;
  lowStockByWarehouse: Array<{
    warehouseId: string;
    code: string;
    name: string;
    lowStockItems: number;
    outOfStockItems: number;
  }>;
  expiredReservations: number;
}

export interface RevenueSeriesPoint {
  date: string;
  revenue: string;
  orderCount: number;
}

export interface RevenueSeriesResponse {
  range: {
    fromDate: string;
    toDate: string;
    warehouseId: string | null;
    granularity: 'day';
  };
  series: RevenueSeriesPoint[];
}

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseRange(query: AnalyticsQueryDto): ReportingRange {
    const now = new Date();
    // Mặc định 14 ngày gần nhất theo giờ Việt Nam (UTC+7)
    const vnNow = new Date(now.getTime() + VIETNAM_OFFSET_MS);
    const defaultTo = vnNow.toISOString().slice(0, 10);
    const vnFrom = new Date(vnNow.getTime() - 13 * DAY_MS);
    const defaultFrom = vnFrom.toISOString().slice(0, 10);

    const fromDate = query.fromDate ?? defaultFrom;
    const toDate = query.toDate ?? defaultTo;

    if (
      [fromDate, toDate].some(
        (date) =>
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !isDateString(date, { strict: true }),
      )
    ) {
      throw new UnprocessableEntityException(
        'Khoảng ngày fromDate/toDate không hợp lệ',
      );
    }

    if (fromDate > toDate) {
      throw new UnprocessableEntityException(
        'fromDate không được lớn hơn toDate',
      );
    }

    const startUtc = new Date(`${fromDate}T00:00:00.000+07:00`);
    const endStartUtc = new Date(`${toDate}T00:00:00.000+07:00`);
    const endExclusiveUtc = new Date(endStartUtc.getTime() + DAY_MS);

    return { fromDate, toDate, startUtc, endExclusiveUtc };
  }

  private readInUtc<T>(read: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(
      async (tx) => {
        // The adapter binds DateTime values in UTC. Keep the session zone aligned
        // with those values for comparisons against PostgreSQL timestamptz.
        await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        return read(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private decimalToString(
    value: Prisma.Decimal | number | string | null,
  ): string {
    if (value === null || value === undefined) return '0.00';
    if (typeof value === 'string') {
      const dec = new Prisma.Decimal(value);
      return dec.toFixed(2);
    }
    if (typeof value === 'number') {
      return new Prisma.Decimal(value).toFixed(2);
    }
    return value.toFixed(2);
  }

  async getSummary(
    query: AnalyticsQueryDto,
  ): Promise<AnalyticsSummaryResponse> {
    const range = this.parseRange(query);
    return this.readInUtc((tx) =>
      this.readSummary(tx, query.warehouseId ?? null, range),
    );
  }

  private async readSummary(
    tx: Prisma.TransactionClient,
    warehouseId: string | null,
    { fromDate, toDate, startUtc, endExclusiveUtc }: ReportingRange,
  ): Promise<AnalyticsSummaryResponse> {
    const orderWhereBase: Prisma.OrderWhereInput = {
      createdAt: {
        gte: startUtc,
        lt: endExclusiveUtc,
      },
      ...(warehouseId
        ? {
            items: {
              some: { warehouseId },
            },
          }
        : {}),
    };

    // 1. Số đơn theo trạng thái
    const statusGroups = await tx.order.groupBy({
      by: ['status'],
      where: orderWhereBase,
      _count: { _all: true },
    });

    const ordersByStatus: Record<OrderStatus, number> = {
      PENDING_PAYMENT: 0,
      CONFIRMED: 0,
      SHIPPING: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };
    for (const row of statusGroups) {
      ordersByStatus[row.status] = row._count._all;
    }

    // 2. Doanh thu = SUM(grand_total) cho các đơn CONFIRMED/SHIPPING/DELIVERED
    // Nếu lọc theo warehouseId, vẫn tính tổng trên các đơn có hàng thuộc kho đó hoặc tổng lineTotal của kho đó
    let revenueTotal = '0.00';
    let revenueOrderCount = 0;

    if (!warehouseId) {
      const agg = await tx.order.aggregate({
        where: {
          ...orderWhereBase,
          status: { in: REVENUE_STATUSES },
        },
        _sum: { grandTotal: true },
        _count: { _all: true },
      });
      revenueTotal = this.decimalToString(agg._sum.grandTotal);
      revenueOrderCount = agg._count._all;
    } else {
      const agg = await tx.orderItem.aggregate({
        where: {
          warehouseId,
          order: {
            status: { in: REVENUE_STATUSES },
            createdAt: { gte: startUtc, lt: endExclusiveUtc },
          },
        },
        _sum: { lineTotal: true },
      });
      const distinctOrders = await tx.order.count({
        where: {
          ...orderWhereBase,
          status: { in: REVENUE_STATUSES },
        },
      });
      revenueTotal = this.decimalToString(agg._sum.lineTotal);
      revenueOrderCount = distinctOrders;
    }

    // 3. Top sản phẩm bán chạy
    const topRaw = await tx.orderItem.groupBy({
      by: ['productId', 'sku'],
      where: {
        ...(warehouseId ? { warehouseId } : {}),
        order: {
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: startUtc, lt: endExclusiveUtc },
        },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      _max: {
        productName: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 5,
    });

    const topProducts = topRaw.map((item) => ({
      productId: item.productId,
      sku: item.sku,
      name: item._max.productName ?? item.sku,
      quantitySold: item._sum.quantity ?? 0,
      revenue: this.decimalToString(item._sum.lineTotal),
    }));

    // 4. Low-stock theo kho (available_stock <= COALESCE(inventory.threshold, warehouse.defaultLowStockThreshold))
    const warehouses = await tx.warehouse.findMany({
      where: warehouseId ? { id: warehouseId } : undefined,
      select: {
        id: true,
        code: true,
        name: true,
        defaultLowStockThreshold: true,
      },
      orderBy: { code: 'asc' },
    });

    const invRows = await tx.inventory.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      select: {
        warehouseId: true,
        availableStock: true,
        threshold: true,
      },
    });

    const warehouseMap = new Map(
      warehouses.map((w) => [
        w.id,
        {
          warehouseId: w.id,
          code: w.code,
          name: w.name,
          defaultThreshold: w.defaultLowStockThreshold,
          lowStockItems: 0,
          outOfStockItems: 0,
        },
      ]),
    );

    for (const inv of invRows) {
      const target = warehouseMap.get(inv.warehouseId);
      if (!target) continue;
      const effectiveThreshold = inv.threshold ?? target.defaultThreshold;
      if (inv.availableStock === 0) {
        target.outOfStockItems += 1;
      }
      if (inv.availableStock <= effectiveThreshold) {
        target.lowStockItems += 1;
      }
    }

    const lowStockByWarehouse = Array.from(warehouseMap.values()).map(
      ({ warehouseId: wid, code, name, lowStockItems, outOfStockItems }) => ({
        warehouseId: wid,
        code,
        name,
        lowStockItems,
        outOfStockItems,
      }),
    );

    // 5. Reservation hết hạn trong khoảng ngày (theo releasedAt)
    const expiredReservations = await tx.stockReservation.count({
      where: {
        status: ReservationStatus.EXPIRED,
        releasedAt: {
          gte: startUtc,
          lt: endExclusiveUtc,
        },
        ...(warehouseId
          ? {
              inventory: { warehouseId },
            }
          : {}),
      },
    });

    return {
      range: {
        fromDate,
        toDate,
        warehouseId,
      },
      ordersByStatus,
      revenue: {
        total: revenueTotal,
        currency: 'VND',
        orderCount: revenueOrderCount,
      },
      topProducts,
      lowStockByWarehouse,
      expiredReservations,
    };
  }

  async getRevenueSeries(
    query: RevenueSeriesQueryDto,
  ): Promise<RevenueSeriesResponse> {
    const range = this.parseRange(query);
    return this.readInUtc((tx) =>
      this.readRevenueSeries(tx, query.warehouseId ?? null, range),
    );
  }

  private async readRevenueSeries(
    tx: Prisma.TransactionClient,
    warehouseId: string | null,
    { fromDate, toDate, startUtc, endExclusiveUtc }: ReportingRange,
  ): Promise<RevenueSeriesResponse> {
    // Tạo danh sách đầy đủ các ngày từ fromDate -> toDate
    const seriesMap = new Map<
      string,
      { total: Prisma.Decimal; orderIds: Set<string> }
    >();
    const cursor = new Date(`${fromDate}T00:00:00.000Z`);
    const endCursor = new Date(`${toDate}T00:00:00.000Z`);

    while (cursor <= endCursor) {
      const key = cursor.toISOString().slice(0, 10);
      seriesMap.set(key, {
        total: new Prisma.Decimal(0),
        orderIds: new Set<string>(),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (!warehouseId) {
      const orders = await tx.order.findMany({
        where: {
          status: { in: REVENUE_STATUSES },
          createdAt: { gte: startUtc, lt: endExclusiveUtc },
        },
        select: {
          id: true,
          grandTotal: true,
          createdAt: true,
        },
      });

      for (const ord of orders) {
        const vnDate = new Date(ord.createdAt.getTime() + VIETNAM_OFFSET_MS)
          .toISOString()
          .slice(0, 10);
        const bucket = seriesMap.get(vnDate);
        if (bucket) {
          bucket.total = bucket.total.plus(ord.grandTotal);
          bucket.orderIds.add(ord.id);
        }
      }
    } else {
      const items = await tx.orderItem.findMany({
        where: {
          warehouseId,
          order: {
            status: { in: REVENUE_STATUSES },
            createdAt: { gte: startUtc, lt: endExclusiveUtc },
          },
        },
        select: {
          orderId: true,
          lineTotal: true,
          order: {
            select: { createdAt: true },
          },
        },
      });

      for (const item of items) {
        const vnDate = new Date(
          item.order.createdAt.getTime() + VIETNAM_OFFSET_MS,
        )
          .toISOString()
          .slice(0, 10);
        const bucket = seriesMap.get(vnDate);
        if (bucket) {
          bucket.total = bucket.total.plus(item.lineTotal);
          bucket.orderIds.add(item.orderId);
        }
      }
    }

    const series: RevenueSeriesPoint[] = Array.from(seriesMap.entries()).map(
      ([date, val]) => ({
        date,
        revenue: val.total.toFixed(2),
        orderCount: val.orderIds.size,
      }),
    );

    return {
      range: {
        fromDate,
        toDate,
        warehouseId,
        granularity: 'day',
      },
      series,
    };
  }
}
