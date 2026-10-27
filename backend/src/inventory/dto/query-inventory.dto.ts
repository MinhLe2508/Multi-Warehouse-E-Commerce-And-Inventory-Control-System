// =============================================================================
// Các DTO cho tham số truy vấn (query string) của 2 Endpoint đọc:
//   - QueryInventoryDto   : "GET /inventory"        — danh sách tồn kho có lọc, phân trang.
//   - QueryStockAlertsDto : "GET /inventory/alerts" — danh sách cảnh báo tồn kho thấp.
// Hai class nằm chung một file vì cùng là "tham số lọc + phân trang" của module inventory và dùng chung quy tắc phân trang.
//
// Lưu ý về QUERY STRING:
// - Mọi tham số truy vấn đến Server ở dạng CHUỖI. ValidationPipe toàn cục chỉ có
//   "transform: true" (không bật enableImplicitConversion) nên mỗi trường số /
//   boolean phải tự chuyển kiểu bằng @Type / @Transform, nếu không IsInt / IsBoolean sẽ từ chối giá trị hợp lệ như "20" hoặc "true".
// - Chuỗi rỗng ("?productId=") được coi như KHÔNG truyền tham số đó.
// - Tham số lạ bị từ chối (forbidNonWhitelisted: true trong main.ts) với HTTP 400.
// - Phân trang dùng limit/offset, cùng kiểu với NotificationQueryDto của module Notifications để Frontend dùng thống nhất.
// =============================================================================

import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsUUID, Max, Min, } from 'class-validator';

// Giá trị mặc định và trần của phân trang.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Danh sách các trạng thái cảnh báo được phép lọc ("ALL" = không lọc theo trạng thái).
export const ALERT_STATUS_FILTERS = ['OPEN', 'RESOLVED', 'ALL'] as const;
export type AlertStatusFilter = (typeof ALERT_STATUS_FILTERS)[number];

// Chuỗi rỗng -> undefined (coi như không truyền); giá trị khác giữ nguyên.
const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// "true"/"false" (chuỗi) -> boolean; giá trị khác giữ nguyên để IsBoolean từ chối.
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

export class QueryInventoryDto {
  // Chỉ lấy tồn kho của MỘT sản phẩm (xem sản phẩm đang có ở những kho nào).
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID(undefined, { message: 'ID sản phẩm không đúng định dạng UUID.' })
  productId?: string;

  // Chỉ lấy tồn kho của MỘT kho.
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID(undefined, { message: 'ID kho không đúng định dạng UUID.' })
  warehouseId?: string;

  // true: chỉ lấy các dòng đang ở mức tồn kho thấp (hàng khả dụng <= ngưỡng áp dụng).
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'Low Stock Only phải là True hoặc False.' })
  lowStockOnly?: boolean = false;

  // Số dòng tối đa mỗi trang.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit phải là số nguyên.' })
  @Min(1, { message: 'Limit phải từ 1 trở lên.' })
  @Max(MAX_LIMIT, { message: `Limit tối đa là ${MAX_LIMIT}.` })
  limit?: number = DEFAULT_LIMIT;

  // Số dòng bỏ qua (bắt đầu từ 0).
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Offset phải là số nguyên.' })
  @Min(0, { message: 'Offset phải từ 0 trở lên.' })
  offset?: number = 0;
}

export class QueryStockAlertsDto {
  // Trạng thái cảnh báo cần lấy. Mặc định "OPEN" (các cảnh báo còn đang mở).
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsIn(ALERT_STATUS_FILTERS, {
    message: 'Status chỉ nhận OPEN, RESOLVED hoặc ALL.',
  })
  status?: AlertStatusFilter = 'OPEN';

  // Chỉ lấy cảnh báo của MỘT kho.
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID(undefined, { message: 'ID kho không đúng định dạng UUID.' })
  warehouseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit phải là số nguyên.' })
  @Min(1, { message: 'Limit phải từ 1 trở lên.' })
  @Max(MAX_LIMIT, { message: `Limit tối đa là ${MAX_LIMIT}.` })
  limit?: number = DEFAULT_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Offset phải là số nguyên.' })
  @Min(0, { message: 'Offset phải từ 0 trở lên.' })
  offset?: number = 0;
}