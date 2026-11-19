import { Reflector } from '@nestjs/core';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY, JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new Reflector());
  const base = AuthGuard('jwt').prototype;
  afterEach(() => jest.restoreAllMocks());
  function context(meta: unknown) {
    function handler() {}
    class Target {}
    Reflect.defineMetadata(IS_PUBLIC_KEY, meta, handler);
    return {
      getHandler: () => handler,
      getClass: () => Target,
    } as unknown as ExecutionContext;
  }
  it('bypasses authentication only for boolean true public metadata', () => {
    const run = jest.spyOn(base, 'canActivate').mockResolvedValue(true);
    expect(guard.canActivate(context(true))).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });
  it.each([false, 'true', 'false', 1, null, undefined])(
    'does not bypass for metadata %s',
    async (meta) => {
      const run = jest.spyOn(base, 'canActivate').mockResolvedValue(true);
      await guard.canActivate(context(meta));
      expect(run).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects a missing user without exposing JWT info', () =>
    expect(() => guard.handleRequest(null, false)).toThrow(
      UnauthorizedException,
    ));
  it('does not expose a non-Error string from authentication', () => {
    try {
      guard.handleRequest('private backend detail', null);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect(String(error)).not.toContain('private backend detail');
    }
  });
  it('preserves infrastructure errors for the global 500 filter', () => {
    const error = new Error('database unavailable');
    expect(() => guard.handleRequest(error, null)).toThrow(error);
  });
  it('returns the strategy user unchanged', () => {
    const user = { userId: 'id' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
