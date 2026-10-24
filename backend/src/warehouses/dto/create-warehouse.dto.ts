// =============================================================================
// DTO cho Endpoint "POST /warehouses" 
// Admin tạo một kho hàng mới
// Khớp với model "Warehouse" trong schema.prisma (bảng "warehouses").
//
// Quy tắc chung:
// - Không có trường "isActive": Kho mới tạo luôn ở trạng thái hoạt động (mặc định của CSDL) 
// - Việc ngừng hoạt động / kích hoạt lại kho đi qua UpdateWarehouseDto và endpoint DELETE, có kiểm tra nghiệp vụ riêng
// - Không có "id", "createdAt", "updatedAt": do CSDL tự sinh
// - Nếu Client gửi thừa các trường này, ValidationPipe (forbidNonWhitelisted: true trong main.ts) sẽ từ chối request với HTTP 400
// - Các thao tác chuẩn hóa dữ liệu (trim, in hoa mã kho...) dùng @Transform, có hiệu lực nhờ "transform: true" của ValidationPipe toàn cục.
// =============================================================================

import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, } from 'class-validator';
import { Transform } from 'class-transformer';

const INT4_MAX = 2147483647;

// Định dạng mã kho: Chữ in hoa và số, các nhóm ngăn cách bằng dấu gạch ngang.
// Ví dụ hợp lệ: "HN01", "WH-HN01", "WH-HCM01"
const WAREHOUSE_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export class CreateWarehouseDto {
  // Mã kho hàng
  @IsString({ message: 'Mã kho phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mã kho không được để trống.' })
  @MaxLength(32, { message: 'Mã kho không được vượt quá 32 ký tự.' })
  @Matches(WAREHOUSE_CODE_PATTERN, {
    message:
      'Mã kho chỉ gồm chữ in hoa A-Z, số 0-9; các nhóm ngăn cách bằng dấu gạch ngang (Ví dụ: WH-HN01).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  // Tên hiển thị của kho, dùng trong dropdown chọn kho ở trang Admin
  @IsString({ message: 'Tên kho phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên kho không được để trống.' })
  @MaxLength(150, { message: 'Tên kho không được vượt quá 150 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  // Khu vực địa lý của kho 
  // Hệ thống đặt hàng dùng giá trị này để ưu tiên chọn kho gần địa chỉ nhận hàng của khách
  @IsString({ message: 'Khu vực phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Khu vực không được để trống.' })
  @MaxLength(100, { message: 'Khu vực không được vượt quá 100 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  region!: string;

  // Địa chỉ chi tiết của kho, không bắt buộc
  // Chuỗi rỗng sau khi trim được coi như không gửi trường này
  @IsOptional()
  @IsString({ message: 'Địa chỉ phải là chuỗi ký tự.' })
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự.' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    return normalized === '' ? undefined : normalized;
  })
  address?: string;

  // Sức chứa tối đa của kho (tổng số sản phẩm vật lý)
  // Không gửi (hoặc gửi null) nghĩa là không giới hạn. Nếu có giá trị thì phải là số nguyên dương.
  @IsOptional()
  @IsInt({ message: 'Sức chứa phải là số nguyên.' })
  @Min(1, { message: 'Sức chứa phải lớn hơn hoặc bằng 1.' })
  @Max(INT4_MAX, { message: `Sức chứa không được vượt quá ${INT4_MAX}.` })
  capacity?: number | null;

  // Ngưỡng cảnh báo tồn kho thấp mặc định cho mọi sản phẩm trong kho này 
  // Không gửi thì CSDL dùng mặc định 10. 
  // Dùng ValidateIf (không dùng IsOptional) để giá trị null bị từ chối: cột này không cho phép NULL
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Ngưỡng cảnh báo tồn kho thấp phải là số nguyên.' })
  @Min(0, { message: 'Ngưỡng cảnh báo tồn kho thấp không được âm.' })
  @Max(INT4_MAX, {
    message: `Ngưỡng cảnh báo tồn kho thấp không được vượt quá ${INT4_MAX}.`,
  })
  defaultLowStockThreshold?: number;
}