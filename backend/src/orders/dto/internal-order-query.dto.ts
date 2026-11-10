// Query string của "GET /internal/orders/:userId" (STT 29).
//
// - Mọi tham số query đến server ở dạng CHUỖI; ValidationPipe toàn cục không bật
//   enableImplicitConversion nên "limit" phải tự chuyển kiểu bằng @Type.
// - Chuỗi rỗng coi như không truyền.
// - Tham số lạ (ví dụ ?userId=...) bị từ chối 400 do forbidNonWhitelisted trong main.ts:
//   userId chỉ được đến từ path và phải khớp với JWT, không nhận thêm từ nơi khác.
// - orderCode / limit dùng cùng quy tắc với tool lookupOrder của chatbot để hai đường
//   tra cứu cho kết quả giống nhau.

import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export const INTERNAL_ORDERS_DEFAULT_LIMIT = 3;
export const INTERNAL_ORDERS_MAX_LIMIT = 5;
// Cùng định dạng mã đơn mà OrdersService.create sinh ra: "ORD-" + 20 ký tự HEX in hoa.
export const ORDER_CODE_PATTERN = /^ORD-[A-Z0-9]{4,28}$/;

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// Mã đơn khách gõ có thể thừa khoảng trắng / viết thường -> chuẩn hóa trước khi kiểm tra.
// "" -> undefined; chuỗi số -> number; giá trị khác giữ nguyên để IsInt từ chối.
// (Không dùng @Type(() => Number): nó đổi "" thành 0 trước khi Transform kịp chạy.)
const toNumber = ({ value }: { value: unknown }): unknown => {
  const v = emptyToUndefined({ value });
  return typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
};

const normalizeOrderCode = ({ value }: { value: unknown }): unknown => {
  const v = emptyToUndefined({ value });
  return typeof v === 'string' ? v.trim().toUpperCase() : v;
};

export class InternalOrderQueryDto {
  @IsOptional()
  @Transform(normalizeOrderCode)
  @Matches(ORDER_CODE_PATTERN, {
    message: 'orderCode không đúng định dạng mã đơn hàng.',
  })
  orderCode?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt({ message: 'limit phải là số nguyên.' })
  @Min(1)
  @Max(INTERNAL_ORDERS_MAX_LIMIT)
  limit?: number;
}
