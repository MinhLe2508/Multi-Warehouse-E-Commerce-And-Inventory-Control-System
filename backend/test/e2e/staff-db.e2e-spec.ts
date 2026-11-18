import {
  type INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { AccountActionPurpose, PrismaClient, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import request from 'supertest';
import { AdminApiModule } from '../../src/adminapi/adminapi.module';
import { type AuthTokenPair } from '../../src/auth/auth.service';
import { configureHttpApp } from '../../src/configure-app';
import {
  MailService,
  type PasswordResetParams,
  type StaffInvitationParams,
} from '../../src/mail/mail.service';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const dbUrl = process.env.STAFF_TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;
const endpoint = '/admin/staff';
const bearer = { type: 'bearer' } as const;
const fixtureEnv = {
  JWT_ACCESS_SECRET: 'staff-db-fixture',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  FRONTEND_ORIGIN: 'http://localhost:3000',
  STAFF_INVITATION_TTL_SECONDS: '900',
  PASSWORD_RESET_TTL_SECONDS: '900',
};

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function expectPublicStaff(body: unknown) {
  expect(Object.keys(body as object).sort()).toEqual([
    'activatedAt',
    'createdAt',
    'email',
    'fullName',
    'id',
    'isActive',
    'phone',
    'status',
    'updatedAt',
    'username',
  ]);
}

describeDb('Admin Staff with PostgreSQL', () => {
  const prefix = randomUUID();
  const emailSuffix = `-${prefix}@example.test`;
  const email = (name: string) => name + emailSuffix;
  const previousEnv = Object.entries(fixtureEnv).map(
    ([key]) => [key, process.env[key]] as const,
  );
  const mail = {
    sendStaffInvitation: jest
      .fn<Promise<void>, [StaffInvitationParams]>()
      .mockResolvedValue(undefined),
    sendPasswordReset: jest
      .fn<Promise<void>, [PasswordResetParams]>()
      .mockResolvedValue(undefined),
  };
  let app: INestApplication | undefined;
  let prisma: PrismaClient;
  let adminId: string;
  let token: string;

  const api = () => request(app!.getHttpServer() as Server);
  const list = (query: Record<string, string | number>) =>
    api().get(endpoint).auth(token, bearer).query(query);
  const create = (name: string, fullName: string) =>
    api()
      .post(endpoint)
      .auth(token, bearer)
      .send({ email: email(name), fullName });
  const resend = (id: string) =>
    api().post(`${endpoint}/${id}/resend-invitation`).auth(token, bearer);
  const setStatus = (id: string, isActive: boolean) =>
    api()
      .patch(`${endpoint}/${id}/status`)
      .auth(token, bearer)
      .send({ isActive });
  const get = (id: string) =>
    api().get(`${endpoint}/${id}`).auth(token, bearer);

  function seedUser(
    name: string,
    role: UserRole,
    isActive: boolean,
    emailVerifiedAt: Date | null,
    createdAt: Date,
  ) {
    return prisma.user.create({
      data: {
        username: `${name}_${prefix.slice(0, 12)}`,
        email: email(name),
        fullName: `${prefix} ${name}`,
        passwordHash: 'fixture-only',
        role,
        isActive,
        emailVerifiedAt,
        mustChangePassword: false,
        createdAt,
      },
    });
  }

  function invitationToken(): string {
    const message = mail.sendStaffInvitation.mock.lastCall?.[0];
    expect(message).toBeDefined();
    const url = new URL(message!.setupUrl);
    expect(url.pathname).toBe('/staff-invitation');
    return url.searchParams.get('token')!;
  }

  beforeAll(async () => {
    const database = new URL(dbUrl!).pathname.slice(1);
    if (!/^cnpm_staff_test_[a-z0-9_]+$/.test(database)) {
      throw new Error(
        'STAFF_TEST_DATABASE_URL phải trỏ đến CSDL kiểm thử riêng cnpm_staff_test_*.',
      );
    }
    Object.assign(process.env, fixtureEnv);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
    });
    const now = new Date();
    const admin = await seedUser('admin', UserRole.ADMIN, true, now, now);
    adminId = admin.id;
    token = new JwtService({ secret: fixtureEnv.JWT_ACCESS_SECRET }).sign(
      { sub: admin.id, type: 'access' },
      { expiresIn: '15m' },
    );

    const module = await Test.createTestingModule({
      imports: [PrismaModule, AdminApiModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
  }, 15000);

  afterAll(async () => {
    try {
      await app?.close();
      await prisma?.user.deleteMany({
        where: { email: { endsWith: emailSuffix } },
      });
    } finally {
      await prisma?.$disconnect();
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  beforeEach(() => jest.clearAllMocks());

  it('filters and paginates only warehouse staff and restricts details, edits, status and resend to that role', async () => {
    const date = (day: number) => new Date(Date.UTC(2026, 0, day));
    const active = await seedUser(
      'active',
      UserRole.WAREHOUSE_STAFF,
      true,
      date(1),
      date(1),
    );
    const pending = await seedUser(
      'pending',
      UserRole.WAREHOUSE_STAFF,
      true,
      null,
      date(2),
    );
    const locked = await seedUser(
      'locked',
      UserRole.WAREHOUSE_STAFF,
      false,
      date(1),
      date(3),
    );
    const customer = await seedUser(
      'customer',
      UserRole.CUSTOMER,
      true,
      date(1),
      date(4),
    );
    const query = { search: ` ${prefix.toUpperCase()} `, limit: 2 };
    await list(query)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          total: 3,
          limit: 2,
          offset: 0,
          items: [
            { id: locked.id, status: 'LOCKED' },
            { id: pending.id, status: 'PENDING_ACTIVATION' },
          ],
        });
      });
    await list({ ...query, offset: 2 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          total: 3,
          limit: 2,
          offset: 2,
          items: [{ id: active.id, status: 'ACTIVE' }],
        });
      });
    for (const [status, id] of [
      ['locked', locked.id],
      ['pending_activation', pending.id],
      ['active', active.id],
    ]) {
      await list({ ...query, status })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ total: 1, items: [{ id }] });
        });
    }
    await get(active.id)
      .expect(200)
      .expect(({ body }) => expectPublicStaff(body));

    for (const id of [customer.id, adminId, randomUUID()]) {
      await get(id).expect(404);
      await api()
        .patch(`${endpoint}/${id}`)
        .auth(token, bearer)
        .send({ fullName: 'Đổi tên' })
        .expect(404);
      await setStatus(id, false).expect(404);
      await resend(id).expect(404);
    }
    await resend(locked.id).expect(409);
    await resend(active.id).expect(409);
    expect(mail.sendStaffInvitation).not.toHaveBeenCalled();
    await api()
      .patch(`${endpoint}/${active.id}`)
      .auth(token, bearer)
      .send({ fullName: ' Tên đã sửa ', phone: '0901234567' })
      .expect(200);
    await api()
      .patch(`${endpoint}/${active.id}`)
      .auth(token, bearer)
      .send({ phone: null })
      .expect(200)
      .expect(({ body }) => {
        expectPublicStaff(body);
        expect(body).toMatchObject({ fullName: 'Tên đã sửa', phone: null });
      });
    expect(
      await prisma.user.findUnique({
        where: { id: active.id },
        select: { fullName: true, phone: true },
      }),
    ).toEqual({ fullName: 'Tên đã sửa', phone: null });
  });

  it('commits a single account on a mail failure, rotates its invitation and activates it', async () => {
    const transportError = new ServiceUnavailableException(
      'fixture mail transport failure',
    );
    mail.sendStaffInvitation.mockRejectedValueOnce(transportError);
    const response = await create('invite', 'Nhân viên mới').expect(201);
    const { staff, invitationSent } = response.body as {
      staff: { id: string };
      invitationSent: boolean;
    };
    expect(invitationSent).toBe(false);
    expectPublicStaff(staff);
    expect(staff).toMatchObject({
      email: email('invite'),
      status: 'PENDING_ACTIVATION',
    });
    expect(Object.keys(response.body as object).sort()).toEqual([
      'invitationSent',
      'message',
      'staff',
    ]);
    const firstHash = sha256(invitationToken());
    const first = await prisma.accountActionToken.findUniqueOrThrow({
      where: { tokenHash: firstHash },
    });
    expect(first).toMatchObject({
      userId: staff.id,
      purpose: AccountActionPurpose.STAFF_INVITATION,
      invalidatedAt: null,
    });

    await create('invite', 'Trùng Email').expect(409);
    expect(await prisma.user.count({ where: { email: email('invite') } })).toBe(
      1,
    );
    expect(mail.sendStaffInvitation).toHaveBeenCalledTimes(1);

    mail.sendStaffInvitation.mockRejectedValueOnce(transportError);
    await resend(staff.id)
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({ statusCode: 503, code: 'INTERNAL_ERROR' });
        expect(JSON.stringify(body)).not.toContain(transportError.message);
      });
    await resend(staff.id)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ invitationSent: true });
        expect(Object.keys(body as object).sort()).toEqual([
          'invitationSent',
          'message',
        ]);
      });
    expect(mail.sendStaffInvitation).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: email('invite') }),
    );
    const rawToken = invitationToken();
    const openTokens = await prisma.accountActionToken.findMany({
      where: { userId: staff.id, invalidatedAt: null },
    });
    expect(openTokens).toHaveLength(1);
    expect(openTokens[0].tokenHash).toBe(sha256(rawToken));
    expect(openTokens[0].tokenHash).not.toBe(firstHash);
    expect(
      await prisma.accountActionToken.count({
        where: { userId: staff.id, invalidatedAt: { not: null } },
      }),
    ).toBe(2);

    await api()
      .post('/auth/activate-staff')
      .send({ token: rawToken, password: 'LocalStaffFixture123' })
      .expect(200);
    await get(staff.id)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'ACTIVE',
          activatedAt: expect.any(String) as string,
        });
      });
    expect(
      await prisma.accountActionToken.findUniqueOrThrow({
        where: { id: openTokens[0].id },
      }),
    ).toMatchObject({ usedAt: expect.any(Date) as Date });
    await resend(staff.id).expect(409);
  }, 15000);

  it('allocates different usernames when two staff emails normalize to the same candidate', async () => {
    const first = await create(
      'kho-nhan-vien-logistics-a',
      'Nhân viên A',
    ).expect(201);
    const second = await create(
      'kho-nhan-vien-logistics-b',
      'Nhân viên B',
    ).expect(201);
    const firstAccount = (
      first.body as { staff: { id: string; username: string } }
    ).staff;
    const secondAccount = (
      second.body as { staff: { id: string; username: string } }
    ).staff;
    expect(firstAccount.id).not.toBe(secondAccount.id);
    expect(firstAccount.username).not.toBe(secondAccount.username);

    const sameEmail = await Promise.all([
      create('duplicate', 'Yêu cầu A'),
      create('duplicate', 'Yêu cầu B'),
    ]);
    expect(sameEmail.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.user.count({ where: { email: email('duplicate') } }),
    ).toBe(1);
    expect(mail.sendStaffInvitation).toHaveBeenCalledTimes(3);
  }, 15000);

  it('revokes refresh and reset tokens, preserves the lock on a repeated request, and allows a fresh login after unlock', async () => {
    const password = 'LocalStaffFixture123';
    const response = await create('lock', 'Nhân viên khóa và mở').expect(201);
    const { staff, invitationSent } = response.body as {
      staff: { id: string; username: string };
      invitationSent: boolean;
    };
    expect(invitationSent).toBe(true);
    const rawInvitation = invitationToken();
    await api()
      .post('/auth/activate-staff')
      .send({ token: rawInvitation, password })
      .expect(200);
    const login = () =>
      api().post('/auth/login').send({ username: staff.username, password });
    const loginResponse = await login().expect(200);
    const { tokens } = loginResponse.body as { tokens: AuthTokenPair };
    const access = () => api().get('/auth/me').auth(tokens.accessToken, bearer);
    const refresh = (refreshToken: string) =>
      api().post('/auth/refresh').send({ refreshToken });
    await access().expect(200);
    await api()
      .post('/auth/forgot-password')
      .send({ email: email('lock') })
      .expect(200);
    const refreshWhere = { tokenHash: sha256(tokens.refreshToken) };
    const resetWhere = {
      userId: staff.id,
      purpose: AccountActionPurpose.PASSWORD_RESET,
    };

    await setStatus(staff.id, false)
      .expect(200)
      .expect(({ body }) => {
        expectPublicStaff(body);
        expect(body).toMatchObject({ isActive: false, status: 'LOCKED' });
      });
    const revoked = await prisma.refreshToken.findUniqueOrThrow({
      where: refreshWhere,
    });
    const reset = await prisma.accountActionToken.findFirstOrThrow({
      where: resetWhere,
    });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(reset.invalidatedAt).toBeInstanceOf(Date);
    expect(mail.sendPasswordReset).toHaveBeenCalledTimes(1);
    await access().expect(401);
    await refresh(tokens.refreshToken).expect(401);
    await setStatus(staff.id, false).expect(200);
    await setStatus(staff.id, true)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ isActive: true, status: 'ACTIVE' });
      });
    expect(
      await prisma.refreshToken.findUniqueOrThrow({ where: refreshWhere }),
    ).toMatchObject({ revokedAt: revoked.revokedAt });
    expect(
      await prisma.accountActionToken.findFirstOrThrow({ where: resetWhere }),
    ).toMatchObject({ invalidatedAt: reset.invalidatedAt });
    expect(
      await prisma.accountActionToken.findUniqueOrThrow({
        where: { tokenHash: sha256(rawInvitation) },
      }),
    ).toMatchObject({ usedAt: expect.any(Date) as Date, invalidatedAt: null });
    await refresh(tokens.refreshToken).expect(401);
    const newLogin = await login().expect(200);
    await refresh(
      (newLogin.body as { tokens: AuthTokenPair }).tokens.refreshToken,
    ).expect(200);
  }, 15000);
});
