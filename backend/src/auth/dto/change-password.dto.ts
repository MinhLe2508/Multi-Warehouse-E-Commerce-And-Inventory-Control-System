// =============================================================================
// Mục đích: DTO cho Endpoint "POST /auth/change-password" 
// Người dùng đã đăng nhập tự đổi mật khẩu, phải cung cấp đúng mật khẩu hiện tại để xác minh chính chủ. 
// Khớp chính xác với interface "ChangePasswordInput" trong auth.service.ts
// =============================================================================

import { IsNotEmpty, IsString } from 'class-validator';
import { IsPasswordByteLength } from './password-byte-length.validator';

export class ChangePasswordDto {

  // Mật khẩu hiện tại, dùng để xác minh chính chủ trước khi cho phép đổi sang mật khẩu mới
  // Khớp giá trị này với "passwordHash" đã lưu bằng bcrypt.compare())
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống.' })
  currentPassword!: string;

  // Mật khẩu mới do người dùng tự chọn, phải áp dụng đầy đủ chính sách độ dài
  // Khớp chính xác với "AuthService.changePassword()" gọi "this.validateNewPassword(input.newPassword)" ngay dòng đầu tiên
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự.' })
  @IsPasswordByteLength()
  newPassword!: string;
}
