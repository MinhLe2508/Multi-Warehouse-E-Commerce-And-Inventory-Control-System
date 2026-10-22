import type { OrderStatus, Prisma, ReservationStatus } from '@prisma/client';

// Kiểu `tx` thực tế của Prisma ($transaction interactive). Do CALLER (OrdersService /
// PaymentsService / ReservationCleanupJob) mở và truyền vào; các service ở đây
// KHÔNG tự mở transaction mới và KHÔNG ghi bằng PrismaClient gốc.
export type TransactionClient = Prisma.TransactionClient;

// TTL giữ chỗ cố định 15 phút theo contract; khách không được truyền tùy ý.
export const RESERVATION_TTL_MINUTES = 15;

// BIGINT dương lớn nhất của PostgreSQL (inventory.id, stock_reservations.id).
export const MAX_BIGINT = 9223372036854775807n;

// Một phần phân bổ: 1 OrderItem <-> 1 dòng inventory <-> 1 reservation.
export interface ReservationAllocation {
  orderItemId: string; // UUID
  inventoryId: bigint; // BIGINT, tuyệt đối không Number(bigint)
  quantity: number;
}

export interface ReservedItem {
  reservationId: bigint;
  orderItemId: string;
  inventoryId: bigint;
  quantity: number;
  expiresAt: Date;
}

export interface ReservationRecord {
  id: bigint;
  orderId: string;
  orderItemId: string | null;
  inventoryId: bigint;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
}

export interface OrderItemRef {
  id: string;
  inventoryId: bigint;
  quantity: number;
}

export interface LockedOrder {
  id: string;
  status: OrderStatus;
}

// Lý do ghi vào inventory_audit_log khi chốt một giữ chỗ.
export type StockSettleReason = 'COMMIT' | 'RELEASE' | 'EXPIRE';

export interface ReserveStockInput {
  inventoryId: bigint;
  orderId: string;
  quantity: number;
  ttlMinutes: number;
  actorId: string | null;
}

export interface SettleStockInput {
  orderId: string;
  // null = hệ thống (cleanup job, callback thanh toán).
  actorId: string | null;
  reason: StockSettleReason;
  // Đã gộp quantity theo inventory và sắp theo inventoryId tăng dần.
  changes: Array<{ inventoryId: bigint; quantity: number }>;
}
