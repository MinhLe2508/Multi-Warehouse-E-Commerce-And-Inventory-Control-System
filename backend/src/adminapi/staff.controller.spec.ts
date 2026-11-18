import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { type Server } from 'node:http';
import request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { configureHttpApp } from '../configure-app';
import { PrismaService } from '../prisma/prisma.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

const adminId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const path = '/admin/staff';
const details = `${path}/${staffId}`;
const secret = 'staff-http-fixture';
const newStaff = { email: 'kho@example.test', fullName: 'Nhân viên kho' };
const staff = {
  ...newStaff,
  id: staffId,
  username: 'kho',
  phone: '0901234567',
  status: 'PENDING_ACTIVATION',
  isActive: true,
  activatedAt: null,
  createdAt: '2026-11-18T01:00:00.000Z',
  updatedAt: '2026-11-18T01:00:00.000Z',
};
const routes = [
  ['get', '', undefined],
  ['get', `/${staffId}`, undefined],
  ['post', '', newStaff],
  ['patch', `/${staffId}`, { phone: null }],
  ['patch', `/${staffId}/status`, { isActive: false }],
  ['post', `/${staffId}/resend-invitation`, undefined],
] as const;

describe('StaffController HTTP contract', () => {
  let app: INestApplication;
  let mustChangePassword = false;
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const jwt = new JwtService({ secret });
  const token = (sub: string) =>
    jwt.sign({ sub, type: 'access' }, { expiresIn: '15m' });
  const bearer = { type: 'bearer' } as const;
  const users = new Map<string, UserRole>([
    [adminId, UserRole.ADMIN],
    [staffId, UserRole.WAREHOUSE_STAFF],
    [customerId, UserRole.CUSTOMER],
  ]);
  const list = { items: [staff], total: 1, limit: 20, offset: 0 };
  const created = {
    staff,
    invitationSent: false,
    message: 'Đã tạo nhân viên nhưng chưa gửi được thư mời.',
  };
  const resent = { invitationSent: true, message: 'Đã gửi lại thư mời.' };
  const service = {
    findAll: jest.fn().mockResolvedValue(list),
    findOne: jest.fn().mockResolvedValue(staff),
    create: jest.fn().mockResolvedValue(created),
    update: jest.fn().mockResolvedValue({ ...staff, phone: null }),
    setStatus: jest
      .fn()
      .mockResolvedValue({ ...staff, isActive: false, status: 'LOCKED' }),
    resendInvitation: jest.fn().mockResolvedValue(resent),
  };
  const api = () => request(app.getHttpServer() as Server);
  const adminAuth = () => token(adminId);

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [StaffController],
      providers: [
        JwtStrategy,
        { provide: StaffService, useValue: service },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: ({ where }: { where: { id: string } }) => {
                const role = users.get(where.id);
                return role
                  ? {
                      id: where.id,
                      role,
                      isActive: true,
                      emailVerifiedAt: new Date(),
                      mustChangePassword,
                    }
                  : null;
              },
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = oldSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mustChangePassword = false;
  });

  it.each(routes)(
    'protects %s /admin/staff%s',
    async (method, suffix, payload) => {
      const call = () => {
        const req = api()[method](path + suffix);
        return payload === undefined ? req : req.send(payload);
      };
      await call().expect(401);
      for (const sub of [staffId, customerId]) {
        await call().auth(token(sub), bearer).expect(403);
      }
      mustChangePassword = true;
      await call()
        .auth(adminAuth(), bearer)
        .expect(403)
        .expect(({ body }) => {
          expect(body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
        });
      for (const handler of Object.values(service)) {
        expect(handler).not.toHaveBeenCalled();
      }
    },
  );

  it('uses DTO defaults and normalizes filters and pagination for the list', async () => {
    await api().get(path).auth(adminAuth(), bearer).expect(200).expect(list);
    expect(service.findAll).toHaveBeenLastCalledWith({ limit: 20, offset: 0 });

    await api()
      .get(path)
      .auth(adminAuth(), bearer)
      .query({
        search: '  tên kho  ',
        status: ' locked ',
        limit: '5',
        offset: '10',
      })
      .expect(200);
    expect(service.findAll).toHaveBeenLastCalledWith({
      search: 'tên kho',
      status: 'LOCKED',
      limit: 5,
      offset: 10,
    });
  });

  it.each([
    'limit=101',
    'limit=1e2',
    'limit=5&limit=10',
    'offset=100001',
    'offset=-1',
    'status=ALL',
    'search=' + 'a'.repeat(101),
  ])('rejects an invalid list query (%s)', async (query) => {
    await api().get(`${path}?${query}`).auth(adminAuth(), bearer).expect(400);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('returns the detail and checks every id route before forwarding it', async () => {
    await api()
      .get(details)
      .auth(adminAuth(), bearer)
      .expect(200)
      .expect(staff);
    expect(service.findOne).toHaveBeenCalledWith(staffId);
    const invalid = `${path}/invalid-id`;
    await api().get(invalid).auth(adminAuth(), bearer).expect(400);
    await api()
      .patch(invalid)
      .auth(adminAuth(), bearer)
      .send({ phone: null })
      .expect(400);
    await api()
      .patch(`${invalid}/status`)
      .auth(adminAuth(), bearer)
      .send({ isActive: false })
      .expect(400);
    await api()
      .post(`${invalid}/resend-invitation`)
      .auth(adminAuth(), bearer)
      .expect(400);
    expect(service.findOne).toHaveBeenCalledTimes(1);
    expect(service.update).not.toHaveBeenCalled();
    expect(service.setStatus).not.toHaveBeenCalled();
    expect(service.resendInvitation).not.toHaveBeenCalled();
  });

  it('creates the account with 201 even when the invitation did not go out', async () => {
    await api()
      .post(path)
      .auth(adminAuth(), bearer)
      .send({
        email: ' KHO@EXAMPLE.TEST ',
        fullName: ' Nhân viên kho ',
      })
      .expect(201)
      .expect(created);
    expect(service.create).toHaveBeenCalledWith(newStaff, adminId);
    await api()
      .post(path)
      .auth(adminAuth(), bearer)
      .send({
        ...newStaff,
        role: UserRole.ADMIN,
      })
      .expect(400);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('accepts null phone, false status, and an explicit 200 from resend', async () => {
    await api()
      .patch(details)
      .auth(adminAuth(), bearer)
      .send({ phone: null })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(
      staffId,
      { phone: null },
      adminId,
    );
    await api()
      .patch(`${details}/status`)
      .auth(adminAuth(), bearer)
      .send({
        isActive: false,
        reason: ' Tạm ngưng ',
      })
      .expect(200);
    expect(service.setStatus).toHaveBeenCalledWith(
      staffId,
      {
        isActive: false,
        reason: 'Tạm ngưng',
      },
      adminId,
    );
    await api()
      .post(`${details}/resend-invitation`)
      .auth(adminAuth(), bearer)
      .expect(200)
      .expect(resent);
    expect(service.resendInvitation).toHaveBeenCalledWith(staffId, adminId);
  });

  it.each([
    ['', { fullName: null }],
    ['', { phone: '123' }],
    ['', { email: newStaff.email }],
    ['/status', {}],
    ['/status', { isActive: 'false' }],
    ['/status', { isActive: false, reason: 'a'.repeat(501) }],
  ])('rejects invalid patch fields at %s: %j', async (suffix, data) => {
    await api()
      .patch(details + suffix)
      .auth(adminAuth(), bearer)
      .send(data)
      .expect(400);
    expect(service.update).not.toHaveBeenCalled();
    expect(service.setStatus).not.toHaveBeenCalled();
  });
});
