import { type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { createInventoryHttpApp } from '../../test/support/inventory-http-app';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '33333333-3333-4333-8333-333333333333';
const PRODUCT = '44444444-4444-4444-8444-444444444444';
const WAREHOUSE = '55555555-5555-4555-8555-555555555555';
const secret = 'inventory-http-test-only-secret';
const create = { productId: PRODUCT, warehouseId: WAREHOUSE };
const endpoints = [
  ['get', '/inventory', undefined, 200],
  ['get', '/inventory/alerts', undefined, 200],
  ['get', '/inventory/1', undefined, 200],
  ['post', '/inventory', create, 201],
  ['post', '/inventory/1/restock', { quantity: 1 }, 200],
  ['put', '/inventory/1', { stock: 0 }, 200],
] as const;

describe('Inventory HTTP boundary — real JWT/guards/DTOs, isolated service double', () => {
  let app: INestApplication;
  const savedSecret = process.env.JWT_ACCESS_SECRET;
  const users = new Map<string, Record<string, unknown>>();
  const prisma = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users.get(where.id) ?? null),
      ),
    },
  };
  const inventory = {
    findAll: jest.fn(),
    findAlerts: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    restock: jest.fn(),
    updateStock: jest.fn(),
  };
  const jwt = new JwtService({ secret });
  const token = (
    sub = ADMIN,
    extra: Record<string, unknown> = {},
    options: Record<string, unknown> = {},
  ) =>
    jwt.sign(
      { sub, type: 'access', ...extra },
      { algorithm: 'HS256', expiresIn: '15m', ...options },
    );
  const call = (method: string, url: string, body: unknown, sub = ADMIN) => {
    const agent = request(app.getHttpServer());
    const req =
      method === 'get'
        ? agent.get(url)
        : method === 'put'
          ? agent.put(url)
          : agent.post(url);
    req.set('Authorization', `Bearer ${token(sub)}`);
    return body === undefined ? req : req.send(body as object);
  };
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    app = await createInventoryHttpApp(prisma, inventory);
  });
  afterAll(async () => {
    await app.close();
    if (savedSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = savedSecret;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    for (const [id, role] of [
      [ADMIN, UserRole.ADMIN],
      [STAFF, UserRole.WAREHOUSE_STAFF],
      [CUSTOMER, UserRole.CUSTOMER],
    ] as const)
      users.set(id, {
        id,
        role,
        username: role,
        email: role + '@example.test',
        emailVerifiedAt: new Date(),
        isActive: true,
        mustChangePassword: false,
      });
    inventory.findAll.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    inventory.findAlerts.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    inventory.findOne.mockImplementation((id: string) =>
      Promise.resolve({ id }),
    );
    inventory.create.mockResolvedValue({ id: '1' });
    inventory.restock.mockResolvedValue({ id: '1' });
    inventory.updateStock.mockResolvedValue({ id: '1' });
  });
  it.each(endpoints)(
    'requires authentication: %s %s',
    async (method, url, body) => {
      const agent = request(app.getHttpServer());
      const req =
        method === 'get'
          ? agent.get(url)
          : method === 'put'
            ? agent.put(url)
            : agent.post(url);
      const response = await (body === undefined ? req : req.send(body));
      expect(response.status).toBe(401);
      expect(
        Object.values(inventory).some((mock) => mock.mock.calls.length),
      ).toBe(false);
    },
  );
  for (const sub of [ADMIN, STAFF, CUSTOMER])
    it.each(endpoints)(`${sub}: %s %s`, async (method, url, body, success) => {
      const response = await call(method, url, body, sub);
      expect(response.status).toBe(
        sub === ADMIN ||
          (sub === STAFF && (method === 'get' || url.endsWith('/restock')))
          ? success
          : 403,
      );
    });
  it('takes audit actor from the verified account', async () => {
    await call('post', '/inventory', create).expect(201);
    expect(inventory.create).toHaveBeenCalledWith(
      expect.objectContaining(create),
      ADMIN,
    );
  });
  it('routes /alerts to findAlerts and uses the current DB role', async () => {
    await call('get', '/inventory/alerts', undefined, STAFF).expect(200);
    expect(inventory.findAlerts).toHaveBeenCalledWith(
      expect.anything(),
      UserRole.WAREHOUSE_STAFF,
      STAFF,
    );
    expect(inventory.findOne).not.toHaveBeenCalled();
  });
  it('does not trust an ADMIN role inside a signed old token', async () => {
    const response = await request(app.getHttpServer())
      .post('/inventory')
      .auth(token(STAFF, { role: 'ADMIN' }), { type: 'bearer' })
      .send(create);
    expect(response.status).toBe(403);
    expect(inventory.create).not.toHaveBeenCalled();
  });
  it.each(['locked', 'unverified', 'deleted', 'password-change'])(
    'rejects account state %s',
    async (state) => {
      const user = users.get(STAFF)!;
      if (state === 'locked') user.isActive = false;
      if (state === 'unverified') user.emailVerifiedAt = null;
      if (state === 'deleted') users.delete(STAFF);
      if (state === 'password-change') user.mustChangePassword = true;
      const response = await call('get', '/inventory', undefined, STAFF);
      expect(response.status).toBe(state === 'password-change' ? 403 : 401);
      if (state === 'password-change')
        expect(response.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect(inventory.findAll).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['expired', () => token(ADMIN, {}, { expiresIn: -1 })],
    ['refresh', () => token(ADMIN, { type: 'refresh' })],
    ['bad-sub', () => token('bad')],
    ['missing-exp', () => jwt.sign({ sub: ADMIN, type: 'access' })],
    [
      'wrong-secret',
      () =>
        new JwtService({ secret: 'wrong-secret' }).sign(
          { sub: ADMIN, type: 'access' },
          { expiresIn: '15m' },
        ),
    ],
    ['malformed', () => 'invalid.token'],
  ])('rejects token %s', async (_label, make) => {
    const response = await request(app.getHttpServer())
      .get('/inventory')
      .auth((make as () => string)(), { type: 'bearer' });
    expect(response.status).toBe(401);
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(inventory.findAll).not.toHaveBeenCalled();
  });
  it('does not take a token from query parameters', async () => {
    await request(app.getHttpServer())
      .get('/inventory')
      .query({ token: token() })
      .expect(401);
  });
  it.each([
    '0',
    '01',
    '-1',
    '1.5',
    '1e3',
    'abc',
    '9223372036854775808',
    '900719925474099312345',
  ])('rejects invalid inventory id %s before service', async (id) => {
    await call('get', '/inventory/' + id, undefined).expect(400);
    expect(inventory.findOne).not.toHaveBeenCalled();
  });
  it('preserves a BIGINT above Number.MAX_SAFE_INTEGER', async () => {
    await call('get', '/inventory/9007199254740993', undefined).expect(200);
    expect(inventory.findOne).toHaveBeenCalledWith(
      '9007199254740993',
      UserRole.ADMIN,
    );
  });
  it.each([
    ['initialStock', null],
    ['initialStock', -1],
    ['initialStock', 1.5],
    ['initialStock', '1'],
    ['initialStock', true],
    ['initialStock', 2147483648],
    ['threshold', -1],
    ['threshold', '1'],
    ['threshold', 2147483648],
    ['productId', 'bad'],
    ['warehouseId', null],
    ['note', {}],
    ['note', 'x'.repeat(501)],
  ])('rejects bad create field %s (%#)', async (key, value) => {
    await call('post', '/inventory', {
      ...create,
      [key as string]: value,
    }).expect(400);
    expect(inventory.create).not.toHaveBeenCalled();
  });
  it.each([null, 0, -1, 1.5, '1', true, 2147483648])(
    'rejects bad restock quantity %s',
    async (quantity) => {
      await call('post', '/inventory/1/restock', { quantity }).expect(400);
      expect(inventory.restock).not.toHaveBeenCalled();
    },
  );
  it.each([null, -1, 1.5, '1', true, 2147483648])(
    'rejects bad stock %s',
    async (stock) => {
      await call('put', '/inventory/1', { stock }).expect(400);
      expect(inventory.updateStock).not.toHaveBeenCalled();
    },
  );
  it('accepts stock zero and threshold null as distinct valid values', async () => {
    await call('put', '/inventory/1', { stock: 0, threshold: null }).expect(
      200,
    );
    expect(inventory.updateStock).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ stock: 0, threshold: null }),
      ADMIN,
    );
  });
  it('accepts default initial stock and nullable threshold, trims note', async () => {
    await call('post', '/inventory', {
      ...create,
      threshold: null,
      note: '  reason  ',
    }).expect(201);
    expect(inventory.create).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: null, note: 'reason' }),
      ADMIN,
    );
  });
  it.each([
    'reservedStock',
    'availableStock',
    'version',
    'actorId',
    'userId',
    'role',
    'costPrice',
  ])('rejects mass-assignment field %s', async (key) => {
    await call('post', '/inventory', { ...create, [key]: 'tampered' }).expect(
      400,
    );
    expect(inventory.create).not.toHaveBeenCalled();
  });
  it.each([
    'limit=101',
    'limit=0',
    'limit=1.5',
    'limit=0x10',
    'offset=2147483648',
    'offset=9007199254740993',
    'offset=-1',
    'offset=1e3',
    'offset=1.0',
    'lowStockOnly=yes',
    'warehouseId=bad',
    'limit=1&limit=2',
    'unexpected=1',
  ])('rejects bad query %s', async (query) => {
    await call('get', '/inventory?' + query, undefined).expect(400);
    expect(inventory.findAll).not.toHaveBeenCalled();
  });
  it('parses false as false and decimal pagination as numbers', async () => {
    await call(
      'get',
      '/inventory?lowStockOnly=false&limit=10&offset=2',
      undefined,
    ).expect(200);
    expect(inventory.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ lowStockOnly: false, limit: 10, offset: 2 }),
      UserRole.ADMIN,
    );
  });
  it('normalizes alert status and rejects overflow offset on alerts', async () => {
    await call('get', '/inventory/alerts?status=resolved', undefined).expect(
      200,
    );
    expect(inventory.findAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'RESOLVED' }),
      UserRole.ADMIN,
    );
    await call('get', '/inventory/alerts?offset=2147483648', undefined).expect(
      400,
    );
  });
  it('hides infrastructure details and retains HTTP 500', async () => {
    prisma.user.findUnique.mockRejectedValueOnce(
      new Error('private database secret'),
    );
    const response = await call('get', '/inventory', undefined);
    expect(response.status).toBe(500);
    expect(response.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain(
      'private database secret',
    );
  });
  it('returns the shared error envelope for malformed JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/inventory')
      .auth(token(), { type: 'bearer' })
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      path: '/inventory',
    });
  });
  for (const [method, path, body] of [
    ['post', '/inventory/1/restock', { quantity: 1 }],
    ['put', '/inventory/1', { stock: 0 }],
  ] as const) {
    it.each([
      'reservedStock',
      'availableStock',
      'version',
      'actorId',
      'userId',
      'role',
      'costPrice',
    ])(`${method} ${path}: rejects injected field %s`, async (key) => {
      await call(method, path, { ...body, [key]: 'tampered' }).expect(400);
      expect(inventory.restock).not.toHaveBeenCalled();
      expect(inventory.updateStock).not.toHaveBeenCalled();
    });
  }
  it('permits browser preflight with Authorization without requiring a JWT', async () => {
    const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
    const response = await request(app.getHttpServer())
      .options('/inventory')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Authorization,Content-Type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(
      Object.values(inventory).some((mock) => mock.mock.calls.length),
    ).toBe(false);
  });
});
