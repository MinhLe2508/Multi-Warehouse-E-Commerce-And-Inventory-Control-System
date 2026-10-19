// =============================================================================
// Mục đích: DTO dùng chung cho các nghiệp vụ chỉ cần một trường email.
// Đặt tên theo hình dạng dữ liệu ("EmailDto") thay vì theo từng nghiệp vụ.
// Ba nghiệp vụ dùng chung cấu trúc đầu vào nhưng có logic xử lý riêng trong Service.
// =============================================================================

import { IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class EmailDto {
  // Địa chỉ email dùng để xác thực tài khoản,
  // Đặt lại mật khẩu hoặc gửi lại lời mời kích hoạt Staff.
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254, {
    message: 'Email không được vượt quá 254 ký tự.',
  })
  email!: string;
}