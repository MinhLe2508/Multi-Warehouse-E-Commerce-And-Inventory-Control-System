// =============================================================================
// Mục đích: DTO cho Endpoint "POST /auth/login"
// Đăng nhập bằng tên đăng nhập hoặc email đã đăng ký cho cả 3 vai trò.
// Khớp CHÍNH XÁC với interface "LoginInput" trong auth.service.ts
// =============================================================================

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // Giữ tên trường API để các ứng dụng đang dùng tiếp tục đăng nhập được.
  @IsString({ message: 'Tên đăng nhập hoặc Gmail phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Nhập tên đăng nhập hoặc Gmail.' })
  @MaxLength(254, { message: 'Thông tin đăng nhập quá dài.' })
  username!: string;

  // Mật khẩu người dùng nhập để đăng nhập, so khớp với "passwordHash" đã lưu trong CSDL bằng bcrypt.compare() tại Service
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  password!: string;
}
