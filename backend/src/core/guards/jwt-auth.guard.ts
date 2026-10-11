
/**
  JwtAuthGuard xác thực Access Token trước khi request
  được phép truy cập các Controller được bảo vệ.
 
  PHÂN BIỆT:
  - JwtAuthGuard: Xác thực người dùng (Authentication).
  - RolesGuard: Kiểm tra quyền theo vai trò (Authorization).
 
  NGUYÊN TẮC:
  - Kế thừa AuthGuard('jwt') của NestJS Passport.
  - Sử dụng JwtStrategy để xác minh Access Token.
  - Hỗ trợ metadata @Public() để bỏ qua xác thực.
  - Trả HTTP 401 khi không xác thực thành công.
  - Không trả thông tin lỗi JWT nội bộ cho client.
 
  JwtStrategy sẽ được triển khai trong AuthModule.
 
  Nếu dùng Global Guards, JwtAuthGuard phải được đăng ký trước RolesGuard.
 */

import { Injectable, UnauthorizedException, type ExecutionContext, } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';


// 1. PUBLIC METADATA KEY
/**
  Khóa metadata dùng để đánh dấu endpoint công khai.
 
  Public Decorator sẽ sử dụng cùng khóa này:
  @Public()
  @Post('login')
 
  JwtAuthGuard đọc metadata để quyết định có bỏ qua bước xác thực JWT hay không.
 */
export const IS_PUBLIC_KEY = 'isPublic';

// 2. JWT AUTH GUARD
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
  ) {
    super();
  }

  /**
    Kiểm tra request có cần xác thực JWT hay không.
   
    Luồng xử lý:
    1. Đọc metadata IS_PUBLIC_KEY.
    2. Route công khai -> cho qua.
    3. Route được bảo vệ -> gọi Passport JWT.
   
    Passport JWT sẽ sử dụng JwtStrategy đã được đăng ký trong hệ thống.
   */
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [
        context.getHandler(),
        context.getClass(),
      ],
    );

    // Endpoint công khai: bỏ qua JWT Authentication.
    if (isPublic) {
      return true;
    }

    // Endpoint được bảo vệ: xác thực bằng Passport JWT.
    return super.canActivate(context);
  }

  /**
    Xử lý kết quả xác thực từ Passport.
    - Có lỗi: ném lại lỗi.
    - Không có user: trả HTTP 401.
    - Có user: trả về user để Passport gắn vào request.user.

    Không đưa thông báo lỗi JWT nội bộ trực tiếp vào HTTP Response.
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false | null | undefined,
  ): TUser {

    // Có lỗi phát sinh khi xác thực.
    if (err) {
      throw err;
    }

    // Không xác thực được người dùng.
    if (!user) {
      throw new UnauthorizedException(
        'Access Token không hợp lệ hoặc đã hết hạn.',
      );
    }

    // Trả user do JwtStrategy.validate() cung cấp.
    return user;
  }
}
