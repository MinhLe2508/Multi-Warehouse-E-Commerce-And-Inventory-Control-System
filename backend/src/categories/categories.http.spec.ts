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
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '8ca72154-8701-4f1c-8efa-4a903f49be62';
const SECRET = 'categories-http-fixture';
const publicCategory = {
  id: CATEGORY_ID,
  name: 'Thiết bị',
  slug: 'thiet-bi',
  parentId: null,
};
const privateRoutes = [
  ['get', '/categories/manage'],
  ['get', `/categories/manage/${CATEGORY_ID}`],
  ['post', '/categories'],
  ['put', `/categories/${CATEGORY_ID}`],
  ['delete', `/categories/${CATEGORY_ID}`],
] as const;

describe('Categories HTTP contract', () => {
  let app: INestApplication;
  let mustChangePassword = false;
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const jwt = new JwtService({ secret: SECRET });
  const service = {
    findAllPublic: jest.fn().mockResolvedValue([publicCategory]),
    findTreePublic: jest.fn().mockResolvedValue([]),
    findAllForAdmin: jest.fn().mockResolvedValue([]),
    findOneForAdmin: jest.fn().mockResolvedValue(publicCategory),
    create: jest.fn().mockResolvedValue(publicCategory),
    update: jest.fn().mockResolvedValue(publicCategory),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const users = new Map<string, UserRole>([
    [ADMIN, UserRole.ADMIN],
    [STAFF, UserRole.WAREHOUSE_STAFF],
    [CUSTOMER, UserRole.CUSTOMER],
  ]);
  const api = () => request(app.getHttpServer() as Server);
  const token = (sub: string) =>
    jwt.sign({ sub, type: 'access' }, { expiresIn: '15m' });

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [CategoriesController],
      providers: [
        JwtStrategy,
        { provide: CategoriesService, useValue: service },
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
                      sessionVersion: 0,
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

  it('serves the list and tree without a login', async () => {
    await api().get('/categories').expect(200).expect([publicCategory]);
    await api().get('/categories/tree').expect(200).expect([]);
  });

  it.each(privateRoutes)('protects %s %s', async (method, path) => {
    await api()[method](path).expect(401);
    for (const sub of [STAFF, CUSTOMER]) {
      await api()
        [method](path)
        .auth(token(sub), { type: 'bearer' })
        .expect(403);
    }

    mustChangePassword = true;
    await api()
      [method](path)
      .auth(token(ADMIN), { type: 'bearer' })
      .expect(403)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' }),
      );
    for (const handler of Object.values(service)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('accepts the admin create form and keeps the POST status field off limits', async () => {
    const payload = {
      name: '  Thiết bị  ',
      parentId: CATEGORY_ID.toUpperCase(),
    };
    await api()
      .post('/categories')
      .auth(token(ADMIN), { type: 'bearer' })
      .send(payload)
      .expect(201);
    expect(service.create).toHaveBeenCalledWith({
      name: 'Thiết bị',
      parentId: CATEGORY_ID,
    });

    await api()
      .post('/categories')
      .auth(token(ADMIN), { type: 'bearer' })
      .send({ ...payload, isActive: false })
      .expect(400);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('keeps null parent and false visibility when editing a category', async () => {
    await api()
      .put(`/categories/${CATEGORY_ID}`)
      .auth(token(ADMIN), { type: 'bearer' })
      .send({ parentId: null, isActive: false })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(CATEGORY_ID, {
      parentId: null,
      isActive: false,
    });
  });
});
