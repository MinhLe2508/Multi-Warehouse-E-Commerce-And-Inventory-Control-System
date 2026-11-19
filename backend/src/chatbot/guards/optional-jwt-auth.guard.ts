// =============================================================================
// OptionalJwtAuthGuard: cho phép chatbot phục vụ cả khách vãng lai lẫn người đã đăng nhập.
//
// - Không có header Authorization  -> request.user = undefined (khách vãng lai).
// - Có Bearer token hợp lệ         -> request.user do JwtStrategy xác minh (chữ ký, hạn, user còn active).
// - Có Bearer token KHÔNG hợp lệ   -> 401, để frontend refresh token thay vì âm thầm hạ xuống khách vãng lai.
//
// Thay thế cách cũ jwtService.decode() (không kiểm chữ ký -> có thể giả mạo userId).
// Dùng lại JwtStrategy ('jwt') đã đăng ký trong AuthModule, không sửa core guard của nhóm.
// =============================================================================

import {
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const auth = request.headers['authorization'];

    if (!auth) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false | null | undefined,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException(
        'Access Token không hợp lệ hoặc đã hết hạn.',
      );
    }
    return user;
  }
}
