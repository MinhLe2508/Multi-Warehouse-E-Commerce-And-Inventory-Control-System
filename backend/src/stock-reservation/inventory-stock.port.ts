import type {
  ReserveStockInput,
  SettleStockInput,
  TransactionClient,
} from './stock-reservation.types';

/**
  Cổng phía INVENTORY (wrapper mà contract giao cho InventoryService của Khang).

  StockReservationService chỉ phụ thuộc vào lớp trừu tượng này, nên khi
  InventoryService (STT 13) hoàn thành, chỉ cần đổi provider trong
  StockReservationModule để trỏ sang nó mà không sửa StockReservationService.
  Bản mặc định hiện tại: PrismaInventoryStockAdapter.

  Mọi phương thức chạy trên `tx` của caller và không mở transaction mới.
 */
export abstract class InventoryStockPort {
  /**
    Giữ chỗ 1 dòng inventory qua SQL fn_reserve_stock() và ghi audit RESERVE.
    Trả về stock_reservations.id. Ném InsufficientStockException (409) khi
    không đủ hàng, InventoryNotFoundException (404) khi thiếu inventory.
   */
  abstract reserve(
    tx: TransactionClient,
    input: ReserveStockInput,
  ): Promise<bigint>;

  // Khóa các dòng inventory theo thứ tự id TĂNG DẦN (SELECT ... FOR UPDATE).
  abstract lockInventories(
    tx: TransactionClient,
    inventoryIds: bigint[],
  ): Promise<void>;

  /**
    Chốt giữ chỗ lên tồn kho trong CÙNG MỘT câu UPDATE cho mỗi inventory:
      COMMIT : stock -= q, reserved_stock -= q
      RELEASE / EXPIRE : reserved_stock -= q (stock giữ nguyên)
    và ghi inventory_audit_log tương ứng.
   */
  abstract settle(
    tx: TransactionClient,
    input: SettleStockInput,
  ): Promise<void>;
}
