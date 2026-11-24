import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountActionPurpose, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import type {
  CustomerVerificationParams,
  MailService,
  PasswordResetParams,
  StaffInvitationParams,
} from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AccountActionTokenService } from './account-action-token.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

const bcrypt = jest.requireMock<{
  hash: jest.Mock<Promise<string>, [string, number]>;
  compare: jest.Mock<Promise<boolean>, [string, string]>;
}>('bcrypt');

const fixtureEnv = {
  JWT_ACCESS_SECRET: 'cnpm-auth-unit-test',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  FRONTEND_ORIGIN: 'http://localhost:3000',
  EMAIL_VERIFICATION_TTL_SECONDS: '900',
  STAFF_INVITATION_TTL_SECONDS: '900',
  PASSWORD_RESET_TTL_SECONDS: '900',
};
const userId = '11111111-1111-4111-8111-111111111111';
const email = 'cnpm-auth@example.test';
const password = 'CurrentFixturePassword123';
const newPassword = 'NewFixturePassword456';
const storedPasswordHash = 'stored-fixture-password-hash';
const newPasswordHash = 'new-fixture-password-hash';
const rawActionToken = 'a'.repeat(64);
const rawRefreshToken = 'b'.repeat(64);
const refreshRecord = { id: '22222222-2222-4222-8222-222222222222', userId };
const registration = { email, fullName: 'Người kiểm thử' };
const hashToken = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const future = () => new Date(Date.now() + 60_000);

function actionToken(purpose: AccountActionPurpose) {
  return { purpose, expiresAt: future(), usedAt: null, invalidatedAt: null };
}

function setup(role: UserRole = UserRole.CUSTOMER) {
  const user = {
    ...registration,
    id: userId,
    username: 'cnpmauth',
    role,
    mustChangePassword: false,
  };
  const account = {
    ...user,
    isActive: true,
    emailVerifiedAt: new Date(),
    passwordHash: storedPasswordHash,
  };
  const activeRefresh = {
    ...refreshRecord,
    revokedAt: null,
    expiresAt: future(),
  };
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: userId }]),
    user: {
      create: jest.fn().mockResolvedValue(user),
      findUnique: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue(user),
    },
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(activeRefresh),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue(undefined),
    },
    accountActionToken: {
      findUnique: jest.fn().mockResolvedValue({ userId }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(account) },
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(refreshRecord),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    accountActionToken: { findUnique: jest.fn() },
    $transaction: jest.fn(
      (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  const mail = {
    sendCustomerVerification: jest
      .fn<Promise<void>, [CustomerVerificationParams]>()
      .mockResolvedValue(undefined),
    sendStaffInvitation: jest
      .fn<Promise<void>, [StaffInvitationParams]>()
      .mockResolvedValue(undefined),
    sendPasswordReset: jest
      .fn<Promise<void>, [PasswordResetParams]>()
      .mockResolvedValue(undefined),
  };
  const db = prisma as unknown as PrismaService;
  const jwt = new JwtService({ secret: fixtureEnv.JWT_ACCESS_SECRET });
  const service = new AuthService(
    db,
    jwt,
    mail as unknown as MailService,
    new AccountActionTokenService(db),
  );
  return { service, jwt, prisma, tx, mail, user, account };
}

describe('AuthService', () => {
  const previousEnv = Object.keys(fixtureEnv).map(
    (key) => [key, process.env[key]] as const,
  );

  beforeAll(() => {
    Object.assign(process.env, fixtureEnv);
  });

  beforeEach(() => {
    bcrypt.hash.mockReset().mockResolvedValue(newPasswordHash);
    bcrypt.compare.mockReset().mockResolvedValue(true);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(() => {
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('login and refresh', () => {
    it('matches a full Gmail to its email column even when the username differs', async () => {
      const { service, prisma, user } = setup();
      await expect(
        service.login({ username: ` ${user.email.toUpperCase()} `, password }),
      ).resolves.toMatchObject({ user });
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: user.email } }),
      );
    });

    it('signs an access JWT and stores only the refresh hash for a valid login', async () => {
      const { service, prisma, tx, jwt, user } = setup();

      const result = await service.login({
        username: ` ${user.username} `,
        password,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: user.username } }),
      );
      expect(bcrypt.compare).toHaveBeenCalledWith(password, storedPasswordHash);
      expect(result.user).toEqual(user);
      expect(jwt.verify(result.tokens.accessToken)).toEqual({
        sub: userId,
        type: 'access',
        iat: expect.any(Number) as number,
        exp: result.tokens.accessTokenExpiresAt,
      });
      expect(result.tokens.refreshToken).toMatch(/^[0-9a-f]{64}$/);
      expect(tx.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: hashToken(result.tokens.refreshToken),
          expiresAt: expect.any(Date) as Date,
        },
      });
    });

    it('returns the same rejection for an incorrect password and an unknown username', async () => {
      const { service, prisma, tx, user } = setup();
      bcrypt.compare.mockResolvedValueOnce(false);
      const rejection = {
        status: 401,
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác.',
      };

      await expect(
        service.login({ username: user.username, password }),
      ).rejects.toMatchObject(rejection);
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      await expect(
        service.login({ username: 'unknown-fixture-user', password }),
      ).rejects.toMatchObject(rejection);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it.each([
      ['locked', { isActive: false }],
      ['awaiting email verification', { emailVerifiedAt: null }],
      [
        'password changed during login',
        { passwordHash: 'changed-fixture-hash' },
      ],
    ] as const)('denies login when %s', async (_state, change) => {
      const { service, tx, user, account } = setup();
      tx.user.findUnique.mockResolvedValueOnce({ ...account, ...change });

      await expect(
        service.login({ username: user.username, password }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes an active refresh token before issuing its replacement and rejects subsequent use of the old token', async () => {
      const { service, prisma, tx, user } = setup();
      let revokedAt: Date | null = null;
      const expiresAt = future();
      tx.refreshToken.findUnique.mockImplementation(() =>
        Promise.resolve({ ...refreshRecord, revokedAt, expiresAt }),
      );
      tx.refreshToken.updateMany.mockImplementation(
        ({ data }: { data: { revokedAt: Date } }) => {
          revokedAt = data.revokedAt;
          return Promise.resolve({ count: 1 });
        },
      );

      const result = await service.refresh({ refreshToken: rawRefreshToken });

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashToken(rawRefreshToken) },
        }),
      );
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          ...refreshRecord,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) as Date },
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
      expect(result.user).toEqual(user);
      expect(result.tokens.refreshToken).not.toBe(rawRefreshToken);
      expect(tx.refreshToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          tokenHash: hashToken(result.tokens.refreshToken),
          expiresAt: expect.any(Date) as Date,
        },
      });
      expect(
        tx.refreshToken.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(tx.refreshToken.create.mock.invocationCallOrder[0]);

      await expect(
        service.refresh({ refreshToken: rawRefreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['expired', { expiresAt: new Date(0) }],
      ['revoked', { revokedAt: new Date(0) }],
    ] as const)(
      'rejects refresh when the token is %s',
      async (_state, change) => {
        const { service, tx } = setup();
        tx.refreshToken.findUnique.mockResolvedValueOnce({
          ...refreshRecord,
          revokedAt: null,
          expiresAt: future(),
          ...change,
        });

        await expect(
          service.refresh({ refreshToken: rawRefreshToken }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
        expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
        expect(tx.refreshToken.create).not.toHaveBeenCalled();
      },
    );

    it('rejects refresh for a locked account even when its token has not expired', async () => {
      const { service, tx, account } = setup(UserRole.WAREHOUSE_STAFF);
      tx.user.findUnique.mockResolvedValueOnce({ ...account, isActive: false });

      await expect(
        service.refresh({ refreshToken: rawRefreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects refresh when the conditional revocation did not update a row', async () => {
      const { service, tx } = setup();
      tx.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.refresh({ refreshToken: rawRefreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tx.refreshToken.create).not.toHaveBeenCalled();
    });

    it('revokes only the current user’s matching active refresh token on logout', async () => {
      const { service, prisma } = setup();

      await service.logout(userId, rawRefreshToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          tokenHash: hashToken(rawRefreshToken),
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });
  });

  describe('registration and staff invitations', () => {
    it('normalizes the customer profile, saves a hashed token and sends the verification link', async () => {
      const { service, prisma, tx, mail } = setup();
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.registerCustomer({
          email: ` ${email.toUpperCase()} `,
          fullName: ` ${registration.fullName} `,
          phone: ' 0901234567 ',
        }),
      ).resolves.toEqual({ email });

      expect(tx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ...registration,
            phone: '0901234567',
            role: UserRole.CUSTOMER,
            emailVerifiedAt: null,
          }),
        }),
      );
      const message = mail.sendCustomerVerification.mock.lastCall?.[0];
      expect(message).toMatchObject({
        to: email,
        fullName: registration.fullName,
        username: 'cnpmauth',
      });
      const url = new URL(message!.verifyUrl);
      expect(url.origin).toBe(fixtureEnv.FRONTEND_ORIGIN);
      expect(url.pathname).toBe('/verify-email');
      const token = url.searchParams.get('token');
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(tx.accountActionToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          purpose: AccountActionPurpose.EMAIL_VERIFICATION,
          tokenHash: hashToken(token!),
          expiresAt: expect.any(Date) as Date,
        },
      });
    });

    it('reports a customer verification mail failure after the account and token have been saved', async () => {
      const { service, prisma, tx, mail } = setup();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      mail.sendCustomerVerification.mockRejectedValueOnce(
        new Error('fixture mail failure'),
      );

      await expect(
        service.registerCustomer(registration),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(tx.user.create).toHaveBeenCalledTimes(1);
      expect(tx.accountActionToken.create).toHaveBeenCalledTimes(1);
    });

    it('does not send verification mail when the transaction fails', async () => {
      const { service, prisma, tx, mail } = setup();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const failure = new Error('fixture token storage failure');
      tx.accountActionToken.create.mockRejectedValueOnce(failure);

      await expect(service.registerCustomer(registration)).rejects.toBe(
        failure,
      );
      expect(mail.sendCustomerVerification).not.toHaveBeenCalled();
    });

    it.each([true, false])(
      'returns the created staff with invitationSent=%s when mail completes',
      async (invitationSent) => {
        const { service, prisma, tx, mail, user } = setup(
          UserRole.WAREHOUSE_STAFF,
        );
        prisma.user.findUnique.mockResolvedValueOnce(null);
        if (!invitationSent) {
          mail.sendStaffInvitation.mockRejectedValueOnce(
            new Error('fixture mail failure'),
          );
        }

        await expect(service.createStaff(registration)).resolves.toEqual({
          user,
          invitationSent,
        });
        expect(mail.sendStaffInvitation).toHaveBeenCalledTimes(1);
        expect(tx.accountActionToken.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId,
              purpose: AccountActionPurpose.STAFF_INVITATION,
            }),
          }),
        );
      },
    );
  });

  describe('verification, activation and password changes', () => {
    it.each([
      [UserRole.CUSTOMER, AccountActionPurpose.EMAIL_VERIFICATION],
      [UserRole.WAREHOUSE_STAFF, AccountActionPurpose.STAFF_INVITATION],
    ] as const)(
      'activates a pending %s with the matching action token',
      async (role, purpose) => {
        const { service, prisma, tx, user, account } = setup(role);
        prisma.accountActionToken.findUnique.mockResolvedValueOnce(
          actionToken(purpose),
        );
        tx.user.findUnique.mockResolvedValueOnce({
          ...account,
          emailVerifiedAt: null,
        });

        await expect(
          service.completeActivation(
            { token: rawActionToken, password: newPassword },
            purpose,
          ),
        ).resolves.toEqual(user);

        expect(tx.accountActionToken.updateMany).toHaveBeenCalledWith({
          where: {
            tokenHash: hashToken(rawActionToken),
            purpose,
            usedAt: null,
            invalidatedAt: null,
            expiresAt: { gt: expect.any(Date) as Date },
          },
          data: { usedAt: expect.any(Date) as Date },
        });
        expect(bcrypt.hash).toHaveBeenCalledWith(
          newPassword,
          expect.any(Number),
        );
        expect(tx.user.update).toHaveBeenCalledWith({
          where: { id: userId },
          data: {
            passwordHash: newPasswordHash,
            emailVerifiedAt: expect.any(Date) as Date,
            mustChangePassword: false,
          },
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true,
            role: true,
            mustChangePassword: true,
          },
        });
      },
    );

    it.each([
      ['expired', { expiresAt: new Date(0) }],
      ['already used', { usedAt: new Date(0) }],
      ['invalidated', { invalidatedAt: new Date(0) }],
      [
        'issued for another purpose',
        { purpose: AccountActionPurpose.PASSWORD_RESET },
      ],
    ] as const)(
      'rejects a verification token that is %s',
      async (_state, change) => {
        const { service, prisma, tx } = setup();
        const purpose = AccountActionPurpose.EMAIL_VERIFICATION;
        prisma.accountActionToken.findUnique.mockResolvedValueOnce({
          ...actionToken(purpose),
          ...change,
        });

        await expect(
          service.completeActivation(
            { token: rawActionToken, password: newPassword },
            purpose,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(tx.user.update).not.toHaveBeenCalled();
      },
    );

    it('does not activate a staff account that is already locked', async () => {
      const { service, prisma, tx, account } = setup(UserRole.WAREHOUSE_STAFF);
      const purpose = AccountActionPurpose.STAFF_INVITATION;
      prisma.accountActionToken.findUnique.mockResolvedValueOnce(
        actionToken(purpose),
      );
      tx.user.findUnique.mockResolvedValueOnce({
        ...account,
        emailVerifiedAt: null,
        isActive: false,
      });

      await expect(
        service.completeActivation(
          { token: rawActionToken, password: newPassword },
          purpose,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('does not update the account when the one-time token cannot be consumed', async () => {
      const { service, prisma, tx } = setup();
      const purpose = AccountActionPurpose.EMAIL_VERIFICATION;
      prisma.accountActionToken.findUnique.mockResolvedValueOnce(
        actionToken(purpose),
      );
      tx.accountActionToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.completeActivation(
          { token: rawActionToken, password: newPassword },
          purpose,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('updates the password and revokes all active refresh tokens in the reset transaction', async () => {
      const { service, prisma, tx } = setup();
      prisma.accountActionToken.findUnique.mockResolvedValueOnce(
        actionToken(AccountActionPurpose.PASSWORD_RESET),
      );

      await expect(
        service.resetPassword({ token: rawActionToken, newPassword }),
      ).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.accountActionToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            purpose: AccountActionPurpose.PASSWORD_RESET,
            tokenHash: hashToken(rawActionToken),
          }),
        }),
      );
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: newPasswordHash, mustChangePassword: false },
      });
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });

    it('returns the same password reset request result for mail failure and an unknown email', async () => {
      const { service, prisma, tx, mail } = setup();
      mail.sendPasswordReset.mockRejectedValueOnce(
        new Error('fixture mail failure'),
      );

      await expect(service.forgotPassword({ email })).resolves.toBeUndefined();
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.forgotPassword({ email: 'missing@example.test' }),
      ).resolves.toBeUndefined();

      expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
      expect(tx.accountActionToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId,
            purpose: AccountActionPurpose.PASSWORD_RESET,
          }),
        }),
      );
    });

    it('changes the password and revokes active refresh tokens together', async () => {
      const { service, prisma, tx } = setup(UserRole.ADMIN);
      bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await service.changePassword(userId, {
        currentPassword: password,
        newPassword,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: newPasswordHash, mustChangePassword: false },
      });
      expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });
  });
});
