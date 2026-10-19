// =============================================================================
// Mục đích: DTO cho Endpoint "POST /auth/register" — Customer tự đăng ký tài khoản mới. 
// Khớp chính xác với interface "RegisterCustomerInput" đã định nghĩa trong auth.service.ts
//
// Kông có "password": Customer không tự chọn mật khẩu tại bước đăng ký
// Mật khẩu chỉ được thiết lập sau khi xác thực Email thành công (qua CompleteActivationDto ở bước "POST /auth/verify-email"). 
// Nếu client gửi thêm "password" ở DTO này, ValidationPipe (có "forbidNonWhitelisted: true" trong main.ts) sẽ từ chối request với HTTP 400 — 
// Đây là hành vi mong muốn, không phải thiếu sót, vì nó buộc Frontend tuân thủ đúng luồng 2 bước (đăng ký → xác thực + đặt mật khẩu) đã chốt.
// =============================================================================

import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength,} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterCustomerDto {

  // Địa chỉ Gmail dùng để đăng ký, xác thực tài khoản và nhận mọi Email hệ thống
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value,)
  @MaxLength(254, { message: 'Email không được vượt quá 254 ký tự.' })
  email!: string;

  // Họ tên đầy đủ của Customer, hiển thị trong Email chào mừng/xác thực và trên giao diện sau khi đăng nhập
  @IsString({ message: 'Họ và tên phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống.' })
  @MaxLength(150, { message: 'Họ và tên không được vượt quá 150 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;

  // Số điện thoại liên hệ, không bắt buộc
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