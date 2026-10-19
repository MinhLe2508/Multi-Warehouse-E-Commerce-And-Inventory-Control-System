// =============================================================================
// Mục đích: DTO cho Endpoint "POST /auth/login" 
// Đăng nhập bằng username + password, dùng chung cho cả 3 vai trò (CUSTOMER / WAREHOUSE_STAFF / ADMIN). 
// Khớp CHÍNH XÁC với interface "LoginInput" trong auth.service.ts
// =============================================================================

import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {

  // Tên đăng nhập do hệ thống tự sinh từ phần local-part của Email
  // lúc đăng ký hoặc tạo tài khoản; đây không phải địa chỉ email.
  @IsString({ message: 'Tên đăng nhập phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên đăng nhập không được để trống.' })
  @MaxLength(100, { message: 'Tên đăng nhập không được vượt quá 100 ký tự.' })
  username!: string;

  // Mật khẩu người dùng nhập để đăng nhập, so khớp với "passwordHash" đã lưu trong CSDL bằng bcrypt.compare() tại Service
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mật khẩu không được để trống.' })
  password!: string;
}