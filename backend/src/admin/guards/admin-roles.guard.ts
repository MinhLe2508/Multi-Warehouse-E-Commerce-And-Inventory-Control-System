import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithUser {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

/**
 * Guard kiểm tra vai trò tạm thời cho AdminModule.
 * TODO(AUTH): Thay thế bằng RolesGuard và JwtAuthGuard chính thức từ AuthModule khi P3 hoàn thành FR-AUTH-02.
 */
@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // Chưa đăng nhập / Không có thông tin người dùng -> 401 Unauthorized
    if (!user) {
      // Trong môi trường dev chưa có JWT middleware, có thể cho phép bypass nếu có header x-dev-admin-role
      const devRoleHeader = (request as unknown as { headers?: Record<string, string | undefined> })
        .headers?.['x-dev-admin-role'];
      if (devRoleHeader) {
        if (requiredRoles.includes(devRoleHeader)) {
          return true;
        }
        throw new ForbiddenException(
          `Tài khoản có vai trò ${devRoleHeader} không có quyền truy cập endpoint này.`
        );
      }
      throw new UnauthorizedException('Yêu cầu xác thực tài khoản quản trị.');
    }

    // Đúng vai trò -> 2xx, sai vai trò -> 403 Forbidden (NFR-02.2)
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Tài khoản có vai trò ${user.role} không có quyền truy cập endpoint này.`
      );
    }

    return true;
  }
}
