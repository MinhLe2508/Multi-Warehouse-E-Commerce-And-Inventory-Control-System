// =============================================================================
// Mục đích: DTO cho Endpoint "POST /auth/reset-password" 
// Người dùng đã quên mật khẩu, dùng Token nhận được từ email (sau khi gọi "POST /auth/forgot-password") để đặt mật khẩu MỚI. 
// Khớp chính xác với interface "ResetPasswordInput" trong auth.service.ts
// =============================================================================

import { IsString, Length, Matches } from 'class-validator';
import { IsPasswordByteLength } from './password-byte-length.validator';

// Định dạng Token hành động tài khoản
const ACCOUNT_ACTION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export class ResetPasswordDto {

  // Token gốc (64 ký tự hex) lấy từ link trong email đặt lại mật khẩu (MailService.sendPasswordReset)
  // Do "AccountActionTokenService.createToken(userId, PASSWORD_RESET)" sinh ra với TTL mặc định 900 giây (15 phút)
  @IsString({ message: 'Token phải là chuỗi ký tự.' })
  @Length(64, 64, { message: 'Token phải có đúng 64 ký tự.' })
  @Matches(ACCOUNT_ACTION_TOKEN_PATTERN, { message: 'Token không đúng định dạng Hex hợp lệ.',})
  token!: string;

  // Mật khẩu mới thay thế cho mật khẩu đã quên, phải áp dụng đầy đủ chính sách độ dài
  // Khớp chính xác với "AuthService.resetPassword()" gọi "this.validateNewPassword(input.newPassword)" ngay dòng đầu tiên
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự.' })
  @IsPasswordByteLength()
  newPassword!: string;
}
