// Định nghĩa @CurrentUser() để các Controller lấy thông tin người dùng đã được xác thực từ request.user.

// NGUYÊN TẮC:
// - Không tự xác thực JWT.
// - Không tự truy vấn database.
// - Không tự kiểm tra quyền truy cập.
// - Không chứa passwordHash, token hoặc dữ liệu bí mật.

// JwtAuthGuard và JwtStrategy chịu trách nhiệm xác thực.
// RolesGuard chịu trách nhiệm kiểm tra vai trò.

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type UserRole } from '@prisma/client';

// 1. AUTHENTICATED USER INTERFACE

// Hình dạng dữ liệu của người dùng đã được xác thực.
// JwtStrategy.validate() sẽ trả về một object tương thích với interface này.
// NestJS Passport sẽ đưa object đó vào request.user.

// LƯU Ý: AuthenticatedUser không bắt buộc giống JWT payload.
// JWT có thể chỉ chứa userId (sub) và token type.
// JwtStrategy có thể truy vấn database để lấy
// role, username, email và trạng thái mới nhất.
export interface AuthenticatedUser {
  userId: string;
  username: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

// 2. CURRENT USER DECORATOR
export const CurrentUser = createParamDecorator<
  keyof AuthenticatedUser | undefined
>((data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
  // Lấy HTTP Request từ NestJS ExecutionContext
  const request = ctx.switchToHttp().getRequest<{
    user?: AuthenticatedUser;
  }>();

  // Lấy user đã được Passport gắn vào request
  const user = request.user;

  // Nếu yêu cầu một field cụ thể, chỉ trả về field đó
  if (data !== undefined) {
    return user?.[data];
  }

  // Không truyền field: trả về toàn bộ AuthenticatedUser
  return user;
});
