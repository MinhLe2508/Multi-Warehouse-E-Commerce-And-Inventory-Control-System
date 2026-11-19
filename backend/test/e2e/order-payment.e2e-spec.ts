import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { type Server } from 'node:http';
import { createRequire } from 'node:module';
import request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module';
import { configureHttpApp } from '../../src/configure-app';
import { InventoryPubSubService } from '../../src/inventory/inventory-pubsub.service';
import { MailService } from '../../src/mail/mail.service';
import { OrdersModule } from '../../src/orders/orders.module';
import { PaymentsModule } from '../../src/payments/payments.module';
import { PrismaService } from '../../src/prisma/prisma.service';

const { openFixtureDatabase, FIXTURE_DATABASE_ENV } = createRequire(__filename)(
  '../fixtures/prepare-e2e.cjs',
) as {
  FIXTURE_DATABASE_ENV: string;
  openFixtureDatabase: (url: string) => Promise<{ prisma: PrismaClient }>;
};

const databaseUrl = process.env[FIXTURE_DATABASE_ENV];
const describeDb = databaseUrl ? describe : describe.skip;

type Fixture = {
  userId: string;
  productId: string;
  warehouseId: string;
  inventoryId: bigint;
};

describeDb('Order and payment with PostgreSQL', () => {
  let db: PrismaClient;
  let app: INestApplication;
  let fixture: Fixture | undefined;
  let token: string;
  const initialJwtSecret = process.env.JWT_ACCESS_SECRET;
  const http = () => request(app.getHttpServer() as Server);
  const bearer = { type: 'bearer' } as const;

  beforeAll(async () => {
    ({ prisma: db } = await openFixtureDatabase(databaseUrl!));
    process.env.JWT_ACCESS_SECRET = randomBytes(32).toString('hex');
    const module = await Test.createTestingModule({
      imports: [AuthModule, OrdersModule, PaymentsModule],
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
  }, 30_000);

  beforeEach(async () => {
    const suffix = randomBytes(6).toString('hex');
    const code = `F109-${suffix}`;
    const username = code.toLowerCase();
    const password = randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(password, 4);

    fixture = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email: `${username}@example.test`,
          passwordHash,
          fullName: 'Checkout QA',
          role: 'CUSTOMER',
          emailVerifiedAt: new Date(),
          mustChangePassword: false,
        },
      });
      const warehouse = await tx.warehouse.create({
        data: {
          code,
          name: 'Kho kiểm thử thanh toán',
          region: 'HCM',
          defaultLowStockThreshold: 0,
        },
      });
      const product = await tx.product.create({
        data: {
          sku: code,
          slug: username,
          name: 'Sản phẩm kiểm thử thanh toán',
          basePrice: '100000.00',
        },
      });
      const [inventory] = await tx.$queryRaw<Array<{ id: bigint }>>`
        INSERT INTO inventory (product_id, warehouse_id, stock, updated_at)
        VALUES (${product.id}::uuid, ${warehouse.id}::uuid, 2, NOW())
        RETURNING id
      `;
      return {
        userId: user.id,
        productId: product.id,
        warehouseId: warehouse.id,
        inventoryId: inventory.id,
      };
    });

    const login = await http()
      .post('/auth/login')
      .send({ username, password })
      .expect(200);
    token = (login.body as { tokens: { accessToken: string } }).tokens
      .accessToken;
  });

  afterEach(async () => {
    const data = fixture;
    fixture = undefined;
    if (!data) return;
    await db.$transaction([
      db.payment.deleteMany({ where: { order: { userId: data.userId } } }),
      db.order.deleteMany({ where: { userId: data.userId } }),
      db.inventory.delete({ where: { id: data.inventoryId } }),
      db.product.delete({ where: { id: data.productId } }),
      db.warehouse.delete({ where: { id: data.warehouseId } }),
      db.user.delete({ where: { id: data.userId } }),
    ]);
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      if (initialJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = initialJwtSecret;
      await db?.$disconnect();
    }
  });

  const createOrder = (quantity: number) =>
    http()
      .post('/orders')
      .auth(token, bearer)
      .send({
        items: [{ productId: fixture!.productId, quantity }],
        shippingRecipient: 'Checkout QA',
        shippingPhone: '0900000000',
        shippingAddress: 'HCM',
        shippingRegion: 'HCM',
      });

  const pay = (orderId: string, approved: boolean) =>
    http()
      .post(`/payments/mock/${orderId}`)
      .auth(token, bearer)
      .send({
        transactionRef: `F109-${orderId}-${approved ? 'approve' : 'decline'}`,
        method: 'MOCK_CARD',
        approved,
      });

  const inventory = () =>
    db.inventory.findUniqueOrThrow({
      where: { id: fixture!.inventoryId },
      select: { stock: true, reservedStock: true, availableStock: true },
    });

  it('keeps the reservation on decline and commits stock only once on payment replay', async () => {
    const unavailable = await createOrder(3).expect(409);
    expect(unavailable.body).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await db.order.count({ where: { userId: fixture!.userId } })).toBe(
      0,
    );

    const created = await createOrder(1).expect(201);
    const { id: orderId } = created.body as { id: string };
    expect(created.body).toMatchObject({ status: 'PENDING_PAYMENT' });
    const held = { stock: 2, reservedStock: 1, availableStock: 1 };
    expect(await inventory()).toEqual(held);

    const declined = await pay(orderId, false).expect(201);
    expect(declined.body).toMatchObject({
      status: 'FAILED',
      orderStatus: 'PENDING_PAYMENT',
      duplicate: false,
    });
    expect(await inventory()).toEqual(held);

    const approvals = await Promise.all([
      pay(orderId, true).expect(201),
      pay(orderId, true).expect(201),
    ]);
    for (const { body } of approvals) {
      expect(body).toMatchObject({
        status: 'SUCCESS',
        orderStatus: 'CONFIRMED',
      });
    }
    expect(
      approvals
        .map(({ body }) => (body as { duplicate: boolean }).duplicate)
        .sort(),
    ).toEqual([false, true]);
    expect(await inventory()).toEqual({
      stock: 1,
      reservedStock: 0,
      availableStock: 1,
    });
    expect(await db.payment.count({ where: { orderId } })).toBe(2);
    expect(
      await db.stockReservation.findMany({
        where: { orderId },
        select: { status: true, quantity: true },
      }),
    ).toEqual([{ status: 'COMMITTED', quantity: 1 }]);

    const order = await http()
      .get(`/orders/${orderId}`)
      .auth(token, bearer)
      .expect(200);
    expect(order.body).toMatchObject({
      status: 'CONFIRMED',
      statusHistory: [
        { toStatus: 'PENDING_PAYMENT' },
        { toStatus: 'CONFIRMED' },
      ],
    });
  });

  it('rejects approval after expiry without committing stock or persisting a partial payment', async () => {
    const created = await createOrder(1).expect(201);
    const { id: orderId } = created.body as { id: string };
    const past = new Date('2000-01-01T00:00:00Z');
    await db.$transaction([
      db.order.update({
        where: { id: orderId },
        data: { reservationExpiresAt: past },
      }),
      db.stockReservation.updateMany({
        where: { orderId, status: 'HOLDING' },
        data: { expiresAt: past },
      }),
    ]);

    const rejected = await pay(orderId, true).expect(409);
    expect(rejected.body).toMatchObject({ code: 'RESERVATION_EXPIRED' });
    expect(await db.payment.count({ where: { orderId } })).toBe(0);
    expect(await inventory()).toEqual({
      stock: 2,
      reservedStock: 1,
      availableStock: 1,
    });
    expect(
      await db.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true },
      }),
    ).toEqual({ status: 'PENDING_PAYMENT' });
  });
});
