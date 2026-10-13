import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

const id = 'ad8fb080-6e3a-4a26-81b2-e948711312ac';
const categoryId = '27ea271e-395e-4196-918a-866a38a11fb4';
const product = {
  id,
  sku: 'TEST',
  name: 'Gạo',
  slug: 'gao',
  description: null,
  basePrice: new Prisma.Decimal('999999999999.99'),
  discountPercent: new Prisma.Decimal('0'),
  imageUrl: null,
  categoryId,
  category: { name: 'Thực phẩm', isActive: true },
  inventory: [
    {
      warehouseId: id,
      availableStock: 2,
      stock: 10,
      reservedStock: 8,
      warehouse: { name: 'Kho A' },
    },
  ],
};

describe('Products HTTP contract', () => {
  let app: INestApplication;
  const prisma = {
    product: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    category: { findMany: jest.fn() },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        ProductsService,
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
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([product]);
    prisma.product.findFirst.mockResolvedValue(product);
    prisma.category.findMany.mockResolvedValue([]);
  });
  afterAll(() => app.close());

  it('returns exact decimal strings and available stock, not physical stock', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/products')
      .expect(200);
    expect(response.body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      items: [
        { basePrice: '999999999999.99', availableStock: 2, isAvailable: true },
      ],
    });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        include: expect.objectContaining({
          inventory: expect.objectContaining({
            where: { warehouse: { isActive: true } },
          }) as unknown,
        }) as unknown,
      }),
    );
  });
  it('applies search, category UUID, price sorting and page offset in database', async () => {
    await request(app.getHttpServer() as Server)
      .get(
        `/products?category=${categoryId}&search=Gạo&sort=price-desc&page=2&pageSize=5`,
      )
      .expect(200);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          category: { id: categoryId, isActive: true },
          OR: expect.arrayContaining([
            { name: { contains: 'Gạo', mode: 'insensitive' } },
          ]) as unknown,
        }) as unknown,
        orderBy: [{ basePrice: 'desc' }, { id: 'asc' }],
      }),
    );
  });
  it('supports category slugs without casting arbitrary strings to UUID', async () => {
    await request(app.getHttpServer() as Server)
      .get('/products?category=food')
      .expect(200);
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: { isActive: true, category: { isActive: true, slug: 'food' } },
    });
  });
  it.each([
    'page=0',
    'page=1.5',
    'pageSize=101',
    'page=abc',
    'sort=invalid',
    'unexpected=x',
    'page=1&page=2',
  ])('rejects invalid query %s', async (query) => {
    await request(app.getHttpServer() as Server)
      .get(`/products?${query}`)
      .expect(400);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
  it('returns an empty page with pagination intact', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    await request(app.getHttpServer() as Server)
      .get('/products?page=99')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          items: [],
          page: 99,
          total: 1,
          totalPages: 1,
        });
      });
  });
  it('returns sold out for no inventory or fully reserved inventory', async () => {
    for (const inventory of [
      [],
      [{ ...product.inventory[0], availableStock: 0 }],
    ]) {
      prisma.product.findFirst.mockResolvedValue({ ...product, inventory });
      await request(app.getHttpServer() as Server)
        .get(`/products/${id}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ availableStock: 0, isAvailable: false });
        });
    }
  });
  it('validates UUID and excludes inactive or absent products', async () => {
    await request(app.getHttpServer() as Server)
      .get('/products/not-a-uuid')
      .expect(400);
    prisma.product.findFirst.mockResolvedValue(null);
    await request(app.getHttpServer() as Server)
      .get(`/products/${id}`)
      .expect(404);
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, isActive: true } }),
    );
  });
  it('routes categories before the dynamic UUID route', async () => {
    await request(app.getHttpServer() as Server)
      .get('/products/categories')
      .expect(200)
      .expect([]);
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });
});
