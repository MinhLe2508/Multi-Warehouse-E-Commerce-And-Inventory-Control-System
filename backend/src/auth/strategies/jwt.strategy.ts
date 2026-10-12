
/**
Định nghĩa JWT Strategy cho Passport, dùng để xác thực Access Token trước khi cho phép người dùng truy cập các endpoint được bảo vệ.
NGUYÊN TẮC BẢO MẬT:
  - JWT payload chỉ chứa thông tin nhận diện tối thiểu.
  - Không đưa passwordHash hoặc dữ liệu bí mật vào JWT.
  - Không tin role/isActive lấy từ Access Token cũ.
  - Kiểm tra trạng thái User hiện tại ở mỗi request.
  - Access Token và Refresh Token dùng secret riêng.
  - JwtStrategy này chỉ dành cho Access Token.
  - Không tự gửi email, cấp token hoặc đổi mật khẩu tại đây.
 */

import { Injectable, UnauthorizedException, } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, } from 'passport-jwt';
import { isUUID } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { type AuthenticatedUser, } from '../../core/decorators/current-user.decorator';

// JWT ACCESS PAYLOAD
// Khai báo hình dạng dữ liệu bên trong JWT Access Token.
export interface JwtPayload { sub: string; type: 'access'; iat?: number; exp?: number; }

// ĐỌC JWT ACCESS SECRET
// Đọc JWT_ACCESS_SECRET từ biến môi trường
// Nếu biến môi trường bị thiếu hoặc rỗng, ném lỗi cấu hình ngay khi JwtStrategy được khởi tạo.
function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'JWT_ACCESS_SECRET chưa được cấu hình hoặc đang rỗng.',
    );
  }

  return secret;
}

// JWT STRATEGY
@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
  'jwt',
) {
  constructor(
    private readonly prisma: PrismaService,
  ) {
    // Cấu hình Passport JWT Strategy
    super({
      // Lấy Access Token từ HTTP Authorization header.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      // Không bỏ qua kiểm tra thời hạn
      ignoreExpiration: false,
      algorithms: ['HS256'],

      // Secret chỉ dành cho Access Token.
      secretOrKey: getJwtAccessSecret(),
    });
  }

  // VALIDATE ACCESS TOKEN
  // Passport gọi phương thức này sau khi JWT đã được xác minh chữ ký và kiểm tra thời hạn thành công.
  async validate(
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {

    // Kiểm tra loại token
    if (!payload || payload.type !== 'access') {
      throw new UnauthorizedException(
        'Access Token không hợp lệ.',
      );
    }

    // Kiểm tra claim "sub"
    if (
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub)
    ) {
      throw new UnauthorizedException(
        'Access Token không hợp lệ.',
      );
    }

    // Kiểm tra claim "exp"
    // Passport JWT tự kiểm tra token hết hạn khi claim exp tồn tại.
    if (
      typeof payload.exp !== 'number' ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= 0
    ) {
      throw new UnauthorizedException(
        'Access Token không hợp lệ.',
      );
    }

    // Truy vấn User hiện tại từ PostgreSQL
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
      },

      select: {
        id: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    // Kiểm tra tài khoản có tồn tại không
    // Nếu không tìm thấy User, Access Token không còn hợp lệ với hệ thống.
    if (!user) {
      throw new UnauthorizedException(
        'Tài khoản không hợp lệ hoặc không tồn tại.',
      );
    }

    // Kiểm tra tài khoản có bị khóa không
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên.',
      );
    }

    // Kiểm tra trạng thái xác thực email
    if (
      user.role !== UserRole.ADMIN &&
      user.emailVerifiedAt === null
    ) {
      throw new UnauthorizedException(
        'Tài khoản chưa hoàn tất xác thực Email.',
      );
    }

    // Trả về AuthenticatedUser
    return {
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
