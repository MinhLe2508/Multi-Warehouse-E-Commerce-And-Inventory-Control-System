import type { ReservationStatus } from '@prisma/client';
import type {
  LockedOrder,
  OrderItemRef,
  ReservationRecord,
  TransactionClient,
} from './stock-reservation.types';

/**
  Cổng truy cập dữ liệu phía ORDER / RESERVATION của StockReservationService.
  Tách riêng để service có thể unit test bằng bộ nhớ (không cần DB), còn
  integration test chạy cùng service với bản Prisma thật.
 */
export abstract class ReservationRepository {
  // SELECT ... FROM orders WHERE id = $1 FOR UPDATE. Trả null nếu không có đơn.
  abstract lockOrder(
    tx: TransactionClient,
    orderId: string,
  ): Promise<LockedOrder | null>;

  // Giờ của DATABASE (clock_timestamp()), không dùng giờ của máy chạy backend.
  abstract now(tx: TransactionClient): Promise<Date>;

  abstract findOrderItems(
    tx: TransactionClient,
    orderId: string,
    orderItemIds: string[],
  ): Promise<OrderItemRef[]>;

  // Đọc không khóa; sắp theo inventoryId, id tăng dần.
  abstract getReservations(
    tx: TransactionClient,
    orderId: string,
  ): Promise<ReservationRecord[]>;

  // SELECT ... ORDER BY id FOR UPDATE; trả dữ liệu mới nhất dưới khóa.
  abstract lockReservations(
    tx: TransactionClient,
    orderId: string,
  ): Promise<ReservationRecord[]>;

  abstract linkReservation(
    tx: TransactionClient,
    reservationId: bigint,
    orderItemId: string,
  ): Promise<ReservationRecord>;

  abstract setOrderReservationExpiry(
    tx: TransactionClient,
    orderId: string,
    expiresAt: Date,
  ): Promise<void>;

  /**
    Chuyển các reservation đang HOLDING sang trạng thái terminal và đặt
    committedAt (COMMITTED) hoặc releasedAt (RELEASED/EXPIRED) = `at`.
    Trả về số dòng thực sự được cập nhật.
   */
  abstract markReservations(
    tx: TransactionClient,
    reservationIds: bigint[],
    to: Exclude<ReservationStatus, 'HOLDING'>,
    at: Date,
  ): Promise<number>;
}
