/**
 RolesGuard thực hiện phân quyền theo vai trò (RBAC).
 PHÂN BIỆT:
 - JwtAuthGuard: Xác thực người dùng (Authentication).
 - RolesGuard: Kiểm tra vai trò được phép (Authorization).

 NGUYÊN TẮC:
 - JwtAuthGuard phải chạy trước RolesGuard.
 - RolesGuard đọc metadata do @Roles(...) khai báo.
 - Không truy vấn database trong RolesGuard.
 - Không tự xác thực hoặc giải mã JWT.
 - Sử dụng request.user do JwtStrategy.validate() trả về.

 Khi dùng Guard ở phạm vi route:
     @UseGuards(JwtAuthGuard, RolesGuard)
     @Roles(UserRole.ADMIN)

 Nếu sử dụng APP_GUARD toàn cục, cần đảm bảo thứ tự:
 JwtAuthGuard -> RolesGuard.
 */

import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { type AuthenticatedUser } from '../decorators/current-user.decorator';

// ROLES GUARD
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
    Quyết định người dùng có được phép truy cập endpoint hay không.

    Luồng xử lý:
    1. Đọc metadata @Roles(...) từ handler hoặc Controller.
    2. Không có metadata -> không giới hạn theo role.
    3. Có metadata nhưng danh sách rỗng -> từ chối.
    4. Có danh sách role -> kiểm tra request.user.
    5. Role hợp lệ -> cho phép.
    6. Role không hợp lệ -> từ chối (HTTP 403).
   */
  canActivate(context: ExecutionContext): boolean {
    // Đọc metadata phân quyền.
    // Ưu tiên @Roles(...) khai báo tại method.
    // Nếu method không khai báo, sử dụng metadata của Controller.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Route không khai báo @Roles(...).
    // Không áp dụng giới hạn theo role.
    // Điều này KHÔNG thay thế JWT Authentication.
    // JwtAuthGuard vẫn phải bảo vệ các route cần đăng nhập.
    if (requiredRoles === undefined) {
      return true;
    }

    // Có metadata nhưng không có role được phép.
    if (requiredRoles.length === 0) {
      return false;
    }

    // Lấy người dùng đã được JwtAuthGuard xác thực
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;

    // Không có user -> không thể xác định quyền.
    // Trường hợp này có thể xảy ra nếu RolesGuard được sử dụng sai thứ tự hoặc thiếu JwtAuthGuard.
    if (!user) {
      return false;
    }

    // Kiểm tra role hiện tại
    // true  -> Cho phép request đi tiếp.
    // false -> NestJS trả HTTP 403 Forbidden.
    return requiredRoles.includes(user.role);
  }
}
