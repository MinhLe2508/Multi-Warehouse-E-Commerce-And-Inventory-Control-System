import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { ManagedProductsController } from './managed-products.controller';
import { ManagedProductsService } from './managed-products.service';

const id = 'ad8fb080-6e3a-4a26-81b2-e948711312ac';
const categoryId = '27ea271e-395e-4196-918a-866a38a11fb4';
const data = {
  sku: 'P1-TEST',
  name: 'Sản phẩm',
  slug: 'p1-test',
  categoryId,
  basePrice: '199000.00',
  costPrice: '100000.00',
};
const product = { ...data, id, isActive: true };

describe('Managed products: real JWT, RBAC, DTO and service; database boundary mocked', () => {
  let app: INestApplication;
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const jwt = new JwtService({
    secret: 'p1-unit-test-secret-not-for-deployment',
  });
  let role: UserRole = UserRole.ADMIN;
  const prisma = {
    user: { findUnique: jest.fn() },
    category: { findFirst: jest.fn() },
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    inventory: { count: jest.fn() },
    orderItem: { count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const token = () =>
    jwt.sign({ sub: id, type: 'access' }, { expiresIn: '5m' });
  const client = () => request(app.getHttpServer() as Server);
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'p1-unit-test-secret-not-for-deployment';
    const module = await Test.createTestingModule({
      controllers: [ManagedProductsController],
      providers: [
        ManagedProductsService,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = oldSecret;
  });
  beforeEach(() => {
    jest.resetAllMocks();
    role = UserRole.ADMIN;
    prisma.user.findUnique.mockImplementation(() =>
      Promise.resolve({
        id,
        username: 'demo',
        email: 'demo@gmail.com',
        isActive: true,
        emailVerifiedAt: new Date(),
        role,
        mustChangePassword: false,
      }),
    );
    prisma.category.findFirst.mockResolvedValue({ id: categoryId });
    prisma.product.count.mockResolvedValue(1);
    const project = (args: { select: { costPrice?: boolean } }) => {
      const { costPrice, ...rest } = product;
      return args.select.costPrice ? { ...rest, costPrice } : rest;
    };
    prisma.product.findMany.mockImplementation(
      (args: { select: { costPrice?: boolean } }) =>
        Promise.resolve([project(args)]),
    );
    prisma.product.findUnique.mockImplementation(
      (args: { select: { costPrice?: boolean } }) =>
        Promise.resolve(project(args)),
    );
    prisma.product.create.mockResolvedValue(product);
    prisma.product.update.mockResolvedValue(product);
    prisma.product.delete.mockResolvedValue(product);
    prisma.inventory.count.mockResolvedValue(0);
    prisma.orderItem.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([{ id }]);
    prisma.$transaction.mockImplementation((work: unknown) =>
      typeof work === 'function'
        ? (work as (tx: typeof prisma) => Promise<unknown>)(prisma)
        : Promise.all(work as Promise<unknown>[]),
    );
  });
  it('rejects missing, invalid and expired JWT', async () => {
    await client().get('/admin/products').expect(401);
    await client()
      .get('/admin/products')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    await client()
      .get('/admin/products')
      .auth(jwt.sign({ sub: id, type: 'access' }, { expiresIn: -1 }), {
        type: 'bearer',
      })
      .expect(401);
  });
  it('uses current database role rather than a claimed ADMIN role', async () => {
    role = UserRole.CUSTOMER;
    await client()
      .get('/admin/products')
      .auth(
        jwt.sign(
          { sub: id, type: 'access', role: 'ADMIN' },
          { expiresIn: '5m' },
        ),
        { type: 'bearer' },
      )
      .expect(403);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
  it('requires password change before using product management', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id,
      username: 'admin',
      role: UserRole.ADMIN,
      isActive: true,
      emailVerifiedAt: new Date(),
      mustChangePassword: true,
    });
    await client()
      .post('/admin/products')
      .auth(token(), { type: 'bearer' })
      .send(data)
      .expect(403);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it('staff reads list and detail without costPrice', async () => {
    role = UserRole.WAREHOUSE_STAFF;
    for (const path of ['/admin/products', `/admin/products/${id}`]) {
      const response = await client()
        .get(path)
        .auth(token(), { type: 'bearer' })
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain('costPrice');
    }
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ costPrice: false }) as unknown,
      }),
    );
  });
  it('staff cannot create, update or delete', async () => {
    role = UserRole.WAREHOUSE_STAFF;
    await client()
      .post('/admin/products')
      .auth(token(), { type: 'bearer' })
      .send(data)
      .expect(403);
    await client()
      .patch(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .send({ name: 'changed' })
      .expect(403);
    await client()
      .delete(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .expect(403);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });
  it('admin sees costPrice and can create/update', async () => {
    const response = await client()
      .get('/admin/products')
      .auth(token(), { type: 'bearer' })
      .expect(200);
    expect(
      (response.body as { items: { costPrice: string }[] }).items[0].costPrice,
    ).toBe(data.costPrice);
    await client()
      .post('/admin/products')
      .auth(token(), { type: 'bearer' })
      .send(data)
      .expect(201);
    await client()
      .patch(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .send({ isActive: false })
      .expect(200);
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });
  it.each([
    { costPrice: '-1' },
    { basePrice: 100 },
    { basePrice: '1.234' },
    { basePrice: '1000000000000' },
    { categoryId: null },
    { name: '   ' },
    { discountPercent: '101' },
    { description: 'unsupported' },
    { barcode: 'unsupported' },
  ])('rejects invalid create input %j', async (change) => {
    await client()
      .post('/admin/products')
      .auth(token(), { type: 'bearer' })
      .send({ ...data, ...change })
      .expect(400);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it('rejects null patch, empty patch and malformed UUID', async () => {
    await client()
      .patch(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .send({ name: null })
      .expect(400);
    await client()
      .patch(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .send({})
      .expect(400);
    await client()
      .delete('/admin/products/not-uuid')
      .auth(token(), { type: 'bearer' })
      .expect(400);
  });
  it('rejects missing/inactive category', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    await client()
      .post('/admin/products')
      .auth(token(), { type: 'bearer' })
      .send(data)
      .expect(400);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it.each(['P2002', 'P2003', 'P2034'])(
    'maps database conflict %s to 409',
    async (code) => {
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('internal', {
          code,
          clientVersion: 'test',
        }),
      );
      await client()
        .post('/admin/products')
        .auth(token(), { type: 'bearer' })
        .send(data)
        .expect(409);
    },
  );
  it('never deletes product referenced by any order', async () => {
    prisma.orderItem.count.mockResolvedValue(1);
    await client()
      .delete(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .expect(409);
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });
  it('preserves stock, reservations and inventory history', async () => {
    prisma.inventory.count.mockResolvedValue(1);
    await client()
      .delete(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .expect(409);
    expect(prisma.inventory.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { stock: { gt: 0 } },
            { reservedStock: { gt: 0 } },
            { auditLogs: { some: {} } },
            { reservations: { some: {} } },
            { alerts: { some: {} } },
          ]) as unknown,
        }) as unknown,
      }),
    );
    expect(prisma.product.delete).not.toHaveBeenCalled();
  });
  it('deletes unreferenced product and returns 404 for missing product', async () => {
    await client()
      .delete(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .expect(204);
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id } });
    prisma.$queryRaw.mockResolvedValue([]);
    await client()
      .delete(`/admin/products/${id}`)
      .auth(token(), { type: 'bearer' })
      .expect(404);
  });
});
