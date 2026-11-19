import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { type Server } from 'node:http';
import { createRequire } from 'node:module';
import request from 'supertest';
import { AdminModule } from '../../src/admin/admin.module';
import { AdminAnalyticsService } from '../../src/admin/analytics/admin-analytics.service';
import { AdminOrdersQueryService } from '../../src/admin/orders/admin-orders.service';
import { AdminApiModule } from '../../src/adminapi/adminapi.module';
import { ChatbotModule } from '../../src/chatbot/chatbot.module';
import { configureHttpApp } from '../../src/configure-app';
import { InventoryPubSubService } from '../../src/inventory/inventory-pubsub.service';
import { MailService } from '../../src/mail/mail.service';
import { OrdersService } from '../../src/orders/orders.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ProductsModule } from '../../src/products/products.module';

type Account = 'admin' | 'staff' | 'customerA' | 'customerB';
type Warehouse = 'a' | 'b';
type Fixture = {
  runId: string;
  prefix: string;
  users: Record<Account, { id: string; username: string; role: UserRole }>;
  warehouses: Record<Warehouse, { id: string; code: string }>;
  product: { id: string; sku: string };
  inventory: Record<
    Warehouse,
    { id: string; stock: number; reserved: number; available: number }
  >;
  orders: Record<Warehouse | 'pending', { id: string; code: string }>;
  chat: Record<Warehouse, { id: string; message: string }>;
  expected: {
    analyticsDate: string;
    orderCount: number;
    costPrice: string;
    revenueA: string;
    revenueB: string;
  };
};

const fixtureRequire = createRequire(__filename);
const {
  prepareE2e,
  openFixtureDatabase,
  fixtureDatabaseTarget,
  FIXTURE_DATABASE_ENV,
} = fixtureRequire('../fixtures/prepare-e2e.cjs') as {
  FIXTURE_DATABASE_ENV: string;
  prepareE2e: (options: {
    databaseUrl: string;
    password: string;
  }) => Promise<Fixture>;
  openFixtureDatabase: (
    databaseUrl: string,
  ) => Promise<{ prisma: PrismaClient }>;
  fixtureDatabaseTarget: (databaseUrl: string) => { name: string };
};
const { cleanupE2e } = fixtureRequire('../fixtures/cleanup-e2e.cjs') as {
  cleanupE2e: (
    fixture: Fixture,
    options: { databaseUrl: string },
  ) => Promise<{
    deleted: Record<string, number>;
  }>;
};

const databaseUrl = process.env[FIXTURE_DATABASE_ENV];
const describeDb = databaseUrl ? describe : describe.skip;
const bearer = { type: 'bearer' } as const;

describe('E2E fixture database selection', () => {
  it('requires an explicitly named test database', () => {
    expect(() => fixtureDatabaseTarget('postgresql://localhost/shop')).toThrow(
      'cnpm_e2e_test_',
    );
    expect(() =>
      fixtureDatabaseTarget(
        'postgresql://localhost/cnpm_e2e_test_ci?schema=other',
      ),
    ).toThrow('schema public');
    expect(
      fixtureDatabaseTarget('postgresql://localhost/cnpm_e2e_test_ci').name,
    ).toBe('cnpm_e2e_test_ci');
  });
});

describeDb('Admin data access with PostgreSQL', () => {
  const url = databaseUrl!;
  const password = randomBytes(20).toString('hex');
  const env = {
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '1d',
    ANTHROPIC_API_KEY: '',
    GEMINI_API_KEY: '',
    GOOGLE_API_KEY: '',
    VOYAGE_API_KEY: '',
  };
  const originalEnv = Object.entries(env).map(
    ([key]) => [key, process.env[key]] as const,
  );
  const tokens = {} as Record<Account, string>;
  let db: PrismaClient;
  let app: INestApplication;
  let fixture: Fixture;
  let outsideFixture: { id: string; code: string };

  const http = () => request(app.getHttpServer() as Server);
  const read = (route: string, account: Account) =>
    http().get(route).auth(tokens[account], bearer);

  beforeAll(async () => {
    fixture = await prepareE2e({ databaseUrl: url, password });
    ({ prisma: db } = await openFixtureDatabase(url));
    outsideFixture = await db.warehouse.create({
      data: {
        code: `OTHER-${fixture.runId}`,
        name: 'Kho đối chứng',
        region: 'VN',
      },
      select: { id: true, code: true },
    });
    Object.assign(process.env, env);
    const module = await Test.createTestingModule({
      imports: [AdminModule, AdminApiModule, ProductsModule, ChatbotModule],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(InventoryPubSubService)
      .useValue({ notifyInventoryChanged: () => Promise.resolve() })
      .overrideProvider(MailService)
      .useValue({})
      .compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApp(app);
    await app.init();

    for (const key of ['admin', 'staff', 'customerA', 'customerB'] as const) {
      const { username, role } = fixture.users[key];
      const response = await http()
        .post('/auth/login')
        .send({ username, password })
        .expect(200);
      const body = response.body as {
        user: { role: UserRole };
        tokens: { accessToken: string };
      };
      expect(body.user.role).toBe(role);
      expect(typeof body.tokens.accessToken).toBe('string');
      tokens[key] = body.tokens.accessToken;
    }
  }, 30_000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      try {
        if (fixture) {
          const cleanup = await cleanupE2e(fixture, { databaseUrl: url });
          if (outsideFixture) {
            expect(cleanup.deleted).toEqual({
              orders: 3,
              chatSessions: 2,
              kbDocuments: 1,
              users: 4,
              inventory: 2,
              products: 1,
              warehouses: 2,
            });
            expect(await db.warehouse.count({ where: outsideFixture })).toBe(1);
          }
          const repeat = await cleanupE2e(fixture, { databaseUrl: url });
          expect(
            Object.values(repeat.deleted).every((count) => count === 0),
          ).toBe(true);
        }
      } finally {
        try {
          if (outsideFixture)
            await db.warehouse.deleteMany({ where: outsideFixture });
        } finally {
          for (const [key, value] of originalEnv) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
          await db?.$disconnect();
        }
      }
    }
  }, 30_000);

  it('creates one administrator, one warehouse staff member and two customers', async () => {
    const roles = await db.user.groupBy({
      by: ['role'],
      where: { id: { in: Object.values(fixture.users).map(({ id }) => id) } },
      _count: { _all: true },
    });
    expect(
      Object.fromEntries(roles.map(({ role, _count }) => [role, _count._all])),
    ).toEqual({
      ADMIN: 1,
      WAREHOUSE_STAFF: 1,
      CUSTOMER: 2,
    });
    const row = await db.inventory.findUniqueOrThrow({
      where: { id: BigInt(fixture.inventory.b.id) },
    });
    expect(row).toMatchObject({
      stock: 2,
      reservedStock: 1,
      availableStock: 1,
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: fixture.orders.pending.id },
    });
    const reservation = await db.stockReservation.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(reservation.status).toBe('HOLDING');
    expect(reservation.expiresAt).toEqual(order.reservationExpiresAt);
  });

  it('requires login and an administrative role for the administered order list', async () => {
    await http().get('/admin/orders').expect(401);
    await read('/admin/orders', 'customerA').expect(403);
  });

  it('lists and opens the expected administration order records', async () => {
    const response = await read('/admin/orders', 'admin')
      .query({ q: fixture.prefix })
      .expect(200);
    const body = response.body as {
      total: number;
      items: Array<{ id: string }>;
    };
    expect(body.total).toBe(fixture.expected.orderCount);
    expect(body.items.map(({ id }) => id).sort()).toEqual(
      Object.values(fixture.orders)
        .map(({ id }) => id)
        .sort(),
    );
    const detail = await read(
      `/admin/orders/${fixture.orders.a.id}`,
      'admin',
    ).expect(200);
    expect(detail.body).toMatchObject({
      orderCode: fixture.orders.a.code,
      status: 'CONFIRMED',
      grandTotal: '375001.50',
    });
  });

  it('filters orders by warehouse before pagination and returns real warehouse codes', async () => {
    const path = '/admin/orders';
    const q = fixture.prefix;
    const warehouseA = await read(path, 'admin')
      .query({ q, warehouseId: fixture.warehouses.a.id, limit: 1 })
      .expect(200);
    expect(warehouseA.body).toMatchObject({
      total: 1,
      totalPages: 1,
      items: [
        {
          id: fixture.orders.a.id,
          items: expect.arrayContaining([
            expect.objectContaining({
              warehouse: expect.objectContaining(fixture.warehouses.a),
            }),
            expect.objectContaining({
              warehouse: expect.objectContaining(fixture.warehouses.b),
            }),
          ]),
        },
      ],
    });

    const ids: string[] = [];
    for (const page of [1, 2, 3]) {
      const response = await read(path, 'staff')
        .query({ q, warehouseId: fixture.warehouses.b.id, limit: 1, page })
        .expect(200);
      const body = response.body as { items: Array<{ id: string }> };
      expect(response.body).toMatchObject({ total: 3, totalPages: 3, page });
      expect(body.items).toHaveLength(1);
      ids.push(body.items[0].id);
    }
    expect(ids.sort()).toEqual(
      Object.values(fixture.orders)
        .map(({ id }) => id)
        .sort(),
    );
    await read(path, 'admin').query({ warehouseId: 'invalid' }).expect(400);
    await read(path, 'admin').query({ from: '2026-02-30' }).expect(400);
  });

  it('uses the same Vietnamese calendar day across PostgreSQL session time zones', async () => {
    const orderCodePrefix = `${fixture.prefix}-T`;
    const userId = fixture.users.customerA.id;
    const timestamps = [
      '2026-11-17T16:59:59.999Z',
      '2026-11-17T17:00:00.000Z',
      '2026-11-18T16:59:59.999Z',
      '2026-11-18T17:00:00.000Z',
    ];
    const scope = { userId, orderCode: { startsWith: orderCodePrefix } };
    try {
      await db.$transaction(async (tx) => {
        for (const [index, timestamp] of timestamps.entries()) {
          await tx.$executeRaw`
            INSERT INTO orders
              (order_code, user_id, shipping_recipient, shipping_phone,
               shipping_address, created_at, updated_at)
            VALUES (${orderCodePrefix + index}, ${userId}::uuid, 'QA',
                    '0900000000', 'HCM', ${timestamp}::timestamptz, NOW())
          `;
        }
      });

      for (const timeZone of ['UTC', 'Asia/Ho_Chi_Minh']) {
        const session = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: url,
            options: `-c timezone=${timeZone}`,
          }),
        });
        try {
          const service = new AdminOrdersQueryService(
            session as PrismaService,
            app.get(OrdersService),
          );
          const result = await service.findAll({
            q: orderCodePrefix,
            from: '2026-11-18',
            to: '2026-11-18',
          });
          expect(result.total).toBe(2);
          expect(result.items.map(({ orderCode }) => orderCode)).toEqual([
            `${orderCodePrefix}2`,
            `${orderCodePrefix}1`,
          ]);
        } finally {
          await session.$disconnect();
        }
      }
    } finally {
      await db.order.deleteMany({ where: scope });
    }
  });

  it('calculates revenue from confirmed fixture lines for each warehouse', async () => {
    const cases = [
      ['a', fixture.expected.revenueA, 1],
      ['b', fixture.expected.revenueB, 2],
    ] as const;
    for (const [key, amount, count] of cases) {
      const warehouseId = fixture.warehouses[key].id;
      const date = fixture.expected.analyticsDate;
      const response = await read('/admin/analytics/summary', 'admin')
        .query({ warehouseId, fromDate: date, toDate: date })
        .expect(200);
      expect(response.body).toMatchObject({
        range: { warehouseId, fromDate: date, toDate: date },
        revenue: { total: amount, currency: 'VND', orderCount: count },
      });
    }
  });

  it('keeps revenue summary and chart stable across PostgreSQL session time zones', async () => {
    const prefix = `TZREV-${randomBytes(6).toString('hex')}-`;
    const userId = fixture.users.customerA.id;
    const dates = [
      ['2026-02-17T16:59:59.999Z', 1],
      ['2026-02-17T17:00:00.000Z', 10],
      ['2026-02-18T16:59:59.999Z', 100],
      ['2026-02-18T17:00:00.000Z', 1000],
    ] as const;

    try {
      for (const [index, [timestamp, total]] of dates.entries()) {
        await db.$executeRaw`
          INSERT INTO orders
            (order_code, user_id, status, subtotal, grand_total, shipping_recipient,
             shipping_phone, shipping_address, created_at, updated_at)
          VALUES (${prefix + index}, ${userId}::uuid, 'CONFIRMED', ${total}::numeric,
                  ${total}::numeric, 'QA', '0900000000', 'HCM', ${timestamp}::timestamptz, NOW())
        `;
      }
      for (const timeZone of ['UTC', 'Asia/Ho_Chi_Minh']) {
        const session = new PrismaClient({
          adapter: new PrismaPg({
            connectionString: url,
            options: `-c timezone=${timeZone}`,
          }),
        });
        try {
          const service = new AdminAnalyticsService(session as PrismaService);
          const range = { fromDate: '2026-02-18', toDate: '2026-02-18' };
          const summary = await service.getSummary(range);
          const series = await service.getRevenueSeries(range);
          expect(summary.revenue).toEqual({
            total: '110.00',
            currency: 'VND',
            orderCount: 2,
          });
          expect(series.series).toEqual([
            { date: '2026-02-18', revenue: '110.00', orderCount: 2 },
          ]);
        } finally {
          await session.$disconnect();
        }
      }
      await read('/admin/analytics/summary', 'admin')
        .query({ fromDate: '2026-02-30' })
        .expect(400);
    } finally {
      await db.order.deleteMany({
        where: { userId, orderCode: { startsWith: prefix } },
      });
    }
  });

  it.each(['/admin/analytics/summary', '/admin/analytics/revenue-series'])(
    'restricts analytics access for staff and customers on %s',
    async (route) => {
      await read(route, 'staff').expect(403);
      await read(route, 'customerA').expect(403);
    },
  );

  it('shows the fixture product cost to Admin and omits it from staff inventory and products', async () => {
    const productRoute = `/admin/products/${fixture.product.id}`;
    const admin = await read(productRoute, 'admin').expect(200);
    expect(admin.body).toMatchObject({
      id: fixture.product.id,
      costPrice: fixture.expected.costPrice,
    });
    const staff = await read(productRoute, 'staff').expect(200);
    expect(staff.body).toMatchObject({ id: fixture.product.id });
    expect(staff.body).not.toHaveProperty('costPrice');

    const inventory = `/inventory/${fixture.inventory.a.id}`;
    const stock = await read(inventory, 'staff').expect(200);
    expect(stock.body).toMatchObject({ id: fixture.inventory.a.id, stock: 12 });
    expect(stock.body).not.toHaveProperty('product.costPrice');
    await read(inventory, 'customerA').expect(403);
  });

  it('validates shared filters and keeps pagination specific to the inventory list', async () => {
    const list = '/admin/inventory';
    const summary = '/admin/inventory/summary';
    for (const path of [list, summary]) {
      await http().get(path).expect(401);
      await read(path, 'customerA').expect(403);
      await read(path, 'admin').query({ warehouseId: 'invalid' }).expect(400);
      await read(path, 'admin').query({ lowStockOnly: 'maybe' }).expect(400);
      await read(path, 'admin').query({ status: 'INVALID' }).expect(400);
    }
    await read(summary, 'admin').query({ limit: 1 }).expect(400);
    await read(list, 'admin').query({ limit: 101 }).expect(400);
    await read(list, 'admin').query({ offset: -1 }).expect(400);
    await read(list, 'admin').query({ page: 2_147_483_647 }).expect(400);

    const query = { productId: fixture.product.id.toUpperCase(), limit: 1 };
    const first = await read(list, 'admin')
      .query({ ...query, page: 2, offset: 0 })
      .expect(200);
    const second = await read(list, 'admin')
      .query({ ...query, page: 2 })
      .expect(200);
    expect(first.body).toMatchObject({
      offset: 0,
      total: 2,
      items: [{ id: fixture.inventory.a.id }],
    });
    expect(second.body).toMatchObject({
      offset: 1,
      total: 2,
      items: [{ id: fixture.inventory.b.id }],
    });

    const unfiltered = await read(summary, 'admin')
      .query({
        warehouseId: 'ALL',
        productId: fixture.product.id.toUpperCase(),
        lowStockOnly: 'false',
      })
      .expect(200);
    const lowOnly = await read(summary, 'admin')
      .query({ productId: fixture.product.id, lowStockOnly: 'true' })
      .expect(200);
    expect(unfiltered.body).toMatchObject({
      totalInventoryRows: 2,
      totalProducts: 1,
      totalStock: 14,
      totalReserved: 1,
      totalAvailable: 13,
      productsByStatus: { LOW_STOCK: 1, OUT_OF_STOCK: 0 },
    });
    expect(lowOnly.body).toMatchObject({
      totalInventoryRows: 1,
      totalStock: 2,
    });
  });

  it('uses the same warehouse scope for list and summary and shows configured capacity only', async () => {
    const a = { id: fixture.warehouses.a.id };
    const b = { id: fixture.warehouses.b.id };
    await db.$transaction([
      db.warehouse.update({ where: a, data: { isActive: false } }),
      db.warehouse.update({ where: b, data: { capacity: null } }),
    ]);
    try {
      const list = '/admin/inventory';
      const summary = '/admin/inventory/summary';
      const product = { productId: fixture.product.id };
      const [adminRows, staffRows, adminTotals, staffTotals] =
        await Promise.all([
          read(list, 'admin').query(product).expect(200),
          read(list, 'staff').query(product).expect(200),
          read(summary, 'admin').query(product).expect(200),
          read(summary, 'staff').query(product).expect(200),
        ]);
      expect(adminRows.body).toMatchObject({ total: 2 });
      expect(staffRows.body).toMatchObject({
        total: 1,
        items: [{ id: fixture.inventory.b.id }],
      });
      expect(staffRows.body).not.toHaveProperty('items.0.product.costPrice');
      expect(adminTotals.body).toMatchObject({
        totalInventoryRows: 2,
        totalStock: 14,
      });
      const adminWarehouseTotals = adminTotals.body as {
        byWarehouse: Array<{ warehouseId: string }>;
      };
      expect(
        adminWarehouseTotals.byWarehouse.find(
          (warehouse) => warehouse.warehouseId === a.id,
        ),
      ).toMatchObject({ capacity: 100, capacityRate: 12 });
      expect(
        adminWarehouseTotals.byWarehouse.find(
          (warehouse) => warehouse.warehouseId === b.id,
        ),
      ).toMatchObject({ capacity: null, capacityRate: null });
      expect(staffTotals.body).toMatchObject({
        totalInventoryRows: 1,
        totalStock: 2,
        totalReserved: 1,
        totalAvailable: 1,
      });
      expect(staffTotals.body).not.toHaveProperty(
        'byWarehouse',
        expect.arrayContaining([
          expect.objectContaining({ warehouseId: a.id }),
        ]),
      );

      const empty = await read(summary, 'staff')
        .query({ ...product, warehouseId: a.id })
        .expect(200);
      expect(empty.body).toMatchObject({
        totalProducts: 0,
        totalInventoryRows: 0,
        totalStock: 0,
        byWarehouse: [],
      });
    } finally {
      await db.$transaction([
        db.warehouse.update({ where: a, data: { isActive: true } }),
        db.warehouse.update({ where: b, data: { capacity: 100 } }),
      ]);
    }
  });

  it('filters by Vietnamese product name, real category and stock status within the selected warehouse', async () => {
    const productWhere = { id: fixture.product.id };
    const original = await db.product.findUniqueOrThrow({
      where: productWhere,
      select: { name: true, categoryId: true },
    });
    const category = await db.category.create({
      data: { name: `Điện tử ${fixture.runId}`, slug: `f056-${fixture.runId}` },
      select: { id: true, name: true },
    });
    try {
      await db.product.update({
        where: productWhere,
        data: { name: 'Điện thoại mẫu', categoryId: category.id },
      });
      const query = {
        productId: fixture.product.id,
        search: 'dien thoai',
        category: category.name,
        status: 'LOW_STOCK',
      };
      const [list, summary, warehouseSummary, safeStock] = await Promise.all([
        read('/admin/inventory', 'staff')
          .query({
            ...query,
            includeCategory: 'true',
            warehouseId: fixture.warehouses.b.id,
          })
          .expect(200),
        read('/admin/inventory/summary', 'staff').query(query).expect(200),
        read('/admin/inventory/summary', 'staff')
          .query({ ...query, warehouseId: fixture.warehouses.b.id })
          .expect(200),
        read('/admin/inventory/summary', 'staff')
          .query({
            ...query,
            warehouseId: fixture.warehouses.a.id,
            status: 'IN_STOCK',
          })
          .expect(200),
      ]);
      expect(list.body).toMatchObject({
        total: 1,
        items: [
          {
            id: fixture.inventory.b.id,
            product: { name: 'Điện thoại mẫu', category },
          },
        ],
      });
      expect(list.body).not.toHaveProperty('items.0.product.costPrice');
      expect(summary.body).toMatchObject({
        totalProducts: 1,
        totalInventoryRows: 2,
        totalStock: 14,
        productsByStatus: { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 0 },
      });
      expect(warehouseSummary.body).toMatchObject({
        totalInventoryRows: 1,
        totalStock: 2,
        totalAvailable: 1,
        byWarehouse: [{ warehouseId: fixture.warehouses.b.id }],
      });
      expect(safeStock.body).toMatchObject({
        totalInventoryRows: 1,
        totalStock: 12,
        productsByStatus: { IN_STOCK: 1, LOW_STOCK: 0 },
      });
    } finally {
      await db.product.update({ where: productWhere, data: original });
      await db.category.delete({ where: { id: category.id } });
    }
  });

  it('counts the entire filtered scope past 1,000 rows and measures the real load of the warehouse', async () => {
    const skuPrefix = `F056-${fixture.runId}-`;
    const warehouse = await db.warehouse.create({
      data: {
        code: `BULK-${fixture.runId}`,
        name: 'Kho kiểm thử phân trang',
        region: 'VN',
        capacity: 2_000,
      },
      select: { id: true },
    });
    try {
      await db.$executeRaw`
        WITH inserted_products AS (
          INSERT INTO products(sku, slug, name, base_price, updated_at)
          SELECT ${skuPrefix} || n, ${skuPrefix} || n, ${skuPrefix} || n, 100, NOW()
          FROM generate_series(1, 1001) AS n
          RETURNING id, sku
        )
        INSERT INTO inventory(product_id, warehouse_id, stock, updated_at)
        SELECT id, ${warehouse.id}::uuid, CASE WHEN sku = ${skuPrefix} || 1 THEN 0 ELSE 1 END, NOW()
        FROM inserted_products
      `;
      const query = { warehouseId: warehouse.id };
      const page = await read('/admin/inventory', 'admin')
        .query({ ...query, limit: 100, offset: 1000, includeCategory: 'true' })
        .expect(200);
      expect(page.body).toMatchObject({ total: 1001, offset: 1000 });
      const { items } = page.body as { items: Array<{ productId: string }> };
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ product: { category: null } });

      const summary = await read('/admin/inventory/summary', 'admin')
        .query(query)
        .expect(200);
      expect(summary.body).toMatchObject({
        totalProducts: 1001,
        totalInventoryRows: 1001,
        totalStock: 1000,
        totalReserved: 0,
        totalAvailable: 1000,
        productsByStatus: { LOW_STOCK: 1000, OUT_OF_STOCK: 1 },
        byWarehouse: [
          { warehouseId: warehouse.id, capacity: 2000, capacityRate: 50 },
        ],
      });
      const selected = await read('/admin/inventory/summary', 'admin')
        .query({ ...query, productId: items[0].productId })
        .expect(200);
      expect(selected.body).toMatchObject({
        totalInventoryRows: 1,
        totalStock: 1,
        byWarehouse: [{ totalStock: 1, occupiedStock: 1000, capacityRate: 50 }],
      });

      const outOfStock = { ...query, status: 'OUT_OF_STOCK' };
      const [emptyRows, emptyTotals] = await Promise.all([
        read('/admin/inventory', 'admin').query(outOfStock).expect(200),
        read('/admin/inventory/summary', 'admin').query(outOfStock).expect(200),
      ]);
      expect(emptyRows.body).toMatchObject({
        total: 1,
        items: [{ availableStock: 0 }],
      });
      expect(emptyTotals.body).toMatchObject({
        totalProducts: 1,
        totalInventoryRows: 1,
        totalStock: 0,
        productsByStatus: { LOW_STOCK: 0, OUT_OF_STOCK: 1 },
      });
    } finally {
      await db.$transaction([
        db.inventory.deleteMany({ where: { warehouseId: warehouse.id } }),
        db.product.deleteMany({ where: { sku: { startsWith: skuPrefix } } }),
        db.warehouse.delete({ where: warehouse }),
      ]);
    }
  }, 30_000);

  it('enforces account lock and first-password-change state on protected routes', async () => {
    const admin = { id: fixture.users.admin.id };
    const staff = { id: fixture.users.staff.id };
    await db.user.update({ where: staff, data: { isActive: false } });
    try {
      await read(`/inventory/${fixture.inventory.a.id}`, 'staff').expect(401);
    } finally {
      await db.user.update({ where: staff, data: { isActive: true } });
    }
    const adminReads = [
      '/admin/orders',
      `/admin/orders/${fixture.orders.a.id}`,
      '/admin/analytics/summary',
      '/admin/analytics/revenue-series',
    ];
    await db.user.update({ where: admin, data: { mustChangePassword: true } });
    try {
      for (const path of [
        '/admin/staff',
        '/admin/inventory',
        '/admin/inventory/summary',
        ...adminReads,
      ]) {
        const res = await read(path, 'admin').expect(403);
        expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
      }
    } finally {
      await db.user.update({
        where: admin,
        data: { mustChangePassword: false },
      });
    }
    await read('/admin/staff', 'admin')
      .query({ search: fixture.users.staff.username })
      .expect(200);
    for (const path of adminReads) {
      await read(path, 'admin').expect(200);
    }
  });

  it.each([
    ['a', 'customerA', 'customerB'],
    ['b', 'customerB', 'customerA'],
  ] as const)(
    'limits order %s and its chat history to the account owner',
    async (key, owner, other) => {
      const order = fixture.orders[key];
      const orderPath = `/orders/${order.id}`;
      const ownOrder = await read(orderPath, owner).expect(200);
      expect(ownOrder.body).toMatchObject({
        id: order.id,
        orderCode: order.code,
      });
      await read(orderPath, other).expect(404);

      const session = await db.chatSession.findUniqueOrThrow({
        where: { id: fixture.chat[key].id },
        select: { sessionToken: true },
      });
      const history = `/chatbot/history/${session.sessionToken}`;
      const ownHistory = await read(history, owner).expect(200);
      expect(ownHistory.body).toMatchObject({
        messageCount: 1,
        messages: [{ content: fixture.chat[key].message }],
      });
      await read(history, other).expect(404);
    },
  );
});
