// =============================================================================
// Kiểm tra và chuẩn hóa các tham số truy vấn của:
//   GET /admin/staff
//
// Các tham số đều không bắt buộc:
//   search : Tìm theo tên, email, username hoặc số điện thoại.
//   status : LOCKED | PENDING_ACTIVATION | ACTIVE.
//   limit  : Số bản ghi mỗi trang (mặc định 20, tối đa 100).
//   offset : Số bản ghi bỏ qua (mặc định 0, tối đa 100000).
//
// QUY TẮC NGHIỆP VỤ
// Trạng thái Staff được StaffService suy ra từ bảng users:
//   LOCKED             : is_active = false
//   PENDING_ACTIVATION : is_active = true và email_verified_at IS NULL
//   ACTIVE             : is_active = true và email_verified_at IS NOT NULL
// =============================================================================

import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// Các giới hạn phân trang. Có thể điều chỉnh khi yêu cầu hệ thống thay đổi.
export const STAFF_DEFAULT_LIMIT = 20;
export const STAFF_MAX_LIMIT = 100;
export const STAFF_MAX_OFFSET = 100_000;

// Danh sách trạng thái hợp lệ để Frontend và Service dùng thống nhất.
export const STAFF_STATUS_FILTERS = [
  'LOCKED',
  'PENDING_ACTIVATION',
  'ACTIVE',
] as const;

export type StaffStatus = (typeof STAFF_STATUS_FILTERS)[number];

/**
 * Chuẩn hóa tham số tìm kiếm hoặc lọc trạng thái.
 *
 * - Chỉ xử lý khi giá trị là chuỗi.
 * - Xóa khoảng trắng ở đầu/cuối.
 * - Chuỗi rỗng được chuyển thành undefined (tức không lọc).
 * - Mảng, object và null được giữ nguyên để validator từ chối.
 */
function normalizeOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}

// Chuyển query số nguyên thập phân không âm thành number.
function parseQueryNonNegativeInteger(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();

  // Chỉ cho phép chữ số 0-9, không có dấu, dấu chấm hoặc ký hiệu khác
  if (!/^\d+$/.test(normalized)) {
    return value;
  }

  const parsed = Number(normalized);

  if (!Number.isSafeInteger(parsed)) {
    return value;
  }

  return parsed;
}

export class QueryStaffDto {
  // ===========================================================================
  // 1. TỪ KHÓA TÌM KIẾM
  // ===========================================================================

  @Transform(({ value }: { value: unknown }) => normalizeOptionalText(value))
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi ký tự.' })
  @MaxLength(100, {
    message: 'Từ khóa tìm kiếm không được vượt quá 100 ký tự.',
  })
  search?: string;

  // ===========================================================================
  // 2. LỌC THEO TRẠNG THÁI TÀI KHOẢN
  // ===========================================================================

  @Transform(({ value }: { value: unknown }) => {
    const normalized = normalizeOptionalText(value);
    return typeof normalized === 'string'
      ? normalized.toUpperCase()
      : normalized;
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn([...STAFF_STATUS_FILTERS], {
    message: 'Status chỉ nhận LOCKED, PENDING_ACTIVATION hoặc ACTIVE.',
  })
  status?: StaffStatus;

  // ===========================================================================
  // 3. SỐ BẢN GHI TỐI ĐA MỖI TRANG
  // ===========================================================================

  @Transform(({ value }: { value: unknown }) =>
    parseQueryNonNegativeInteger(value),
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt({ message: 'Limit phải là số nguyên thập phân.' })
  @Min(1, { message: 'Limit phải từ 1 trở lên.' })
  @Max(STAFF_MAX_LIMIT, {
    message: `Limit không được vượt quá ${STAFF_MAX_LIMIT}.`,
  })
  limit: number = STAFF_DEFAULT_LIMIT;

  // ===========================================================================
  // 4. VỊ TRÍ BẮT ĐẦU PHÂN TRANG
  // ===========================================================================

  @Transform(({ value }: { value: unknown }) =>
    parseQueryNonNegativeInteger(value),
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt({ message: 'Offset phải là số nguyên thập phân.' })
  @Min(0, { message: 'Offset không được nhỏ hơn 0.' })
  @Max(STAFF_MAX_OFFSET, {
    message: `Offset không được vượt quá ${STAFF_MAX_OFFSET}.`,
  })
  offset: number = 0;
}
