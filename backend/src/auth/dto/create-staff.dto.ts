// =============================================================================
// Mục đích: DTO cho nghiệp vụ "Admin tạo tài khoản Warehouse Staff mới"
// Khớp chính xác với interface "CreateStaffInput" trong auth.service.ts
//
// DTO này không được dùng trong AuthController (AuthController không có endpoint "/auth/staff" 
// Xem thiết kế đã thống nhất: tạo Staff là nghiệp vụ "Quản lý người dùng" của AdminApi, không phải Authentication).
// =============================================================================

import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateStaffDto {

  // Gmail của nhân viên kho, dùng để gửi Email mời kích hoạt tài khoản
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value,)
  @MaxLength(254, { message: 'Email không được vượt quá 254 ký tự.' })
  email!: string;

  // Họ và tên đầy đủ của nhân viên, hiển thị trong Email mời kích hoạt và trên giao diện quản lý nhân sự của Admin Panel
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống.' })
  @MaxLength(150, { message: 'Họ và tên không được vượt quá 150 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;

  // Số điện thoại liên hệ của nhân viên, không bắt buộc
  @IsOptional()
  @IsString({ message: 'Số điện thoại phải là chuỗi ký tự.' })
  @Matches(/^(0\d{9}|\+84\d{9})$/, { message: 'Số điện thoại không hợp lệ. Định dạng cho phép: 0xxxxxxxxx hoặc +84xxxxxxxxx.',})
  @MaxLength(20, { message: 'Số điện thoại không được vượt quá 20 ký tự.' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim();
    return normalized === '' ? undefined : normalized;
  })
  phone?: string;
}