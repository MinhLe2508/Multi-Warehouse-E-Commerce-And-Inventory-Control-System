// =============================================================================
// DTO cho Endpoint "PUT /warehouses/:id"
// Admin cập nhật thông tin kho
// Endpoint dùng ngữ nghĩa CẬP NHẬT TỪNG PHẦN: chỉ những trường được gửi lên mới bị thay đổi, trường không gửi giữ nguyên giá trị cũ
// Yêu cầu phải có ít nhất một trường 
//
// PHÂN BIỆT 3 TRẠNG THÁI CỦA MỘT TRƯỜNG:
//   - Không gửi (undefined): Giữ nguyên giá trị hiện tại.
//   - Gửi null (chỉ "address" và "capacity"): Xóa giá trị (address = chưa có địa chỉ, capacity = không giới hạn).
//   - Gửi giá trị: Ghi đè bằng giá trị mới sau khi validate.
// =============================================================================

import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf,} from 'class-validator';
import { Transform } from 'class-transformer';

// Giá trị lớn nhất của kiểu INTEGER trong PostgreSQL 
const INT4_MAX = 2147483647;

export class UpdateWarehouseDto {
  // Tên hiển thị mới của kho.
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Tên kho phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên kho không được để trống.' })
  @MaxLength(150, { message: 'Tên kho không được vượt quá 150 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  // Khu vực địa lý mới của kho.
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Khu vực phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Khu vực không được để trống.' })
  @MaxLength(100, { message: 'Khu vực không được vượt quá 100 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  region?: string;

  // Địa chỉ mới. Gửi null hoặc chuỗi rỗng để xóa địa chỉ hiện có.
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự.' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự.' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  })
  address?: string | null;

  // Sức chứa tối đa mới. Gửi null để chuyển sang KHÔNG GIỚI HẠN.
  // Nghiệp vụ: không được đặt sức chứa nhỏ hơn tổng tồn kho hiện có trong kho
  @IsOptional()
  @IsInt({ message: 'Sức chứa phải là số nguyên.' })
  @Min(1, { message: 'Sức chứa phải lớn hơn hoặc bằng 1.' })
  @Max(INT4_MAX, { message: `Sức chứa không được vượt quá ${INT4_MAX}.` })
  capacity?: number | null;

  // Ngưỡng cảnh báo tồn kho thấp mặc định mới của kho.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Ngưỡng cảnh báo tồn kho thấp phải là số nguyên.' })
  @Min(0, { message: 'Ngưỡng cảnh báo tồn kho thấp không được âm.' })
  @Max(INT4_MAX, {
    message: `Ngưỡng cảnh báo tồn kho thấp không được vượt quá ${INT4_MAX}.`,
  })
  defaultLowStockThreshold?: number;

  // Trạng thái hoạt động của kho:
  //   - false: Ngừng hoạt động (tương đương endpoint DELETE). Bị từ chối nếu kho còn tồn kho đang được giữ chỗ cho đơn hàng chưa hoàn tất.
  //   - true : Kích hoạt lại kho đã ngừng hoạt động.
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'Trạng thái hoạt động phải là True hoặc False.' })
  isActive?: boolean;
}