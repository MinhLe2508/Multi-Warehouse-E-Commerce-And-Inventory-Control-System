// =============================================================================
// Kiểm tra và chuẩn hóa dữ liệu cho API:
//   PATCH /admin/staff/:id
//
// Admin chỉ được cập nhật thông tin liên hệ của nhân viên kho:
//   - fullName: Họ và tên.
//   - phone   : Số điện thoại.
//
// KHÔNG CHO PHÉP CẬP NHẬT QUA API NÀY
//   - email, username, role, isActive, passwordHash...
//   - Những trường không khai báo trong DTO bị ValidationPipe từ chối nhờ
//     whitelist: true + forbidNonWhitelisted: true (đã cấu hình trong main.ts).
//
// QUY TẮC CẬP NHẬT TỪNG PHẦN
//   fullName không gửi       -> giữ nguyên tên hiện tại.
//   fullName là chuỗi hợp lệ -> cập nhật tên sau khi trim().
//   fullName = null / ""     -> HTTP 400 (không được xóa họ tên).
//
//   phone không gửi          -> giữ nguyên số điện thoại hiện tại.
//   phone là chuỗi hợp lệ    -> cập nhật số điện thoại sau khi trim().
//   phone = null / "" / "  " -> xóa số điện thoại (ghi NULL vào database).
// =============================================================================

import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateStaffDto {
  // ===========================================================================
  // 1. HỌ VÀ TÊN
  // ===========================================================================

  // Không gửi: giữ nguyên. Gửi null, số, chuỗi rỗng: từ chối
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống.' })
  @MaxLength(150, { message: 'Họ và tên không được vượt quá 150 ký tự.' })
  fullName?: string;

  // ===========================================================================
  // 2. SỐ ĐIỆN THOẠI
  // ===========================================================================
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự.' })
  @Matches(/^(0\d{9}|\+84\d{9})$/, {
    message:
      'Số điện thoại không hợp lệ. Định dạng cho phép: 0xxxxxxxxx hoặc +84xxxxxxxxx.',
  })
  @MaxLength(20, { message: 'Số điện thoại không được vượt quá 20 ký tự.' })
  phone?: string | null;
}
