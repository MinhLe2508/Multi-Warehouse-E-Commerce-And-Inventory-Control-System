import { type Server } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { createInventoryHttpApp } from '../support/inventory-http-app';
import {
  InventoryService,
  type InventoryView,
  type PagedResult,
  type StockAlertView,
} from '../../src/inventory/inventory.service';
import { InventoryAlertService } from '../../src/inventory/inventory-alert.service';
import { InventoryChangeEmitter } from '../../src/inventory/inventory-change-emitter.service';

const url = process.env.INVENTORY_HTTP_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const A = '11111111-1111-4111-8111-111111111111',
  S = '22222222-2222-4222-8222-222222222222',
  C = '33333333-3333-4333-8333-333333333333';
const P = '44444444-4444-4444-8444-444444444444',
  P2 = '66666666-6666-4666-8666-666666666666',
  W = '55555555-5555-4555-8555-555555555555';
const ID = '9007199254740993';
const secret = 'inventory-http-postgresql-test-secret';
const writes = [
  ['post', '/inventory', { productId: P2, warehouseId: W }, 201],
  ['post', `/inventory/${ID}/restock`, { quantity: 1 }, 200],
  ['put', `/inventory/${ID}`, { stock: 0 }, 200],
] as const;

describeDb(
  'Inventory HTTP with real PostgreSQL, JWT, services and guards',
  () => {
    let prisma: PrismaClient, app: INestApplication;
    let isolated = false;
    const jwt = new JwtService({ secret });
    const oldSecret = process.env.JWT_ACCESS_SECRET;
    const events: unknown[] = [];
    const token = (sub = A, extra: Record<string, unknown> = {}) =>
      jwt.sign({ sub, type: 'access', ...extra }, { expiresIn: '15m' });
    const api = (method: string, path: string, body: unknown, sub = A) => {
      const agent = request(app.getHttpServer() as Server);
      const call =
        method === 'get'
          ? agent.get(path)
          : method === 'put'
            ? agent.put(path)
            : agent.post(path);
      call.auth(token(sub), { type: 'bearer' });
      return body === undefined ? call : call.send(body as object);
    };
    beforeAll(async () => {
      process.env.JWT_ACCESS_SECRET = secret;
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url }),
      });
      const [database] = await prisma.$queryRaw<
        { name: string }[]
      >`SELECT current_database() AS name`;
      if (!/^cnpm_week6_[a-f0-9]{32}$/.test(database.name))
        throw new Error(
          'Chạy qua npm run test:inventory:http:db để dùng database tạm riêng.',
        );
      isolated = true;
      const changes = new InventoryChangeEmitter(
        prisma as never,
        {
          notifyInventoryChanged: (event: unknown) => {
            events.push(event);
            return Promise.resolve();
          },
        } as never,
      );
      const inventory = new InventoryService(
        prisma as never,
        new InventoryAlertService(),
        changes,
      );
      app = await createInventoryHttpApp(prisma, inventory);
    });
    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
      if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = oldSecret;
    });
    beforeEach(async () => {
      if (!isolated) {
        throw new Error(
          'Refusing to mutate a database outside the isolated test runner',
        );
      }
      events.length = 0;
      await prisma.$executeRawUnsafe(
        'TRUNCATE users,warehouses,products CASCADE',
      );
      await prisma.user.createMany({
        data: [
          [A, UserRole.ADMIN],
          [S, UserRole.WAREHOUSE_STAFF],
          [C, UserRole.CUSTOMER],
        ].map(([id, role]) => ({
          id,
          role: role as UserRole,
          username: 'http-' + role,
          email: role.toLowerCase() + '@example.test',
          passwordHash: 'unused',
          fullName: 'HTTP tester',
          isActive: true,
          mustChangePassword: false,
          emailVerifiedAt: new Date(),
        })),
      });
      await prisma.warehouse.create({
        data: {
          id: W,
          code: 'HTTP-WH',
          name: 'HTTP warehouse',
          region: 'VN',
          capacity: 100,
          defaultLowStockThreshold: 2,
        },
      });
      await prisma.product.createMany({
        data: [P, P2].map((id, index) => ({
          id,
          sku: 'HTTP-' + index,
          name: 'HTTP product ' + index,
          slug: 'http-product-' + index,
          basePrice: '100000.00',
          costPrice: '50000.00',
        })),
      });
      await prisma.$executeRaw`INSERT INTO inventory(id,product_id,warehouse_id,stock,updated_at) VALUES(${BigInt(ID)}::bigint,${P}::uuid,${W}::uuid,10,NOW())`;
    });
    for (const sub of [A, S, C])
      it.each(writes)(`${sub}: %s %s`, async (method, path, body, status) => {
        const response = await api(method, path, body, sub);
        expect(response.status).toBe(sub === A ? status : 403);
        if (sub !== A) {
          expect(await prisma.inventoryAuditLog.count()).toBe(0);
          expect(events).toHaveLength(0);
        }
      });
    it('returns precise string IDs/prices for ADMIN and hides cost price from STAFF', async () => {
      const admin = await api('get', '/inventory/' + ID, undefined).expect(200);
      expect(admin.body).toMatchObject({
        id: ID,
        stock: 10,
        product: { costPrice: '50000.00', basePrice: '100000.00' },
      });
      const staff = await api('get', '/inventory/' + ID, undefined, S).expect(
        200,
      );
      expect((staff.body as InventoryView).product).not.toHaveProperty(
        'costPrice',
      );
      expect((await api('get', '/inventory', undefined, C)).status).toBe(403);
    });
    it('cannot elevate a DB STAFF with an ADMIN claim in the token', async () => {
      const response = await request(app.getHttpServer() as Server)
        .post('/inventory')
        .auth(token(S, { role: 'ADMIN' }), { type: 'bearer' })
        .send({ productId: P2, warehouseId: W });
      expect(response.status).toBe(403);
      expect(await prisma.inventory.count()).toBe(1);
    });
    it.each(['isActive', 'emailVerifiedAt', 'mustChangePassword', 'deleted'])(
      'uses current account state %s',
      async (state) => {
        const signed = token(S);
        if (state === 'deleted') await prisma.user.delete({ where: { id: S } });
        else
          await prisma.user.update({
            where: { id: S },
            data:
              state === 'isActive'
                ? { isActive: false }
                : state === 'emailVerifiedAt'
                  ? { emailVerifiedAt: null }
                  : { mustChangePassword: true },
          });
        const response = await request(app.getHttpServer() as Server)
          .get('/inventory')
          .auth(signed, { type: 'bearer' });
        expect(response.status).toBe(
          state === 'mustChangePassword' ? 403 : 401,
        );
        expect(events).toHaveLength(0);
      },
    );
    it('uses DB role on every request after demotion', async () => {
      const signed = token(A, { role: 'ADMIN' });
      await prisma.user.update({
        where: { id: A },
        data: { role: UserRole.WAREHOUSE_STAFF },
      });
      await request(app.getHttpServer() as Server)
        .post('/inventory')
        .auth(signed, { type: 'bearer' })
        .send({ productId: P2, warehouseId: W })
        .expect(403);
    });
    it('finds /alerts as its own route', async () => {
      await api('put', '/inventory/' + ID, { threshold: 10 }).expect(200);
      const response = await api(
        'get',
        '/inventory/alerts?status=open',
        undefined,
        S,
      ).expect(200);
      expect((response.body as PagedResult<StockAlertView>).items).toHaveLength(
        1,
      );
      expect(
        (response.body as PagedResult<StockAlertView>).items[0],
      ).toMatchObject({
        inventoryId: ID,
        status: 'OPEN',
      });
    });
    it('STAFF cannot read inactive warehouses but ADMIN can', async () => {
      await prisma.warehouse.update({
        where: { id: W },
        data: { isActive: false },
      });
      await api('get', '/inventory/' + ID, undefined, S).expect(404);
      const list = await api('get', '/inventory', undefined, S).expect(200);
      expect((list.body as PagedResult<InventoryView>).total).toBe(0);
      await api('get', '/inventory/' + ID, undefined).expect(200);
    });
    it.each([
      'offset=2147483648',
      'offset=9007199254740993',
      'offset=1e3',
      'limit=0x10',
      'limit=101',
      'limit=1&limit=2',
    ])('rejects query %s with 400 rather than SQL 500', async (query) => {
      await api('get', '/inventory?' + query, undefined).expect(400);
      await api('get', '/inventory/alerts?' + query, undefined).expect(400);
    });
    it('accepts int4-max offset and returns normal pagination', async () => {
      const response = await api(
        'get',
        '/inventory?offset=2147483647&limit=1',
        undefined,
      ).expect(200);
      expect(response.body).toMatchObject({
        items: [],
        offset: 2147483647,
        limit: 1,
        total: 1,
      });
    });
    it('treats false correctly and supports an explicit nullable threshold', async () => {
      const response = await api(
        'get',
        '/inventory?lowStockOnly=false',
        undefined,
        S,
      ).expect(200);
      expect((response.body as PagedResult<InventoryView>).total).toBe(1);
      await api('put', '/inventory/' + ID, { threshold: 10 }).expect(200);
      await api('put', '/inventory/' + ID, { threshold: null }).expect(200);
      const row = await prisma.inventory.findUniqueOrThrow({
        where: { id: BigInt(ID) },
      });
      expect(row.threshold).toBeNull();
    });
    it.each([{}, { note: 'only note' }, { stock: null }])(
      'rejects update without a valid stock/threshold change (%#)',
      async (body) => {
        await api('put', '/inventory/' + ID, body).expect(400);
        expect(await prisma.inventoryAuditLog.count()).toBe(0);
        expect(events).toHaveLength(0);
      },
    );
    it.each(['reservedStock', 'availableStock', 'version', 'userId'])(
      'rejects injected body field %s without effects',
      async (field) => {
        await api('put', '/inventory/' + ID, { stock: 0, [field]: 123 }).expect(
          400,
        );
        expect(
          (
            await prisma.inventory.findUniqueOrThrow({
              where: { id: BigInt(ID) },
            })
          ).stock,
        ).toBe(10);
        expect(await prisma.inventoryAuditLog.count()).toBe(0);
        expect(events).toHaveLength(0);
      },
    );
    it('does not accept initialStock null, creates a zero default, and detects duplicate pairs', async () => {
      await api('post', '/inventory', {
        productId: P2,
        warehouseId: W,
        initialStock: null,
      }).expect(400);
      const result = await api('post', '/inventory', {
        productId: P2,
        warehouseId: W,
      }).expect(201);
      expect((result.body as InventoryView).stock).toBe(0);
      await api('post', '/inventory', { productId: P2, warehouseId: W }).expect(
        409,
      );
    });
    it('restocks within capacity and audits the authenticated actor despite query spoofing', async () => {
      await api('post', '/inventory/' + ID + '/restock?userId=' + C, {
        quantity: 3,
        note: '  receive  ',
      }).expect(200);
      const audit = await prisma.inventoryAuditLog.findFirstOrThrow();
      expect(audit.actorId).toBe(A);
      expect(audit.note).toBe('receive');
      expect(audit.quantityDelta).toBe(3);
      expect(events).toHaveLength(1);
    });
    it('rejects exceeding capacity and keeps stock/audit/events unchanged', async () => {
      await api('post', '/inventory/' + ID + '/restock', {
        quantity: 91,
      }).expect(409);
      expect(
        (
          await prisma.inventory.findUniqueOrThrow({
            where: { id: BigInt(ID) },
          })
        ).stock,
      ).toBe(10);
      expect(await prisma.inventoryAuditLog.count()).toBe(0);
      expect(events).toHaveLength(0);
    });
    it('rejects stock below a real reservation and permits exact reserved stock', async () => {
      const order = await prisma.order.create({
        data: {
          orderCode: 'HTTP-HOLD',
          userId: C,
          shippingRecipient: 'Test',
          shippingPhone: '0900000000',
          shippingAddress: 'VN',
        },
      });
      await prisma.$queryRaw`SELECT fn_reserve_stock(${BigInt(ID)}::bigint,${order.id}::uuid,5,15)`;
      await api('put', '/inventory/' + ID, { stock: 4 }).expect(409);
      await api('put', '/inventory/' + ID, { stock: 5 }).expect(200);
      expect(
        (
          await prisma.inventory.findUniqueOrThrow({
            where: { id: BigInt(ID) },
          })
        ).availableStock,
      ).toBe(0);
    });
    it('returns 404 for a valid missing ID and 400 for invalid IDs', async () => {
      await api('get', '/inventory/9223372036854775807', undefined).expect(404);
      await api('get', '/inventory/9223372036854775808', undefined).expect(400);
      await api('get', '/inventory/01', undefined).expect(400);
    });
  },
);
