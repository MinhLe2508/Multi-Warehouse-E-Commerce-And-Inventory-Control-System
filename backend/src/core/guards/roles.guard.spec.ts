import { Reflector } from '@nestjs/core';
import { type ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function context(meta: unknown, user: unknown, classMeta?: unknown) {
  function handler() {}
  class Target {}
  if (meta !== undefined) Reflect.defineMetadata(ROLES_KEY, meta, handler);
  if (classMeta !== undefined)
    Reflect.defineMetadata(ROLES_KEY, classMeta, Target);
  return {
    getHandler: () => handler,
    getClass: () => Target,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}
describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  it('does not replace authentication on a route without role metadata', () =>
    expect(guard.canActivate(context(undefined, undefined))).toBe(true));
  it.each([[], null, 'ADMIN', ['NOT_A_ROLE'], [UserRole.ADMIN, 'bad']])(
    'fails closed for malformed/empty metadata (%#)',
    (meta) =>
      expect(guard.canActivate(context(meta, { role: UserRole.ADMIN }))).toBe(
        false,
      ),
  );
  it('rejects a missing user', () =>
    expect(guard.canActivate(context([UserRole.ADMIN], undefined))).toBe(
      false,
    ));
  it('uses method metadata before controller metadata', () =>
    expect(
      guard.canActivate(
        context([UserRole.WAREHOUSE_STAFF], { role: UserRole.ADMIN }, [
          UserRole.ADMIN,
        ]),
      ),
    ).toBe(false));
  it('uses class metadata when the method has none', () =>
    expect(
      guard.canActivate(
        context(undefined, { role: UserRole.ADMIN }, [UserRole.ADMIN]),
      ),
    ).toBe(true));
  it('allows only explicitly listed roles', () => {
    expect(
      guard.canActivate(context([UserRole.ADMIN], { role: UserRole.ADMIN })),
    ).toBe(true);
    expect(
      guard.canActivate(
        context([UserRole.WAREHOUSE_STAFF], { role: UserRole.ADMIN }),
      ),
    ).toBe(false);
  });
});
