import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OrderStatus, Prisma } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { InventoryChangeEmitter } from '../inventory/inventory-change-emitter.service';

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

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly stockReservation: StockReservationService,
    private readonly changes: InventoryChangeEmitter,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const { order, inventoryEvents } = await this.prisma.$transaction(
      async (tx) => {
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
            orderCode: `ORD-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`,
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
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: null,
            toStatus: 'PENDING_PAYMENT',
            actorId: userId,
            reason: 'Tạo đơn và giữ chỗ tồn kho',
          },
        });
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

  async getOwn(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    const { statusHistory, ...rest } = order;
    return {
      ...this.serialize(rest),
      statusHistory: statusHistory.map(({ id, ...row }) => ({
        ...row,
        id: id.toString(),
      })),
    };
  }
}
