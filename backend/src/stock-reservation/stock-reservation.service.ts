import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { ReservationStatus } from '@prisma/client';
import { isUUID } from 'class-validator';
import { InventoryStockPort } from './inventory-stock.port';
import { ReservationRepository } from './reservation.repository';
import {
  ReservationConflictException,
  ReservationExpiredException,
  ReservationNotFoundException,
  ReservationValidationException,
} from './stock-reservation.errors';
import {
  MAX_BIGINT,
  RESERVATION_TTL_MINUTES,
  type ReservationAllocation,
  type ReservationRecord,
  type ReservedItem,
  type StockSettleReason,
  type TransactionClient,
} from './stock-reservation.types';

type TerminalStatus = Exclude<ReservationStatus, 'HOLDING'>;

const TARGET_STATUS: Record<StockSettleReason, TerminalStatus> = {
  COMMIT: 'COMMITTED',
  RELEASE: 'RELEASED',
  EXPIRE: 'EXPIRED',
};

const byBigInt = (a: bigint, b: bigint): number => (a < b ? -1 : a > b ? 1 : 0);

/**
  StockReservationService - giữ chỗ 2 pha có TTL 15 phút (NT-02):
    HOLDING -> COMMITTED | RELEASED | EXPIRED
  Giữ chỗ chỉ tăng reserved_stock; stock chỉ bị trừ khi COMMIT (thanh toán thành công).

  QUY TẮC BẮT BUỘC KHI TẠO ĐƠN (đã kiểm chứng trên PostgreSQL thật):
    Gọi lockInventories() NGAY ĐẦU transaction, TRƯỚC khi INSERT order_items.
    order_items có khóa ngoại tới inventory nên INSERT nó lấy khóa FOR KEY SHARE trên dòng
    inventory; fn_reserve_stock lại cần FOR UPDATE. Nếu hai đơn cùng mua một sản phẩm mà
    đã INSERT order_items rồi mới giữ chỗ, mỗi bên giữ KEY SHARE và cùng chờ nâng lên
    FOR UPDATE -> PostgreSQL báo "deadlock detected" (40P01) và hủy một bên.
    Khóa trước còn cho phép OrdersService đọc availableStock CHÍNH XÁC để phân bổ kho.

  Quy ước (docs/api/stock-reservation-contract.md):
  - Mọi hàm nhận `tx` của caller, chạy trong transaction đó, KHÔNG tự mở transaction.
  - Thứ tự khóa mọi luồng: Order -> Inventory (id tăng dần) -> Reservation (id tăng dần).
  - Không viết lại thuật toán giữ chỗ: việc kiểm tra tồn dưới khóa do fn_reserve_stock() làm.
  - Hết hạn được quyết định bằng GIỜ CỦA DATABASE sau khi đã có khóa (không dùng giờ app).
  - Gọi lại thao tác đã hoàn tất với cùng ý nghĩa là no-op (không trừ kho / ghi audit lần 2).
  - Service này KHÔNG đổi trạng thái đơn, KHÔNG ghi order_status_history, KHÔNG xử lý payment:
    đó là việc của OrdersService / PaymentsService trong cùng transaction.
 */
@Injectable()
export class StockReservationService {
  private readonly logger = new Logger(StockReservationService.name);

  constructor(
    private readonly inventory: InventoryStockPort,
    private readonly repository: ReservationRepository,
  ) {}

  /**
    Khóa các dòng inventory (FOR UPDATE, inventoryId TĂNG DẦN theo số) cho một đơn sắp tạo.
    PHẢI gọi trước khi INSERT order_items và trước reserveForOrder (xem quy tắc ở đầu lớp).
    Khóa được giữ đến khi transaction kết thúc; gọi lại với cùng id là vô hại.
   */
  async lockInventories(
    tx: TransactionClient,
    inventoryIds: bigint[],
  ): Promise<void> {
    if (!Array.isArray(inventoryIds) || inventoryIds.length === 0) {
      throw new ReservationValidationException(
        'Danh sách inventoryId cần khóa không được rỗng.',
      );
    }
    for (const id of inventoryIds) {
      if (typeof id !== 'bigint' || id <= 0n || id > MAX_BIGINT) {
        throw new ReservationValidationException(
          'inventoryId phải là bigint dương trong khoảng BIGINT.',
        );
      }
    }
    const sorted = [...new Set(inventoryIds)].sort(byBigInt);
    await this.inventory.lockInventories(tx, sorted);
  }

  /**
    Giữ chỗ toàn bộ allocations của một đơn PENDING_PAYMENT vừa tạo trong `tx`.
    Tiền điều kiện: đã gọi lockInventories() cho các inventory này ở đầu transaction.
    Mỗi allocation = một OrderItem + một dòng inventory + một reservation.
    Ném InsufficientStockException (409) nếu bất kỳ dòng nào thiếu hàng; caller phải để
    lỗi thoát ra khỏi transaction để rollback cả Order/Items/Reservations/Audit.
   */
  async reserveForOrder(
    tx: TransactionClient,
    orderId: string,
    allocations: ReservationAllocation[],
    actorId: string,
  ): Promise<ReservedItem[]> {
    this.assertUuid(orderId, 'orderId');
    this.assertUuid(actorId, 'actorId');
    const plan = this.planAllocations(allocations);

    const order = await this.repository.lockOrder(tx, orderId);
    if (!order) {
      throw new ReservationNotFoundException(
        'ORDER_NOT_FOUND',
        'Không tìm thấy đơn hàng để giữ chỗ.',
      );
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ReservationConflictException(
        'INVALID_ORDER_STATE',
        'Chỉ đơn PENDING_PAYMENT mới được giữ chỗ tồn kho.',
      );
    }

    // fn_reserve_stock KHÔNG idempotent: gọi lại sẽ giữ thêm lần nữa. Chặn từ đầu.
    const existing = await this.repository.getReservations(tx, orderId);
    if (existing.length > 0) {
      throw new ReservationConflictException(
        'RESERVATION_ALREADY_EXISTS',
        'Đơn hàng này đã có giữ chỗ.',
      );
    }

    await this.assertMatchesOrderItems(tx, orderId, allocations);

    // Tuần tự theo inventoryId TĂNG DẦN (theo số, không theo chuỗi) để chống deadlock.
    // Tuyệt đối không dùng Promise.all cho các truy vấn khóa.
    const reserved = new Map<number, ReservedItem>();
    for (const { allocation, index } of plan) {
      const reservationId = await this.inventory.reserve(tx, {
        inventoryId: allocation.inventoryId,
        orderId,
        quantity: allocation.quantity,
        ttlMinutes: RESERVATION_TTL_MINUTES,
        actorId,
      });
      const row = await this.repository.linkReservation(
        tx,
        reservationId,
        allocation.orderItemId,
      );
      reserved.set(index, {
        reservationId: row.id,
        orderItemId: allocation.orderItemId,
        inventoryId: row.inventoryId,
        quantity: row.quantity,
        expiresAt: row.expiresAt,
      });
    }

    const items = allocations.map((_, index) => reserved.get(index)!);

    // Hạn chung của đơn = hạn sớm nhất. Trong cùng transaction với cùng TTL, NOW() của SQL
    // cho mọi reservation cùng một mốc; nếu khác nhau là điểm cần điều tra.
    const earliest = items.reduce(
      (min, item) => (item.expiresAt < min ? item.expiresAt : min),
      items[0].expiresAt,
    );
    if (items.some((item) => item.expiresAt.getTime() !== earliest.getTime())) {
      this.logger.warn(
        `Đơn ${orderId} có reservation với hạn khác nhau; dùng hạn sớm nhất.`,
      );
    }
    await this.repository.setOrderReservationExpiry(tx, orderId, earliest);

    // Transaction kéo dài (chờ khóa) có thể đã ăn hết TTL: không trả đơn "giữ chỗ thành công"
    // khi hạn đã qua. Rollback bằng cách ném lỗi.
    const now = await this.repository.now(tx);
    if (earliest.getTime() <= now.getTime()) {
      throw new ReservationExpiredException();
    }

    return items;
  }

  // HOLDING còn hạn -> COMMITTED: stock -= q và reserved_stock -= q (thanh toán thành công).
  async commitForOrder(
    tx: TransactionClient,
    orderId: string,
    actorId: string | null,
  ): Promise<void> {
    await this.settleOrder(tx, orderId, actorId, 'COMMIT');
  }

  // HOLDING còn hạn -> RELEASED: reserved_stock -= q (khách hủy đơn).
  async releaseForOrder(
    tx: TransactionClient,
    orderId: string,
    actorId: string | null,
  ): Promise<void> {
    await this.settleOrder(tx, orderId, actorId, 'RELEASE');
  }

  // HOLDING đã quá hạn -> EXPIRED: reserved_stock -= q (cleanup job; actor = hệ thống).
  async expireForOrder(tx: TransactionClient, orderId: string): Promise<void> {
    await this.settleOrder(tx, orderId, null, 'EXPIRE');
  }

  private async settleOrder(
    tx: TransactionClient,
    orderId: string,
    actorId: string | null,
    reason: StockSettleReason,
  ): Promise<void> {
    this.assertUuid(orderId, 'orderId');
    if (actorId !== null) this.assertUuid(actorId, 'actorId');
    const target = TARGET_STATUS[reason];

    // 1) Order (lấy lại khóa là vô hại nếu caller đã giữ).
    const order = await this.repository.lockOrder(tx, orderId);
    if (!order) {
      throw new ReservationNotFoundException(
        'ORDER_NOT_FOUND',
        'Không tìm thấy đơn hàng.',
      );
    }

    // 2) Inventory tăng dần. Cần biết các inventory liên quan trước khi khóa chúng.
    const preview = await this.repository.getReservations(tx, orderId);
    if (preview.length === 0) {
      throw new ReservationNotFoundException(
        'RESERVATION_NOT_FOUND',
        'Đơn hàng chưa có giữ chỗ nào.',
      );
    }
    const inventoryIds = [...new Set(preview.map((r) => r.inventoryId))].sort(
      byBigInt,
    );
    await this.inventory.lockInventories(tx, inventoryIds);

    // 3) Reservation tăng dần; từ đây chỉ tin dữ liệu đọc dưới khóa.
    const reservations = await this.repository.lockReservations(tx, orderId);
    const holding = reservations.filter((r) => r.status === 'HOLDING');

    // Trạng thái terminal KHÁC ý nghĩa phải báo xung đột, không tự trừ/hoàn tiếp.
    if (
      reservations.some((r) => r.status !== 'HOLDING' && r.status !== target)
    ) {
      throw new ReservationConflictException(
        'INVALID_RESERVATION_STATE',
        `Giữ chỗ của đơn đang ở trạng thái không cho phép ${reason}.`,
      );
    }
    // Đã hoàn tất cùng ý nghĩa từ trước: no-op (idempotent).
    if (holding.length === 0) return;
    if (holding.length !== reservations.length) {
      this.logger.warn(
        `Đơn ${orderId} có giữ chỗ ở trạng thái hỗn hợp khi ${reason}; chỉ xử lý phần HOLDING.`,
      );
    }

    // Hết hạn tính bằng giờ DB SAU khi đã có khóa.
    const now = await this.repository.now(tx);
    const expired = holding.filter(
      (r) => r.expiresAt.getTime() <= now.getTime(),
    );

    let toSettle: ReservationRecord[];
    if (reason === 'EXPIRE') {
      if (expired.length === 0) {
        throw new ReservationConflictException(
          'RESERVATION_NOT_EXPIRED',
          'Giữ chỗ của đơn chưa hết hạn nên không thể expire.',
        );
      }
      toSettle = expired;
    } else {
      // COMMIT/RELEASE chỉ hợp lệ trên giữ chỗ còn hạn. Quá hạn thì caller dùng expire.
      if (expired.length > 0) throw new ReservationExpiredException();
      toSettle = holding;
    }

    // Gộp quantity theo inventory; cập nhật theo inventoryId tăng dần.
    const totals = new Map<bigint, number>();
    for (const r of toSettle) {
      totals.set(r.inventoryId, (totals.get(r.inventoryId) ?? 0) + r.quantity);
    }
    const changes = [...totals.entries()]
      .sort(([a], [b]) => byBigInt(a, b))
      .map(([inventoryId, quantity]) => ({ inventoryId, quantity }));

    await this.inventory.settle(tx, { orderId, actorId, reason, changes });

    const updated = await this.repository.markReservations(
      tx,
      toSettle.map((r) => r.id),
      target,
      now,
    );
    if (updated !== toSettle.length) {
      // Dưới khóa mà vẫn lệch là vi phạm bất biến nội bộ: rollback toàn bộ.
      throw new InternalServerErrorException(
        `Số reservation cập nhật (${updated}) khác dự kiến (${toSettle.length}).`,
      );
    }
  }

  // Validate trước khi chạm DB. Trả về kế hoạch đã sắp theo inventoryId tăng dần.
  private planAllocations(allocations: ReservationAllocation[]) {
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new ReservationValidationException(
        'Danh sách phân bổ giữ chỗ không được rỗng.',
      );
    }

    const seenInventory = new Set<bigint>();
    const seenItem = new Set<string>();
    allocations.forEach((a, i) => {
      const label = `allocations[${i}]`;
      this.assertUuid(a.orderItemId, `${label}.orderItemId`);
      if (typeof a.inventoryId !== 'bigint') {
        throw new ReservationValidationException(
          `${label}.inventoryId phải là bigint.`,
        );
      }
      if (a.inventoryId <= 0n || a.inventoryId > MAX_BIGINT) {
        throw new ReservationValidationException(
          `${label}.inventoryId nằm ngoài khoảng BIGINT dương.`,
        );
      }
      if (
        typeof a.quantity !== 'number' ||
        !Number.isInteger(a.quantity) ||
        a.quantity < 1 ||
        a.quantity > 2147483647
      ) {
        throw new ReservationValidationException(
          `${label}.quantity phải là số nguyên dương.`,
        );
      }
      // Bản 0.1: không cho hai allocation cùng inventory (hoặc cùng OrderItem) trong một đơn.
      if (seenInventory.has(a.inventoryId) || seenItem.has(a.orderItemId)) {
        throw new ReservationValidationException(
          `${label} bị trùng inventoryId hoặc orderItemId trong cùng đơn.`,
        );
      }
      seenInventory.add(a.inventoryId);
      seenItem.add(a.orderItemId);
    });

    return allocations
      .map((allocation, index) => ({ allocation, index }))
      .sort((x, y) =>
        byBigInt(x.allocation.inventoryId, y.allocation.inventoryId),
      );
  }

  // Mỗi allocation phải khớp đúng một OrderItem của đơn (cùng inventory và số lượng).
  private async assertMatchesOrderItems(
    tx: TransactionClient,
    orderId: string,
    allocations: ReservationAllocation[],
  ): Promise<void> {
    const items = await this.repository.findOrderItems(
      tx,
      orderId,
      allocations.map((a) => a.orderItemId),
    );
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const a of allocations) {
      const item = byId.get(a.orderItemId);
      if (
        !item ||
        item.inventoryId !== a.inventoryId ||
        item.quantity !== a.quantity
      ) {
        // Lỗi điều phối nội bộ (không phải lỗi của khách) -> 500, rollback.
        throw new InternalServerErrorException(
          `Allocation cho orderItem ${a.orderItemId} không khớp OrderItem của đơn ${orderId}.`,
        );
      }
    }
  }

  private assertUuid(value: unknown, field: string): void {
    if (typeof value !== 'string' || !isUUID(value)) {
      throw new ReservationValidationException(`${field} phải là UUID hợp lệ.`);
    }
  }
}
