import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { OrderStatus, Prisma } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CustomerOrdersQueryDto } from './dto/customer-orders-query.dto';
import { InventoryChangeEmitter } from '../inventory/inventory-change-emitter.service';
import { mockPaymentsEnabled } from '../payments/payment-mode';
import { recordCustomerOrderNotice } from './customer-order-notice';

interface CheckoutSnapshotRow {
  id: string;
  sku: string;
  name: string;
  basePrice: Prisma.Decimal;
  discountPercent: Prisma.Decimal;
  inventoryId: bigint | null;
  availableStock: number | null;
}

export const ORDER_STATUS_TRANSITIONS: Partial<
  Record<OrderStatus, OrderStatus[]>
> = {
  PENDING_PAYMENT: ['CANCELLED'],
  CONFIRMED: ['SHIPPING'],
  SHIPPING: ['DELIVERED'],
};

const customerOrderInclude = {
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      lineTotal: true,
      product: { select: { imageUrl: true } },
    },
  },
  payments: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      method: true,
      status: true,
      amount: true,
      transactionRef: true,
      processedAt: true,
    },
  },
} satisfies Prisma.OrderInclude;

type CustomerOrderRow = Prisma.OrderGetPayload<{
  include: typeof customerOrderInclude;
}>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly stockReservation: StockReservationService,
    private readonly changes: InventoryChangeEmitter,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const cod = dto.paymentMethod === 'COD';
    if (dto.paymentMethod && !cod && !mockPaymentsEnabled()) {
      throw new ConflictException('Phương thức thanh toán này chưa được mở.');
    }
    const codeToken = dto.checkoutId
      ? createHash('sha256')
          .update(`${userId}:${dto.checkoutId.toLowerCase()}`)
          .digest('hex')
      : randomUUID().replace(/-/g, '');
    const orderCode = `ORD-${codeToken.slice(0, 20).toUpperCase()}`;
    const initialStatus = cod ? 'CONFIRMED' : 'PENDING_PAYMENT';
    const { order, inventoryEvents } = await this.prisma.$transaction(
      async (tx) => {
        if (dto.checkoutId) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${orderCode}, 0))`;
          const previous = await tx.order.findUnique({
            where: { orderCode },
            include: {
              items: true,
              payments: { where: { method: 'COD' }, select: { id: true } },
            },
          });
          if (previous) {
            const quantities = new Map<string, number>();
            for (const item of previous.items) {
              quantities.set(
                item.productId,
                (quantities.get(item.productId) ?? 0) + item.quantity,
              );
            }
            if (
              previous.userId !== userId ||
              cod !== previous.payments.length > 0 ||
              previous.shippingRecipient !== dto.shippingRecipient ||
              previous.shippingPhone !== dto.shippingPhone ||
              previous.shippingAddress !== dto.shippingAddress ||
              previous.shippingRegion !== (dto.shippingRegion ?? null) ||
              quantities.size !== dto.items.length ||
              dto.items.some(
                (item) => quantities.get(item.productId) !== item.quantity,
              )
            ) {
              throw new ConflictException(
                'Mã đặt hàng đã được dùng cho một yêu cầu khác.',
              );
            }
            const { payments: _payments, ...replayed } = previous;
            return { order: this.serialize(replayed), inventoryEvents: [] };
          }
        }
        const productIds = dto.items.map(({ productId }) => productId);
        const snapshot = await tx.$queryRaw<CheckoutSnapshotRow[]>`
          SELECT p.id, p.sku, p.name, p.base_price AS "basePrice",
                 p.discount_percent AS "discountPercent",
                 candidate.id AS "inventoryId", candidate.available_stock AS "availableStock"
            FROM products p
            LEFT JOIN (
              SELECT i.id, i.product_id, i.available_stock
                FROM inventory i
                JOIN warehouses w ON w.id = i.warehouse_id AND w.is_active
            ) candidate ON candidate.product_id = p.id
           WHERE p.id = ANY(${productIds}::uuid[]) AND p.is_active
        `;
        const byId = new Map(snapshot.map((row) => [row.id, row]));
        if (byId.size !== productIds.length)
          throw new BadRequestException(
            'Sản phẩm không tồn tại hoặc đã ngừng bán.',
          );
        // Loại đơn đã thiếu tồn ngay trên snapshot, giảm tranh khóa khi SKU bán hết.
        // Các đơn đủ tồn vẫn phải kiểm tra lại sau khi khóa.
        const candidateIds: bigint[] = [];
        const availableByProduct = new Map<string, number>();
        for (const row of snapshot) {
          if (row.inventoryId === null) continue;
          candidateIds.push(row.inventoryId);
          availableByProduct.set(
            row.id,
            (availableByProduct.get(row.id) ?? 0) + (row.availableStock ?? 0),
          );
        }
        if (
          dto.items.some(
            ({ productId, quantity }) =>
              (availableByProduct.get(productId) ?? 0) < quantity,
          )
        ) {
          throw new ConflictException('INSUFFICIENT_STOCK');
        }

        // Khóa TẤT CẢ candidate theo inventory.id tăng dần trước khi tạo order_items.
        await this.stockReservation.lockInventories(tx, candidateIds);
        // Đọc lại dưới khóa, không dùng availableStock được đọc trước khi khóa.
        const locked = await tx.inventory.findMany({
          where: { id: { in: candidateIds } },
          select: {
            id: true,
            productId: true,
            warehouseId: true,
            availableStock: true,
            warehouse: { select: { code: true, region: true, isActive: true } },
          },
        });
        const lines: Array<{
          productId: string;
          inventoryId: bigint;
          warehouseId: string;
          quantity: number;
        }> = [];
        for (const request of dto.items) {
          let remaining = request.quantity;
          const warehouses = locked
            .filter(
              (c) => c.productId === request.productId && c.warehouse.isActive,
            )
            .sort((a, b) => {
              const aLocal =
                dto.shippingRegion && a.warehouse.region === dto.shippingRegion
                  ? 0
                  : 1;
              const bLocal =
                dto.shippingRegion && b.warehouse.region === dto.shippingRegion
                  ? 0
                  : 1;
              return (
                aLocal - bLocal ||
                a.warehouse.code.localeCompare(b.warehouse.code) ||
                (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
              );
            });
          for (const c of warehouses) {
            const amount = Math.min(remaining, c.availableStock);
            if (amount > 0)
              lines.push({
                productId: request.productId,
                inventoryId: c.id,
                warehouseId: c.warehouseId,
                quantity: amount,
              });
            remaining -= amount;
            if (remaining === 0) break;
          }
          if (remaining !== 0)
            throw new ConflictException('INSUFFICIENT_STOCK');
        }
        const price = this.pricing.calculateOrder(
          lines.map((l) => ({
            quantity: l.quantity,
            unitPrice: byId.get(l.productId)!.basePrice,
            discountPercent: byId.get(l.productId)!.discountPercent,
          })),
        );
        const order = await tx.order.create({
          data: {
            orderCode,
            userId,
            status: 'PENDING_PAYMENT',
            subtotal: price.subtotal,
            discountTotal: price.discountTotal,
            shippingFee: price.shippingFee,
            grandTotal: price.grandTotal,
            shippingRecipient: dto.shippingRecipient,
            shippingPhone: dto.shippingPhone,
            shippingAddress: dto.shippingAddress,
            shippingRegion: dto.shippingRegion,
          },
        });
        const allocations: Array<{
          orderItemId: string;
          inventoryId: bigint;
          quantity: number;
        }> = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const p = byId.get(line.productId)!;
          const amount = price.lines[i];
          const item = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: line.productId,
              warehouseId: line.warehouseId,
              inventoryId: line.inventoryId,
              productName: p.name,
              sku: p.sku,
              unitPrice: amount.unitPrice,
              discountAmount: amount.discountAmount,
              quantity: line.quantity,
              lineTotal: amount.lineTotal,
            },
          });
          allocations.push({
            orderItemId: item.id,
            inventoryId: line.inventoryId,
            quantity: line.quantity,
          });
        }
        await this.stockReservation.reserveForOrder(
          tx,
          order.id,
          allocations,
          userId,
        );
        if (cod) {
          await this.stockReservation.commitForOrder(tx, order.id, userId);
          await tx.payment.create({
            data: {
              orderId: order.id,
              transactionRef: `COD-${order.id}`,
              amount: order.grandTotal,
              currency: order.currency,
              method: 'COD',
              status: 'PENDING',
            },
          });
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              reservationExpiresAt: null,
            },
          });
        }
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: null,
            toStatus: initialStatus,
            actorId: userId,
            reason: cod ? 'Đã nhận đơn COD' : 'Tạo đơn và giữ chỗ tồn kho',
          },
        });
        await recordCustomerOrderNotice(tx, order, initialStatus);
        const result = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { items: true },
        });
        return {
          order: this.serialize(result),
          inventoryEvents: await this.changes.readSnapshots(
            lines.map(({ inventoryId }) => inventoryId),
            tx,
          ),
        };
      },
      {
        timeout: 30000,
        maxWait: 10000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
    await this.changes.publishSnapshots(inventoryEvents);
    return order;
  }

  /** All status changes and their audit rows share the caller's DB transaction. */
  async changeStatus(
    orderId: string,
    target: OrderStatus,
    actorId: string,
    reason?: string,
    authorize?: (tx: Prisma.TransactionClient) => Promise<void>,
    codCollected?: boolean,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
        if (!locked.length)
          throw new NotFoundException('Không tìm thấy đơn hàng.');
        await authorize?.(tx);
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(target)) {
          throw new ConflictException(
            `Không thể chuyển trạng thái ${order.status} -> ${target}.`,
          );
        }
        // Releasing a pending order's reservations must be atomic with cancellation.
        if (target === 'CANCELLED') {
          await this.stockReservation.releaseForOrder(tx, orderId, actorId);
        }
        if (target === 'DELIVERED') {
          const cod = await tx.payment.findFirst({
            where: { orderId, method: 'COD', status: 'PENDING' },
            select: { id: true },
          });
          if (cod) {
            if (!codCollected) {
              throw new ConflictException('Hãy xác nhận đã thu tiền COD.');
            }
            await tx.payment.update({
              where: { id: cod.id },
              data: { status: 'SUCCESS', processedAt: new Date() },
            });
          }
        }
        const changed = await tx.order.updateMany({
          where: { id: orderId, status: order.status },
          data:
            target === 'CANCELLED'
              ? {
                  status: target,
                  cancelledAt: new Date(),
                  cancelledReason: reason ?? 'Hủy bởi quản trị viên',
                }
              : { status: target },
        });
        if (changed.count !== 1)
          throw new ConflictException('Trạng thái đơn đã thay đổi.');
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: target,
            actorId,
            reason: reason ?? `Chuyển trạng thái ${order.status} -> ${target}`,
          },
        });
        await recordCustomerOrderNotice(tx, order, target);
        return { id: orderId, fromStatus: order.status, status: target };
      },
      {
        timeout: 30000,
        maxWait: 10000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
    if (target === 'CANCELLED') await this.changes.publishOrder(orderId);
    return result;
  }

  private serialize<
    T extends {
      items: Array<{
        inventoryId: bigint;
        unitPrice: Prisma.Decimal;
        discountAmount: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }>;
      subtotal: Prisma.Decimal;
      discountTotal: Prisma.Decimal;
      shippingFee: Prisma.Decimal;
      grandTotal: Prisma.Decimal;
    },
  >(order: T) {
    return {
      ...order,
      subtotal: order.subtotal.toFixed(2),
      discountTotal: order.discountTotal.toFixed(2),
      shippingFee: order.shippingFee.toFixed(2),
      grandTotal: order.grandTotal.toFixed(2),
      items: order.items.map(({ inventoryId, ...item }) => ({
        ...item,
        inventoryId: inventoryId.toString(),
        unitPrice: item.unitPrice.toFixed(2),
        discountAmount: item.discountAmount.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
    };
  }

  async listOwn(userId: string, query: CustomerOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = { userId, status: query.status };
    const limit = 8;
    const [total, rows] = await this.prisma.$transaction(
      [
        this.prisma.order.count({ where }),
        this.prisma.order.findMany({
          where,
          include: customerOrderInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * limit,
          take: limit,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: rows.map((order) => this.serializeCustomerOrder(order)),
      total,
      page: query.page,
      limit,
    };
  }

  async cancelOwn(userId: string, orderId: string) {
    await this.changeStatus(
      orderId,
      'CANCELLED',
      userId,
      'Khách hàng hủy đơn',
      async (tx) => {
        const owned = await tx.order.findFirst({
          where: { id: orderId, userId },
          select: { reservationExpiresAt: true, status: true },
        });
        if (!owned) throw new NotFoundException('Không tìm thấy đơn hàng.');
        if (
          owned.status === 'PENDING_PAYMENT' &&
          (owned.reservationExpiresAt?.getTime() ?? 0) <= Date.now()
        ) {
          throw new ConflictException('RESERVATION_EXPIRED');
        }
      },
    );
    return this.getOwn(userId, orderId);
  }

  async getOwn(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        ...customerOrderInclude,
        statusHistory: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            createdAt: true,
            reason: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return {
      ...this.serializeCustomerOrder(order),
      statusHistory: order.statusHistory.map((row) => ({
        ...row,
        id: row.id.toString(),
      })),
    };
  }

  private serializeCustomerOrder(order: CustomerOrderRow) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      createdAt: order.createdAt,
      reservationExpiresAt: order.reservationExpiresAt,
      cancelledReason: order.cancelledReason === 'EXPIRED' ? 'EXPIRED' : null,
      canCancel:
        order.status === 'PENDING_PAYMENT' &&
        (order.reservationExpiresAt?.getTime() ?? 0) > Date.now(),
      shippingRecipient: order.shippingRecipient,
      shippingPhone: order.shippingPhone,
      shippingAddress: order.shippingAddress,
      shippingRegion: order.shippingRegion,
      subtotal: order.subtotal.toFixed(2),
      discountTotal: order.discountTotal.toFixed(2),
      shippingFee: order.shippingFee.toFixed(2),
      grandTotal: order.grandTotal.toFixed(2),
      items: order.items.map(({ product, ...item }) => ({
        ...item,
        imageUrl: product.imageUrl,
        unitPrice: item.unitPrice.toFixed(2),
        discountAmount: item.discountAmount.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
      })),
      payment: order.payments[0]
        ? { ...order.payments[0], amount: order.payments[0].amount.toFixed(2) }
        : null,
    };
  }
}
