/**
  PasswordChangedGuard chặn tài khoản CHƯA ĐỔI MẬT KHẨU LẦN ĐẦU (mustChangePassword = true)
  gọi các API nghiệp vụ của khách (Orders, Payments, ...).

  Theo docs/api/stock-reservation-contract.md mục 9: phiên dùng để đổi mật khẩu lần đầu chưa
  đủ quyền tạo đơn, giữ chỗ hay thanh toán -> HTTP 403 PASSWORD_CHANGE_REQUIRED, và phải
  chặn TRƯỚC mọi thao tác giữ chỗ.

  THỨ TỰ GUARD (JwtStrategy đã trả mustChangePassword trong request.user):
    @UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
    token hợp lệ -> đã đổi mật khẩu -> đúng vai trò

  KHÔNG dùng cho: endpoint @Public(), callback thanh toán mock (tác vụ server, không phải
  hành động của người mua) và endpoint đổi mật khẩu.
 */

import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { type AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class PasswordChangedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;

    // Không có user: guard bị đặt sai thứ tự (thiếu JwtAuthGuard phía trước) -> từ chối.
    if (!user) {
      return false;
    }

    if (user.mustChangePassword) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message:
          'Bạn cần đổi mật khẩu lần đầu trước khi sử dụng chức năng này.',
      });
    }

    return true;
  }
}
