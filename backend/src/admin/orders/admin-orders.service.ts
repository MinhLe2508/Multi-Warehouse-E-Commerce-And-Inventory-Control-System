import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { OrdersService } from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import type { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';

const ADMIN_ALLOWED_TARGETS = new Set<OrderStatus>([
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
]);

@Injectable()
export class AdminOrdersQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(query: QueryAdminOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    let createdAtFilter: Prisma.DateTimeFilter | undefined;
    if (query.from && query.to && query.from > query.to) {
      throw new UnprocessableEntityException('from không được lớn hơn to');
    }

    if (query.from || query.to) {
      const gte = query.from
        ? new Date(`${query.from}T00:00:00.000+07:00`)
        : undefined;
      let lt: Date | undefined;
      if (query.to) {
        const endStart = new Date(`${query.to}T00:00:00.000+07:00`);
        lt = new Date(endStart.getTime() + 24 * 60 * 60 * 1000);
      }
      createdAtFilter = {
        ...(gte ? { gte } : {}),
        ...(lt ? { lt } : {}),
      };
    }

    const search = query.q?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      ...(search
        ? {
            OR: [
              { orderCode: { contains: search, mode: 'insensitive' } },
              { shippingRecipient: { contains: search, mode: 'insensitive' } },
              { shippingPhone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              email: true,
            },
          },
          items: {
            select: {
              id: true,
              productId: true,
              warehouseId: true,
              productName: true,
              sku: true,
              unitPrice: true,
              quantity: true,
              lineTotal: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              method: true,
              status: true,
              amount: true,
              transactionRef: true,
              processedAt: true,
              createdAt: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              actorId: true,
              reason: true,
              createdAt: true,
              actor: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  role: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      items: orders.map((order) => this.serializeOrder(order)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
          },
        },
        items: {
          select: {
            id: true,
            productId: true,
            warehouseId: true,
            inventoryId: true,
            productName: true,
            sku: true,
            unitPrice: true,
            discountAmount: true,
            quantity: true,
            lineTotal: true,
            warehouse: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            currency: true,
            transactionRef: true,
            failureReason: true,
            processedAt: true,
            createdAt: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            actorId: true,
            reason: true,
            createdAt: true,
            actor: {
              select: {
                id: true,
                username: true,
                fullName: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    return this.serializeOrder(order);
  }

  async updateStatus(
    orderId: string,
    dto: UpdateAdminOrderStatusDto,
    actorId: string,
  ) {
    const nextStatus = dto.targetStatus ?? dto.status;
    if (!nextStatus) {
      throw new UnprocessableEntityException('Thiếu targetStatus');
    }

    // Admin/Staff API chỉ cho phép chuyển tiếp SHIPPING hoặc DELIVERED (FR-ORD-05)
    if (!ADMIN_ALLOWED_TARGETS.has(nextStatus)) {
      throw new ConflictException(
        `Admin/Staff chỉ được chuyển trạng thái sang SHIPPING hoặc DELIVERED (nhận ${nextStatus})`,
      );
    }

    const reason = dto.note ?? dto.reason;
    const updated = await this.ordersService.changeStatus(
      orderId,
      nextStatus,
      actorId,
      reason,
    );
    return this.findOne(updated.id);
  }

  private serializeOrder(order: {
    id: string;
    orderCode: string;
    userId: string;
    status: OrderStatus;
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    shippingFee: Prisma.Decimal;
    grandTotal: Prisma.Decimal;
    currency: string;
    shippingRecipient: string;
    shippingPhone: string;
    shippingAddress: string;
    shippingRegion: string | null;
    confirmedAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    user?: { id: string; username: string; fullName: string; email: string };
    items: Array<{
      id: string;
      productId: string;
      warehouseId: string;
      inventoryId?: bigint;
      productName: string;
      sku: string;
      unitPrice: Prisma.Decimal;
      discountAmount?: Prisma.Decimal;
      quantity: number;
      lineTotal: Prisma.Decimal;
      warehouse?: { id: string; code: string; name: string };
    }>;
    payments: Array<{
      id: string;
      method: string;
      status: string;
      amount: Prisma.Decimal;
      transactionRef: string;
      processedAt: Date | null;
      createdAt: Date;
      currency?: string;
      failureReason?: string | null;
    }>;
    statusHistory: Array<{
      id: bigint;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus;
      actorId: string | null;
      reason: string | null;
      createdAt: Date;
      actor?: {
        id: string;
        username: string;
        fullName: string;
        role: string;
      } | null;
    }>;
  }) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      userId: order.userId,
      status: order.status,
      subtotal: order.subtotal.toFixed(2),
      discountTotal: order.discountTotal.toFixed(2),
      shippingFee: order.shippingFee.toFixed(2),
      grandTotal: order.grandTotal.toFixed(2),
      currency: order.currency,
      shippingRecipient: order.shippingRecipient,
      shippingPhone: order.shippingPhone,
      shippingAddress: order.shippingAddress,
      shippingRegion: order.shippingRegion,
      confirmedAt: order.confirmedAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: order.user ?? null,
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        ...(item.inventoryId !== undefined
          ? { inventoryId: item.inventoryId.toString() }
          : {}),
        productName: item.productName,
        sku: item.sku,
        unitPrice: item.unitPrice.toFixed(2),
        ...(item.discountAmount !== undefined
          ? { discountAmount: item.discountAmount.toFixed(2) }
          : {}),
        quantity: item.quantity,
        lineTotal: item.lineTotal.toFixed(2),
        ...(item.warehouse ? { warehouse: item.warehouse } : {}),
      })),
      payments: order.payments.map((p) => ({
        id: p.id,
        method: p.method,
        status: p.status,
        amount: p.amount.toFixed(2),
        transactionRef: p.transactionRef,
        processedAt: p.processedAt,
        createdAt: p.createdAt,
        ...(p.currency ? { currency: p.currency } : {}),
        ...(p.failureReason !== undefined
          ? { failureReason: p.failureReason }
          : {}),
      })),
      statusHistory: order.statusHistory.map((h) => ({
        id: h.id.toString(),
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorId: h.actorId,
        actorName: h.actor?.fullName ?? h.actor?.username ?? 'Hệ thống',
        reason: h.reason,
        createdAt: h.createdAt,
      })),
    };
  }
}
