/**
  Định nghĩa @Public() để đánh dấu endpoint hoặc Controller
  không yêu cầu Access Token JWT.
 
  Dự án dự kiến đăng ký JwtAuthGuard làm Global Guard sau khi AuthModule và JwtStrategy được hoàn thiện.
  Khi Global JWT Guard được kích hoạt, các endpoint mặc định yêu cầu xác thực, ngoại trừ những endpoint được đánh dấu bằng @Public().
  VÍ DỤ:
  - POST /auth/login
  - POST /auth/register
  - POST /auth/forgot-password
  - GET  /health
 
  NGUYÊN TẮC BẢO MẬT:
  - @Public() chỉ bỏ qua xác thực của JwtAuthGuard.
  - Không tự bỏ qua RolesGuard hoặc các Guard khác.
  - Không thay thế validation, rate limiting hoặc
    kiểm tra tính hợp lệ của các yêu cầu nghiệp vụ.
  - Chỉ sử dụng cho endpoint thật sự cần công khai.
 */

import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard';

// Đánh dấu một endpoint hoặc Controller là công khai đối với cơ chế xác thực JWT.
// JwtAuthGuard sẽ đọc IS_PUBLIC_KEY và bỏ qua xác thực Access Token nếu metadata có giá trị true.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
