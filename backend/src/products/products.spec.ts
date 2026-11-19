import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductImagesService } from './product-images.service';
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
  costPrice: new Prisma.Decimal('123.00'),
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
  const tx = {
    product: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    category: { findMany: jest.fn() },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
    ),
  };
  const food = {
    id: categoryId,
    name: 'Thực phẩm',
    slug: 'food',
    parentId: null,
    isActive: true,
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        ProductsService,
        ProductImagesService,
        CategoriesService,
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
    prisma.category.findMany.mockResolvedValue([food]);
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
        select: expect.objectContaining({
          inventory: expect.objectContaining({
            where: { warehouse: { isActive: true } },
          }) as unknown,
        }) as unknown,
      }),
    );
  });
  it('never returns costPrice or internal relations in either public endpoint', async () => {
    for (const path of ['/products', `/products/${id}`]) {
      const response = await request(app.getHttpServer() as Server)
        .get(path)
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain('costPrice');
      expect(JSON.stringify(response.body)).not.toContain('reservedStock');
    }
    const args = (prisma.product.findMany.mock.calls as unknown[][])[0][0] as {
      select: Record<string, unknown>;
    };
    expect(args.select).not.toHaveProperty('costPrice');
  });
  it('applies search, category UUID, price sorting and page offset in database', async () => {
    await request(app.getHttpServer() as Server)
      .get(
        `/products?category=${categoryId.toUpperCase()}&search=Gạo&sort=price-desc&page=2&pageSize=5`,
      )
      .expect(200);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          categoryId,
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
      where: { isActive: true, categoryId },
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
      .expect([
        { id: food.id, name: food.name, slug: food.slug, parentId: null },
      ]);
  });
  it('omits a hidden branch from facets and filters while keeping the product available', async () => {
    prisma.category.findMany.mockResolvedValue([
      { ...food, id, slug: 'hidden', isActive: false },
      { ...food, parentId: id },
    ]);
    const api = () => request(app.getHttpServer() as Server);
    await api().get('/products/categories').expect(200).expect([]);
    for (const filter of [categoryId, food.slug]) {
      await api().get(`/products?category=${filter}`).expect(200).expect({
        items: [],
        total: 0,
        page: 1,
        pageSize: 12,
        totalPages: 0,
      });
    }
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    await api()
      .get('/products')
      .expect(200)
      .expect(({ body }) => {
        expect(body.items).toMatchObject([
          { id, categoryId: null, categoryName: null },
        ]);
      });
    await api()
      .get(`/products/${id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id,
          categoryId: null,
          categoryName: null,
        });
      });
  });
});
