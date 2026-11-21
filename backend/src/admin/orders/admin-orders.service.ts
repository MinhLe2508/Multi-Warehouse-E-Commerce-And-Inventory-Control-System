import {
  assertAssignedWarehouses,
  staffOrderWhere,
} from '../../staff/warehouse-scope';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import {
  ORDER_STATUS_TRANSITIONS,
  OrdersService,
} from '../../orders/orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { paymentSupportSelect } from '../../payments/payment-support-policy';
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

  async findAll(query: QueryAdminOrdersDto, staffId?: string) {
    if (staffId && query.paymentSupport) throw new ForbiddenException();
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
      ...(query.paymentSupport && {
        payments: { some: { method: 'BANK_TRANSFER', supportRequest: { is: { status: query.paymentSupport } } } },
      }),
      ...staffOrderWhere(staffId, query.warehouseId),
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

    if (query.reservation) {
      const now = new Date();
      where.AND = {
        status: 'PENDING_PAYMENT',
        reservationExpiresAt:
          query.reservation === 'EXPIRED'
            ? { lte: now }
            : {
                gt: now,
                ...(query.reservation === 'EXPIRING'
                  ? { lte: new Date(now.getTime() + 15 * 60_000) }
                  : {}),
              },
      };
    }

    const listQuery = {
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
            warehouse: { select: { id: true, code: true, name: true } },
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
            ...(!staffId && {
              supportRequest: { select: paymentSupportSelect },
            }),
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
    } satisfies Prisma.OrderFindManyArgs;

    const [total, orders] = await this.prisma.$transaction(
      async (tx) => {
        if (createdAtFilter) {
          // Bind Prisma DateTime parameters in UTC for this transaction only.
          await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
        }
        const total = await tx.order.count({ where });
        const orders = await tx.order.findMany(listQuery);
        return [total, orders] as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      items: orders.map((order) => this.serializeOrder(order, staffId)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, staffId?: string) {
    const selection = {
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
            product: { select: { imageUrl: true } },
            reservations: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { status: true },
            },
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
            ...(!staffId && {
              gatewayResponse: true,
              supportRequest: { select: paymentSupportSelect },
            }),
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
    } satisfies Pick<Prisma.OrderFindFirstArgs, 'include'>;
    const order = staffId
      ? await this.prisma.order.findFirst({
          where: { id, ...staffOrderWhere(staffId) },
          ...selection,
        })
      : await this.prisma.order.findUnique({ where: { id }, ...selection });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    const detail = this.serializeOrder(order, staffId);
    if (!staffId) return detail;
    return {
      ...detail,
      nextStatuses: (ORDER_STATUS_TRANSITIONS[order.status] ?? []).filter(
        (status) => ADMIN_ALLOWED_TARGETS.has(status),
      ),
    };
  }

  async updateStatus(
    orderId: string,
    dto: UpdateAdminOrderStatusDto,
    actorId: string,
    staffId?: string,
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
    const authorize = staffId
      ? async (tx: Prisma.TransactionClient) => {
          const rows = await tx.orderItem.findMany({
            where: { orderId },
            distinct: ['warehouseId'],
            select: { warehouseId: true },
          });
          await assertAssignedWarehouses(
            tx,
            staffId,
            rows.map(({ warehouseId }) => warehouseId),
          );
        }
      : undefined;
    const updated = await this.ordersService.changeStatus(
      orderId,
      nextStatus,
      actorId,
      reason,
      authorize,
      dto.codCollected,
    );
    return staffId
      ? this.findOne(updated.id, staffId)
      : this.findOne(updated.id);
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
    reservationExpiresAt?: Date | null;
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
      product?: { imageUrl: string | null };
      reservations?: Array<{ status: string }>;
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
      gatewayResponse?: Prisma.JsonValue;
      supportRequest?: Prisma.PaymentSupportRequestGetPayload<{ select: typeof paymentSupportSelect }> | null;
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
  }, staffId?: string) {
    const supportedPayment = staffId ? undefined : order.payments.find(
      (payment) => payment.method === 'BANK_TRANSFER' && payment.supportRequest,
    );
    const recipient = supportedPayment?.gatewayResponse;
    const accountNumber = recipient && typeof recipient === 'object' && !Array.isArray(recipient) &&
      typeof recipient.accountNumber === 'string' ? recipient.accountNumber : null;
    const support = supportedPayment?.supportRequest;
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
      reservationExpiresAt: order.reservationExpiresAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: order.user ?? null,
      ...(!staffId && {
        paymentSupport: support && supportedPayment ? {
          ...support,
          paymentId: supportedPayment.id,
          amount: supportedPayment.amount.toFixed(2),
          transactionRef: supportedPayment.transactionRef,
          accountNumber,
          canConfirm: support.status === 'OPEN' && supportedPayment.status === 'PENDING' &&
            order.status === 'PENDING_PAYMENT' && (order.reservationExpiresAt?.getTime() ?? 0) > Date.now(),
        } : null,
      }),
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        warehouseId: item.warehouseId,
        ...(item.inventoryId !== undefined
          ? { inventoryId: item.inventoryId.toString() }
          : {}),
        productName: item.productName,
        imageUrl: item.product?.imageUrl,
        reservationStatus: item.reservations?.[0]?.status,
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
