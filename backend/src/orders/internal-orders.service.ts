// =============================================================================
// InternalOrdersService (STT 29): tra cứu đơn hàng cho Chatbot (FR-BOT-03).
//
// Bất biến bảo mật:
// 1. Truy vấn LUÔN có điều kiện userId = tham số userId của hàm. Hàm này không tự biết
//    "ai đang hỏi"; caller (controller / chatbot tool) phải truyền userId lấy từ JWT đã
//    xác minh, không bao giờ từ body/query/LLM.
// 2. Mã đơn của người khác -> NotFoundException giống hệt đơn không tồn tại (không lộ sự tồn tại).
// 3. Chỉ chọn (select) các cột cần cho việc trả lời. KHÔNG trả tên/số điện thoại/địa chỉ
//    người nhận, inventoryId, warehouseId, actorId, ghi chú nội bộ của lịch sử trạng thái.
//    Danh sách cột là allow-list: thêm cột vào schema sẽ không tự lọt ra API này.
// 4. Chỉ đọc, không ghi, không khóa dòng.
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INTERNAL_ORDERS_DEFAULT_LIMIT,
  INTERNAL_ORDERS_MAX_LIMIT,
} from './dto/internal-order-query.dto';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao hàng',
  DELIVERED: 'Đã giao hàng',
  CANCELLED: 'Đã hủy',
};

// Số mốc lịch sử trạng thái tối đa cho mỗi đơn (tránh đổ quá nhiều token vào prompt).
const HISTORY_LIMIT = 10;

const orderSelect = {
  orderCode: true,
  status: true,
  subtotal: true,
  discountTotal: true,
  shippingFee: true,
  grandTotal: true,
  currency: true,
  shippingRegion: true,
  cancelledReason: true,
  createdAt: true,
  confirmedAt: true,
  cancelledAt: true,
  items: {
    select: {
      productName: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      discountAmount: true,
      lineTotal: true,
    },
  },
  statusHistory: {
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
    select: { fromStatus: true, toStatus: true, createdAt: true },
  },
} satisfies Prisma.OrderSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

export interface InternalOrdersQuery {
  orderCode?: string;
  limit?: number;
}

@Injectable()
export class InternalOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đơn của CHÍNH userId này, mới nhất trước.
   * - Có orderCode: trả đúng 1 đơn, hoặc 404 nếu không phải đơn của userId.
   * - Không có orderCode: tối đa `limit` đơn gần nhất; chưa có đơn nào -> { orders: [] }.
   */
  async findForUser(userId: string, query: InternalOrdersQuery = {}) {
    const where: Prisma.OrderWhereInput = { userId };
    const orderCode = query.orderCode?.trim().toUpperCase();
    if (orderCode) where.orderCode = orderCode;

    const limit = this.clampLimit(query.limit);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: orderCode ? 1 : limit,
      select: orderSelect,
    });

    if (orderCode && rows.length === 0) {
      throw new NotFoundException(
        'Không tìm thấy đơn hàng với mã này trong tài khoản của bạn.',
      );
    }

    return { orders: rows.map((row) => this.serialize(row)) };
  }

  private clampLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) {
      return INTERNAL_ORDERS_DEFAULT_LIMIT;
    }
    return Math.min(INTERNAL_ORDERS_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
  }

  private serialize(o: OrderRow) {
    return {
      orderCode: o.orderCode,
      status: o.status,
      statusLabel: ORDER_STATUS_LABELS[o.status] ?? o.status,
      subtotal: o.subtotal.toFixed(2),
      discountTotal: o.discountTotal.toFixed(2),
      shippingFee: o.shippingFee.toFixed(2),
      grandTotal: o.grandTotal.toFixed(2),
      currency: o.currency,
      shippingRegion: o.shippingRegion,
      cancelledReason: o.cancelledReason,
      createdAt: o.createdAt.toISOString(),
      confirmedAt: o.confirmedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      lastStatusChangeAt: o.statusHistory[0]?.createdAt.toISOString() ?? null,
      items: o.items.map((i) => ({
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toFixed(2),
        discountAmount: i.discountAmount.toFixed(2),
        lineTotal: i.lineTotal.toFixed(2),
      })),
      statusHistory: o.statusHistory.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        at: h.createdAt.toISOString(),
      })),
    };
  }
}
