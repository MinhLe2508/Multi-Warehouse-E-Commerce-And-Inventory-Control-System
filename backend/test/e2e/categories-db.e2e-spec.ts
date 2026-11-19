import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { type Server } from 'node:http';
import request from 'supertest';
import { configureHttpApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProductsModule } from '../../src/products/products.module';

const dbUrl = process.env.CATEGORIES_TEST_DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;
const secret = 'categories-postgresql-fixture';

type CategoryRow = {
  id: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
};

describeDb('Categories and public catalog with PostgreSQL', () => {
  const prefix = `cat-${randomUUID()}`;
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  let app: INestApplication | undefined;
  let prisma: PrismaClient | undefined;
  let adminId: string | undefined;
  let token: string;
  const api = () => request(app!.getHttpServer() as Server);
  const auth = { type: 'bearer' } as const;
  const update = (id: string, body: object) =>
    api().put(`/categories/${id}`).auth(token, auth).send(body);
  const remove = (id: string) =>
    api().delete(`/categories/${id}`).auth(token, auth);
  const post = (name: string, extra: object = {}) =>
    api()
      .post('/categories')
      .auth(token, auth)
      .send({ name: `${prefix} ${name}`, ...extra });

  async function create(
    name: string,
    extra: object = {},
  ): Promise<CategoryRow> {
    const response = await post(name, extra).expect(201);
    return response.body as CategoryRow;
  }

  beforeAll(async () => {
    const database = new URL(dbUrl!).pathname.slice(1);
    if (!/^cnpm_categories_test_[a-z0-9_]+$/.test(database)) {
      throw new Error(
        'CATEGORIES_TEST_DATABASE_URL phải trỏ đến CSDL kiểm thử riêng cnpm_categories_test_*.',
      );
    }
    process.env.JWT_ACCESS_SECRET = secret;
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: dbUrl }),
    });
    const admin = await prisma.user.create({
      data: {
        username: prefix,
        email: `${prefix}@example.test`,
        fullName: 'Category tester',
        passwordHash: 'fixture-only',
        role: UserRole.ADMIN,
        isActive: true,
        mustChangePassword: false,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    token = new JwtService({ secret }).sign(
      { sub: admin.id, type: 'access' },
      { expiresIn: '15m' },
    );

    const module = await Test.createTestingModule({ imports: [ProductsModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();
  }, 15000);

  afterAll(async () => {
    try {
      await app?.close();
      if (prisma && adminId) {
        await prisma.product.deleteMany({
          where: { sku: { startsWith: prefix } },
        });
        await prisma.category.deleteMany({
          where: { slug: { startsWith: prefix } },
        });
        await prisma.user.delete({ where: { id: adminId } });
      }
    } finally {
      await prisma?.$disconnect();
      if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = oldSecret;
    }
  });

  it('creates from the form, generates a Vietnamese slug and compares sibling names literally', async () => {
    const parent = await create('Đồ Điện');
    expect(parent).toMatchObject({ slug: `${prefix}-do-dien`, isActive: true });
    await post('đồ điện').expect(409);
    const first = await create('Cáp A', { parentId: parent.id.toUpperCase() });
    const second = await create('Cáp_A', { parentId: parent.id });
    expect(first.parentId).toBe(parent.id);
    expect(second.slug).toBe(`${first.slug}-2`);
    await post('Khác', { slug: first.slug }).expect(409);
  });

  it('rejects self-parent and descendant moves, then moves a valid child to the root', async () => {
    const parent = await create('Nhánh A');
    const child = await create('Nhánh B', { parentId: parent.id });
    const leaf = await create('Nhánh C', { parentId: child.id });
    await update(parent.id.toUpperCase(), { parentId: parent.id }).expect(400);
    await update(parent.id.toUpperCase(), {
      parentId: leaf.id.toUpperCase(),
    }).expect(409);
    await update(child.id, { parentId: null })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ parentId: null, slug: child.slug });
      });
  });

  it('lets only one of two concurrent opposite moves commit', async () => {
    const first = await create('Gốc song song A');
    const second = await create('Gốc song song B');
    const results = await Promise.all([
      update(first.id, { parentId: second.id }),
      update(second.id, { parentId: first.id }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    const rows = await prisma!.category.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { parentId: true },
    });
    expect(rows.filter((row) => row.parentId === null)).toHaveLength(1);
  });

  it('guards deletion when a child or a product remains, and deletes an empty leaf', async () => {
    const parent = await create('Xóa gốc');
    const child = await create('Xóa con', { parentId: parent.id });
    const product = await prisma!.product.create({
      data: {
        sku: `${prefix}-delete`,
        slug: `${prefix}-delete`,
        name: 'Fixture product',
        basePrice: '123.45',
        categoryId: child.id,
      },
    });
    await remove(parent.id).expect(409);
    await remove(child.id).expect(409);
    await prisma!.product.delete({ where: { id: product.id } });
    await remove(child.id).expect(204);
    await remove(parent.id).expect(204);
    await api()
      .get(`/categories/manage/${parent.id}`)
      .auth(token, auth)
      .expect(404);
  });

  it('shares visibility across both category lists, the tree, filtering and product details', async () => {
    const parent = await create('Cha hiển thị');
    const child = await create('Con hiển thị', { parentId: parent.id });
    const product = await prisma!.product.create({
      data: {
        sku: `${prefix}-visible`,
        slug: `${prefix}-visible`,
        name: 'Fixture product',
        basePrice: '123.45',
        categoryId: child.id,
      },
    });
    const paths = ['/categories', '/products/categories'];
    for (const path of paths) {
      await api()
        .get(path)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: child.id })]),
          );
        });
    }
    await api()
      .get(`/products?category=${child.slug}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          total: 1,
          items: [{ id: product.id, categoryId: child.id }],
        }),
      );

    await update(parent.id, { isActive: false }).expect(200);
    for (const path of [...paths, '/categories/tree']) {
      const response = await api().get(path).expect(200);
      const content = JSON.stringify(response.body);
      expect(content).not.toContain(parent.id);
      expect(content).not.toContain(child.id);
    }
    await api()
      .get(`/products?category=${child.id}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ total: 0, items: [] }),
      );
    await api()
      .get(`/products/${product.id}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          id: product.id,
          categoryId: null,
          categoryName: null,
        }),
      );
    await api()
      .get(`/categories/manage/${child.id}`)
      .auth(token, auth)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ isActive: true }));

    await update(parent.id, { isActive: true }).expect(200);
    await api()
      .get(`/products/${product.id}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          categoryId: child.id,
          basePrice: '123.45',
        }),
      );
  });
});
