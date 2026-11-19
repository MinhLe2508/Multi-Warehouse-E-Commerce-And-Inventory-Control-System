import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PasswordChangedGuard } from './password-changed.guard';

const contextWith = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('PasswordChangedGuard', () => {
  const guard = new PasswordChangedGuard();

  it('cho qua khi đã đổi mật khẩu', () => {
    expect(
      guard.canActivate(
        contextWith({
          userId: 'u',
          role: 'CUSTOMER',
          mustChangePassword: false,
        }),
      ),
    ).toBe(true);
  });

  it('chặn 403 PASSWORD_CHANGE_REQUIRED khi chưa đổi mật khẩu lần đầu', () => {
    const run = () =>
      guard.canActivate(
        contextWith({
          userId: 'u',
          role: 'CUSTOMER',
          mustChangePassword: true,
        }),
      );
    expect(run).toThrow(ForbiddenException);
    try {
      run();
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
  });

  it('từ chối khi không có user (guard đặt sai thứ tự, thiếu JwtAuthGuard)', () => {
    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });
});
