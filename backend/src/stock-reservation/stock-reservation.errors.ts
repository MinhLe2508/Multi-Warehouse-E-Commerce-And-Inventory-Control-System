import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

/**
  Các lỗi nghiệp vụ của giữ chỗ tồn kho, ánh xạ theo contract
  (docs/api/stock-reservation-contract.md mục 7 và openapi.yaml).
  Mỗi lỗi mang thêm trường `code` ổn định cho Frontend.

  LƯU Ý: lỗi ném ra từ bên trong prisma.$transaction() sẽ rollback toàn bộ
  transaction của caller. Caller KHÔNG được bắt rồi nuốt lỗi và tiếp tục ghi,
  vì sau lỗi SQL PostgreSQL đã đánh dấu transaction là aborted.
 */

export class ReservationValidationException extends BadRequestException {
  constructor(message: string) {
    super({
      statusCode: 400,
      error: 'Bad Request',
      code: 'VALIDATION_ERROR',
      message,
    });
  }
}

// 409 INSUFFICIENT_STOCK - SQL fn_reserve_stock báo không đủ hàng (SQLSTATE 23514).
export class InsufficientStockException extends ConflictException {
  constructor(readonly inventoryId: bigint) {
    super({
      statusCode: 409,
      error: 'Conflict',
      code: 'INSUFFICIENT_STOCK',
      message: 'Không đủ hàng tồn kho để giữ chỗ.',
      inventoryId: inventoryId.toString(),
    });
  }
}

// 404 INVENTORY_NOT_FOUND - SQL fn_reserve_stock báo thiếu dòng inventory (SQLSTATE P0002).
export class InventoryNotFoundException extends NotFoundException {
  constructor(readonly inventoryId: bigint) {
    super({
      statusCode: 404,
      error: 'Not Found',
      code: 'INVENTORY_NOT_FOUND',
      message: 'Không tìm thấy dòng tồn kho.',
      inventoryId: inventoryId.toString(),
    });
  }
}

// 409 RESERVATION_EXPIRED - giữ chỗ đã quá hạn, không được commit/hủy như giữ chỗ còn hiệu lực.
export class ReservationExpiredException extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      error: 'Conflict',
      code: 'RESERVATION_EXPIRED',
      message: 'Giữ chỗ của đơn hàng đã hết hạn.',
    });
  }
}

// 409 cho các xung đột trạng thái khác (INVALID_RESERVATION_STATE, ...).
export class ReservationConflictException extends ConflictException {
  constructor(code: string, message: string) {
    super({ statusCode: 409, error: 'Conflict', code, message });
  }
}

export class ReservationNotFoundException extends NotFoundException {
  constructor(
    code: 'ORDER_NOT_FOUND' | 'RESERVATION_NOT_FOUND',
    message: string,
  ) {
    super({ statusCode: 404, error: 'Not Found', code, message });
  }
}
