import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type PrismaClient, type UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { type Server } from 'node:http';
import { createRequire } from 'node:module';
import request from 'supertest';
import { AdminModule } from '../../src/admin/admin.module';
import { AdminApiModule } from '../../src/adminapi/adminapi.module';
import { ChatbotModule } from '../../src/chatbot/chatbot.module';
import { configureHttpApp } from '../../src/configure-app';
import { InventoryPubSubService } from '../../src/inventory/inventory-pubsub.service';
import { MailService } from '../../src/mail/mail.service';
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

  it('enforces account lock and first-password-change state on protected routes', async () => {
    const admin = { id: fixture.users.admin.id };
    const staff = { id: fixture.users.staff.id };
    await db.user.update({ where: staff, data: { isActive: false } });
    try {
      await read(`/inventory/${fixture.inventory.a.id}`, 'staff').expect(401);
    } finally {
      await db.user.update({ where: staff, data: { isActive: true } });
    }
    await db.user.update({ where: admin, data: { mustChangePassword: true } });
    try {
      const res = await read('/admin/staff', 'admin').expect(403);
      expect(res.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });
    } finally {
      await db.user.update({
        where: admin,
        data: { mustChangePassword: false },
      });
    }
    await read('/admin/staff', 'admin')
      .query({ search: fixture.users.staff.username })
      .expect(200);
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
