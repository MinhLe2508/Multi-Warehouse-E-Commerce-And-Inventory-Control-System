// =============================================================================
// ChatbotToolsService (STT 27): thực thi các tool mà Claude yêu cầu gọi.
//
// Kiểm soát quyền truy cập ở TẦNG SERVER, không phụ thuộc vào LLM:
// 1. lookupOrder:
//    - Bắt buộc đăng nhập (ctx.userId do JwtStrategy xác minh). Khách vãng lai -> AUTH_REQUIRED.
//    - Câu truy vấn LUÔN có điều kiện WHERE user_id = ctx.userId.
//    - Mã đơn của người khác trả về NOT_FOUND (giống hệt đơn không tồn tại) để không lộ sự tồn tại.
//    - Không trả địa chỉ/số điện thoại giao hàng vào prompt (giảm PII gửi cho LLM).
// 2. checkInventory:
//    - CUSTOMER / khách vãng lai: chỉ sản phẩm đang bán, kho đang hoạt động; trả trạng thái
//      còn hàng theo khu vực + tổng số lượng có thể bán. Không lộ reservedStock, giá nhập, mã kho.
//    - ADMIN / WAREHOUSE_STAFF: thêm số liệu chi tiết từng kho (stock, reserved, available, ngưỡng).
//
// Ghi chú tích hợp: khi InternalOrderController (STT 29 - Huy) hoàn tất, có thể thay phần
// truy vấn Prisma trong lookupOrder bằng lời gọi service nội bộ đó; hợp đồng phân quyền giữ nguyên.
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CHATBOT_TOOL_NAMES,
  ChatbotToolName,
  LOOKUP_ORDER_MAX_LIMIT,
  TOOL_BROWSE_CATEGORY,
  TOOL_CHECK_INVENTORY,
  TOOL_LOOKUP_ORDER,
} from './chatbot-tools.definition';

// Người đang hỏi — luôn lấy từ request.user (JWT đã xác minh), không bao giờ từ LLM/body.
export interface ToolExecutionContext {
  userId?: string;
  role?: UserRole;
}

export type ToolErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'UNKNOWN_TOOL'
  | 'INTERNAL_ERROR';

export interface ToolErrorResult {
  ok: false;
  error: ToolErrorCode;
  message: string;
}

export interface ToolSuccessResult<T> {
  ok: true;
  data: T;
}

export type ToolResult<T = unknown> = ToolSuccessResult<T> | ToolErrorResult;

export type StockLevel = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

const ORDER_CODE_PATTERN = /^ORD-[A-Z0-9]{4,28}$/;
const KEYWORD_MAX_LENGTH = 100;
const DEFAULT_ORDER_LIMIT = 3;

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao hàng',
  DELIVERED: 'Đã giao hàng',
  CANCELLED: 'Đã hủy',
};

@Injectable()
export class ChatbotToolsService {
  private readonly logger = new Logger(ChatbotToolsService.name);

  constructor(private readonly prisma: PrismaService) {}

  isKnownTool(name: string): name is ChatbotToolName {
    return (CHATBOT_TOOL_NAMES as readonly string[]).includes(name);
  }

  /**
   * Điểm vào duy nhất để chạy tool. Không bao giờ ném lỗi ra ngoài:
   * mọi lỗi được chuyển thành ToolErrorResult để Claude trả lời fallback đúng mực.
   */
  async execute(
    name: string,
    rawInput: unknown,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult> {
    const input = this.asRecord(rawInput);
    try {
      switch (name) {
        case TOOL_LOOKUP_ORDER:
          return await this.lookupOrder(input, ctx);
        case TOOL_CHECK_INVENTORY:
          return await this.checkInventory(input, ctx);
        case TOOL_BROWSE_CATEGORY:
          return await this.browseCategory(input, ctx);
        default:
          return this.fail('UNKNOWN_TOOL', `Tool "${name}" không được hỗ trợ.`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi khi chạy tool ${name}: ${msg}`);
      return this.fail(
        'INTERNAL_ERROR',
        'Không truy xuất được dữ liệu lúc này.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // lookupOrder(userId) — userId lấy từ ctx, KHÔNG từ input của LLM
  // ---------------------------------------------------------------------------
  async lookupOrder(
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult> {
    if (!ctx.userId || !isUUID(ctx.userId)) {
      return this.fail(
        'AUTH_REQUIRED',
        'Người dùng chưa đăng nhập nên không thể tra cứu đơn hàng.',
      );
    }

    let orderCode: string | undefined;
    if (
      input.orderCode !== undefined &&
      input.orderCode !== null &&
      input.orderCode !== ''
    ) {
      if (typeof input.orderCode !== 'string') {
        return this.fail('INVALID_INPUT', 'orderCode phải là chuỗi.');
      }
      orderCode = input.orderCode.trim().toUpperCase();
      if (!ORDER_CODE_PATTERN.test(orderCode)) {
        return this.fail('INVALID_INPUT', 'Mã đơn hàng không đúng định dạng.');
      }
    }

    const limit = this.clampInt(
      input.limit,
      1,
      LOOKUP_ORDER_MAX_LIMIT,
      DEFAULT_ORDER_LIMIT,
    );

    // Điều kiện userId luôn có mặt -> không bao giờ đọc được đơn của người khác.
    const where: Prisma.OrderWhereInput = { userId: ctx.userId };
    if (orderCode) where.orderCode = orderCode;

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: orderCode ? 1 : limit,
      select: {
        orderCode: true,
        status: true,
        grandTotal: true,
        shippingFee: true,
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
            lineTotal: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { toStatus: true, createdAt: true },
        },
      },
    });

    if (orders.length === 0) {
      return this.fail(
        'NOT_FOUND',
        orderCode
          ? 'Không tìm thấy đơn hàng với mã này trong tài khoản của người dùng.'
          : 'Người dùng chưa có đơn hàng nào.',
      );
    }

    return {
      ok: true,
      data: {
        orders: orders.map((o) => ({
          orderCode: o.orderCode,
          status: o.status,
          statusLabel: STATUS_LABELS[o.status] ?? o.status,
          grandTotal: o.grandTotal.toFixed(2),
          shippingFee: o.shippingFee.toFixed(2),
          currency: o.currency,
          shippingRegion: o.shippingRegion,
          cancelledReason: o.cancelledReason,
          createdAt: o.createdAt.toISOString(),
          confirmedAt: o.confirmedAt?.toISOString() ?? null,
          cancelledAt: o.cancelledAt?.toISOString() ?? null,
          lastStatusChangeAt:
            o.statusHistory[0]?.createdAt.toISOString() ?? null,
          items: o.items.map((i) => ({
            productName: i.productName,
            sku: i.sku,
            quantity: i.quantity,
            lineTotal: i.lineTotal.toFixed(2),
          })),
        })),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // checkInventory(productId)
  // ---------------------------------------------------------------------------
  async checkInventory(
    input: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult> {
    const isStaff =
      ctx.role === UserRole.ADMIN || ctx.role === UserRole.WAREHOUSE_STAFF;

    const productId =
      typeof input.productId === 'string' ? input.productId.trim() : '';
    const keyword =
      typeof input.keyword === 'string' ? input.keyword.trim() : '';

    if (!productId && !keyword) {
      return this.fail('INVALID_INPUT', 'Cần productId hoặc keyword.');
    }
    if (productId && !isUUID(productId)) {
      return this.fail('INVALID_INPUT', 'productId phải là UUID hợp lệ.');
    }
    if (!productId && keyword.length > KEYWORD_MAX_LENGTH) {
      return this.fail('INVALID_INPUT', 'keyword quá dài.');
    }

    // Khách chỉ được thấy sản phẩm đang bán; nhân viên thấy cả sản phẩm đã ẩn.
    const productWhere: Prisma.ProductWhereInput = productId
      ? { id: productId }
      : {
          OR: [
            { sku: { equals: keyword, mode: 'insensitive' } },
            { name: { contains: keyword, mode: 'insensitive' } },
          ],
        };
    if (!isStaff) productWhere.isActive = true;

    const product = await this.prisma.product.findFirst({
      where: productWhere,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        sku: true,
        name: true,
        isActive: true,
        inventory: {
          where: isStaff ? {} : { warehouse: { isActive: true } },
          select: {
            stock: true,
            reservedStock: true,
            availableStock: true,
            threshold: true,
            warehouse: {
              select: {
                code: true,
                name: true,
                region: true,
                isActive: true,
                defaultLowStockThreshold: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      return this.fail('NOT_FOUND', 'Không tìm thấy sản phẩm phù hợp.');
    }

    const rows = product.inventory.map((inv) => {
      const threshold = inv.threshold ?? inv.warehouse.defaultLowStockThreshold;
      const available = Math.max(0, inv.availableStock);
      return {
        inv,
        threshold,
        available,
        level: this.stockLevel(available, threshold),
      };
    });
    const totalAvailable = rows.reduce((sum, r) => sum + r.available, 0);

    const base = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      totalAvailable,
      overallStatus: totalAvailable > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
    };

    if (!isStaff) {
      // Gộp theo khu vực: khách chỉ cần biết khu vực nào còn hàng.
      const byRegion = new Map<string, number>();
      for (const r of rows) {
        byRegion.set(
          r.inv.warehouse.region,
          (byRegion.get(r.inv.warehouse.region) ?? 0) + r.available,
        );
      }
      return {
        ok: true,
        data: {
          ...base,
          regions: [...byRegion.entries()].map(([region, available]) => ({
            region,
            status: available > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
          })),
        },
      };
    }

    return {
      ok: true,
      data: {
        ...base,
        productIsActive: product.isActive,
        warehouses: rows.map((r) => ({
          warehouseCode: r.inv.warehouse.code,
          warehouseName: r.inv.warehouse.name,
          region: r.inv.warehouse.region,
          warehouseIsActive: r.inv.warehouse.isActive,
          stock: r.inv.stock,
          reservedStock: r.inv.reservedStock,
          availableStock: r.available,
          lowStockThreshold: r.threshold,
          level: r.level,
        })),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // browseCategory(categoryName, limit)
  // ---------------------------------------------------------------------------
  async browseCategory(
    input: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ctx: ToolExecutionContext,
  ): Promise<ToolResult> {
    const rawCategory =
      typeof input.categoryName === 'string'
        ? input.categoryName.trim()
        : typeof input.keyword === 'string'
          ? input.keyword.trim()
          : '';

    const limit = this.clampInt(input.limit, 1, 10, 5);

    // Chuẩn hóa tìm danh mục
    let category = null;
    if (rawCategory) {
      category = await this.prisma.category.findFirst({
        where: {
          isActive: true,
          OR: [
            { name: { contains: rawCategory, mode: 'insensitive' } },
            {
              slug: {
                contains: rawCategory.toLowerCase().replace(/\s+/g, '-'),
                mode: 'insensitive',
              },
            },
          ],
        },
      });
    }

    // Nếu không tìm thấy category cụ thể theo chuỗi, thử tìm từ khóa tách biệt (ví dụ "đeo", "thông minh", "điện thoại")
    if (!category && rawCategory) {
      const words = rawCategory.split(/\s+/).filter((w) => w.length >= 3);
      for (const w of words) {
        category = await this.prisma.category.findFirst({
          where: {
            isActive: true,
            name: { contains: w, mode: 'insensitive' },
          },
        });
        if (category) break;
      }
    }

    const whereProduct: Prisma.ProductWhereInput = {
      isActive: true,
    };
    if (category) {
      whereProduct.categoryId = category.id;
    } else if (rawCategory) {
      whereProduct.OR = [
        { name: { contains: rawCategory, mode: 'insensitive' } },
        { description: { contains: rawCategory, mode: 'insensitive' } },
      ];
    }

    const products = await this.prisma.product.findMany({
      where: whereProduct,
      take: limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        sku: true,
        name: true,
        basePrice: true,
        discountPercent: true,
        category: { select: { name: true } },
        inventory: {
          where: { warehouse: { isActive: true } },
          select: { availableStock: true },
        },
      },
    });

    if (products.length === 0) {
      return this.fail(
        'NOT_FOUND',
        `Không tìm thấy sản phẩm nào trong danh mục "${rawCategory}".`,
      );
    }

    return {
      ok: true,
      data: {
        categoryName: category
          ? category.name
          : rawCategory || 'Tất cả danh mục',
        totalProductsFound: products.length,
        products: products.map((p) => {
          const totalAvailable = p.inventory.reduce(
            (sum, inv) => sum + inv.availableStock,
            0,
          );
          const price = Number(p.basePrice);
          return {
            name: p.name,
            sku: p.sku,
            basePrice: price,
            formattedPrice:
              new Intl.NumberFormat('vi-VN').format(price) + ' đ',
            discountPercent: Number(p.discountPercent),
            totalAvailable,
            status: totalAvailable > 0 ? 'Còn hàng' : 'Tạm hết hàng',
            categoryName: p.category?.name ?? 'Khác',
          };
        }),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private stockLevel(available: number, threshold: number): StockLevel {
    if (available <= 0) return 'OUT_OF_STOCK';
    if (available <= threshold) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  private clampInt(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
  ): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private fail(error: ToolErrorCode, message: string): ToolErrorResult {
    return { ok: false, error, message };
  }
}
