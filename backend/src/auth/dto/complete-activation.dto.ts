// =============================================================================
// DTO dùng chung cho 2 Endpoint có cùng hình dạng dữ liệu đầu vào và cùng cơ chế xử lý (tiêu thụ Token 1 lần dùng + tự đặt mật khẩu) 
// Khớp chính xác với interface "CompleteActivationInput" trong auth.service.ts
// =============================================================================

import { IsString, Length, Matches } from 'class-validator';
import { IsPasswordByteLength } from './password-byte-length.validator';

// Định dạng chuẩn của Token hành động tài khoản do hệ thống tự sinh
const ACCOUNT_ACTION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export class CompleteActivationDto {

  // Token gốc (plain text, 64 ký tự hex) lấy từ đường link Email xác thực/mời kích hoạt.
  // Do Frontend đọc từ query string URL rồi gửi lên trong body request này
  @IsString({ message: 'Token phải là chuỗi ký tự.' })
  @Length(64, 64, { message: 'Token phải có đúng 64 ký tự.' })
  @Matches(ACCOUNT_ACTION_TOKEN_PATTERN, {
    message: 'Token không đúng định dạng hex hợp lệ.',
  })
  token!: string;

  // Mật khẩu do chính Customer/Staff TỰ CHỌN khi hoàn tất kích hoạt tài khoản
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @IsPasswordByteLength()
  password!: string;
}
