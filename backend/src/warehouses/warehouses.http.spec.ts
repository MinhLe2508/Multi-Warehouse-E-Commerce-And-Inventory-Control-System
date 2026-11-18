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
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const WAREHOUSE = '44444444-4444-4444-8444-444444444444';
const SECRET = 'warehouses-http-test-only';
const create = { code: 'WH-HN', name: 'Kho Hà Nội', region: 'Miền Bắc' };

describe('Warehouses HTTP với JWT, guard và ValidationPipe thật', () => {
  const jwt = new JwtService({ secret: SECRET });
  const roles = new Map([
    [ADMIN, UserRole.ADMIN],
    [STAFF, UserRole.WAREHOUSE_STAFF],
    [CUSTOMER, UserRole.CUSTOMER],
  ]);
  const warehouse = { id: WAREHOUSE, ...create };
  const service = {
    findAll: jest.fn().mockResolvedValue([warehouse]),
    findOne: jest.fn().mockResolvedValue(warehouse),
    create: jest.fn().mockResolvedValue(warehouse),
    update: jest.fn().mockResolvedValue(warehouse),
    deactivate: jest.fn().mockResolvedValue(undefined),
  };
  let app: INestApplication;
  let mustChangePassword = false;
  const oldSecret = process.env.JWT_ACCESS_SECRET;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [WarehousesController],
      providers: [
        JwtStrategy,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: ({ where }: { where: { id: string } }) => ({
                id: where.id,
                role: roles.get(where.id),
                isActive: true,
                emailVerifiedAt: new Date(),
                mustChangePassword,
              }),
            },
          },
        },
        { provide: WarehousesService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = oldSecret;
    }
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mustChangePassword = false;
  });

  const api = () => request(app.getHttpServer() as Server);
  const token = (sub = ADMIN) =>
    jwt.sign({ sub, type: 'access' }, { expiresIn: '15m' });
  const get = (path: string, sub = ADMIN) =>
    api().get(path).auth(token(sub), { type: 'bearer' });

  it('yêu cầu JWT hợp lệ và từ chối CUSTOMER', async () => {
    await api().get('/warehouses').expect(401);
    await get('/warehouses', CUSTOMER).expect(403);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('STAFF chỉ xem kho đang hoạt động, ADMIN xem được cả kho đã ngừng', async () => {
    await get('/warehouses', STAFF).expect(200);
    expect(service.findAll).toHaveBeenLastCalledWith({
      includeInactive: false,
      region: undefined,
    });
    await get('/warehouses?includeInactive=true', STAFF).expect(403);
    expect(service.findAll).toHaveBeenCalledTimes(1);
    await get('/warehouses?includeInactive=true').expect(200);
    expect(service.findAll).toHaveBeenLastCalledWith({
      includeInactive: true,
      region: undefined,
    });
    await get(`/warehouses/${WAREHOUSE}`, STAFF).expect(200);
    expect(service.findOne).toHaveBeenLastCalledWith(WAREHOUSE, false);
    await get(`/warehouses/${WAREHOUSE}`).expect(200);
    expect(service.findOne).toHaveBeenLastCalledWith(WAREHOUSE, true);
  });

  it('STAFF không được tạo, sửa hoặc ngừng kho', async () => {
    const auth = { type: 'bearer' } as const;
    await api()
      .post('/warehouses')
      .auth(token(STAFF), auth)
      .send(create)
      .expect(403);
    await api()
      .put(`/warehouses/${WAREHOUSE}`)
      .auth(token(STAFF), auth)
      .send({ capacity: 100 })
      .expect(403);
    await api()
      .delete(`/warehouses/${WAREHOUSE}`)
      .auth(token(STAFF), auth)
      .expect(403);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
    expect(service.deactivate).not.toHaveBeenCalled();
  });

  it('chặn phiên buộc đổi mật khẩu trước cả đọc và ghi kho', async () => {
    mustChangePassword = true;
    await get('/warehouses', STAFF)
      .expect(403)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
      });
    await api()
      .put(`/warehouses/${WAREHOUSE}`)
      .auth(token(), { type: 'bearer' })
      .send({ capacity: 100 })
      .expect(403)
      .expect(({ body }) => {
        expect(body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
      });
    expect(service.findAll).not.toHaveBeenCalled();
    expect(service.update).not.toHaveBeenCalled();
  });

  it.each([
    'includeInactive=abc',
    'includeInactive=0',
    'includeInactive=',
    'includeInactive=true&includeInactive=false',
    'region=a&region=b',
    `region=${'x'.repeat(101)}`,
    'unexpected=true',
  ])('trả 400 cho query sai %s', async (query) => {
    await get(`/warehouses?${query}`).expect(400);
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('giữ includeInactive=false và bỏ khoảng trắng ở bộ lọc khu vực', async () => {
    await get(
      `/warehouses?includeInactive=false&region=${encodeURIComponent('  Miền Bắc  ')}`,
    ).expect(200);
    expect(service.findAll).toHaveBeenLastCalledWith({
      includeInactive: false,
      region: 'Miền Bắc',
    });
    await get('/warehouses?region=%20').expect(200);
    expect(service.findAll).toHaveBeenLastCalledWith({
      includeInactive: false,
      region: undefined,
    });
  });

  it('UUID sai bị chặn trước khi truy vấn kho', async () => {
    await get('/warehouses/not-a-uuid').expect(400);
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('POST chuẩn hóa mã, tên và khu vực; nhận null và ngưỡng 0', async () => {
    await api()
      .post('/warehouses')
      .auth(token(), { type: 'bearer' })
      .send({
        code: ' wh-hn ',
        name: ' Kho Hà Nội ',
        region: ' Miền Bắc ',
        address: null,
        capacity: null,
        defaultLowStockThreshold: 0,
      })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith({
      ...create,
      address: null,
      capacity: null,
      defaultLowStockThreshold: 0,
    });
  });

  it.each([
    { capacity: 0 },
    { capacity: 2147483648 },
    { capacity: '10' },
    { defaultLowStockThreshold: null },
    { isActive: false },
    { code: 'WH--HN' },
  ])('không tạo kho với dữ liệu sai %j', async (fields) => {
    await api()
      .post('/warehouses')
      .auth(token(), { type: 'bearer' })
      .send({ ...create, ...fields })
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('PUT nhận cập nhật từng phần và chuyển đúng người thao tác từ JWT', async () => {
    await api()
      .put(`/warehouses/${WAREHOUSE}?actorId=${STAFF}`)
      .auth(token(), { type: 'bearer' })
      .send({
        address: ' ',
        capacity: null,
        defaultLowStockThreshold: 0,
        isActive: false,
      })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(
      WAREHOUSE,
      {
        address: null,
        capacity: null,
        defaultLowStockThreshold: 0,
        isActive: false,
      },
      ADMIN,
    );
  });

  it.each([
    { name: null },
    { isActive: 'false' },
    { code: 'WH-FAKE' },
    { actorId: STAFF },
  ])('không sửa kho với dữ liệu sai %j', async (body) => {
    await api()
      .put(`/warehouses/${WAREHOUSE}`)
      .auth(token(), { type: 'bearer' })
      .send(body)
      .expect(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('DELETE của ADMIN trả 204 và gọi luồng ngừng hoạt động', async () => {
    await api()
      .delete(`/warehouses/${WAREHOUSE}`)
      .auth(token(), { type: 'bearer' })
      .expect(204)
      .expect('');
    expect(service.deactivate).toHaveBeenCalledWith(WAREHOUSE);
  });
});
