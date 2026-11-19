const { randomBytes, randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Prisma, UserRole } = require('@prisma/client');

const FIXTURE_DATABASE_ENV = 'E2E_TEST_DATABASE_URL';
const MANIFEST_VERSION = 1;
const ANALYTICS_DATE = '2026-01-15';
const SALE_PRICE = '125000.50';
const COST_PRICE = '75000.25';

class FixtureInputError extends Error {}

function fixtureNames(runId) {
  if (typeof runId !== 'string' || !/^[0-9a-f]{24}$/.test(runId)) {
    throw new FixtureInputError('runId phải gồm 24 ký tự hex viết thường.');
  }
  const prefix = `F122-${runId}`;
  const account = (suffix) => {
    const username = `${prefix.toLowerCase()}-${suffix}`;
    return { username, email: `${username}@example.test` };
  };
  return {
    prefix,
    users: {
      admin: account('admin'),
      staff: account('staff'),
      customerA: account('customer-a'),
      customerB: account('customer-b'),
    },
    warehouseCodes: { a: `${prefix}-A`, b: `${prefix}-B` },
    orderCodes: { a: `${prefix}-1`, b: `${prefix}-2`, pending: `${prefix}-3` },
    sku: `${prefix}-SKU`,
    kbSource: `https://example.test/e2e/${runId}/policy`,
  };
}

function fixtureDatabaseTarget(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new FixtureInputError(
      `Cần đặt ${FIXTURE_DATABASE_ENV} thành URL của PostgreSQL kiểm thử.`,
    );
  }
  const name = url.pathname.slice(1);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !url.hostname ||
    !/^cnpm_e2e_test_[a-z0-9_]{1,49}$/.test(name) ||
    (url.searchParams.get('schema') ?? 'public') !== 'public'
  ) {
    throw new FixtureInputError(
      `${FIXTURE_DATABASE_ENV} phải trỏ đến PostgreSQL kiểm thử riêng cnpm_e2e_test_* dùng schema public.`,
    );
  }
  return { host: url.hostname, port: url.port || '5432', name };
}

async function openFixtureDatabase(databaseUrl) {
  const target = fixtureDatabaseTarget(databaseUrl);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const [actual] = await prisma.$queryRaw`
      SELECT current_database() AS name, current_schema() AS schema
    `;
    if (actual?.name !== target.name || actual?.schema !== 'public') {
      throw new FixtureInputError(
        'Database hoặc schema đang kết nối khác với cấu hình kiểm thử.',
      );
    }
    return { prisma, target };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}

async function createInventory(tx, productId, warehouseId, stock, reserved) {
  // available_stock được PostgreSQL tính từ stock và reserved_stock.
  const [row] = await tx.$queryRaw`
    INSERT INTO inventory (product_id, warehouse_id, stock, reserved_stock, updated_at)
    VALUES (${productId}::uuid, ${warehouseId}::uuid, ${stock}, ${reserved}, NOW())
    RETURNING id::text AS id
  `;
  return { id: row.id, stock, reserved, available: stock - reserved };
}

async function createOrder(
  tx,
  { code, customer, product, status, lines, at, expiresAt },
) {
  const items = lines.map(({ warehouseId, inventoryId, quantity }) => ({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    warehouseId,
    inventoryId: BigInt(inventoryId),
    quantity,
    unitPrice: SALE_PRICE,
    lineTotal: new Prisma.Decimal(SALE_PRICE).mul(quantity),
  }));
  const total = items.reduce(
    (sum, item) => sum.add(item.lineTotal),
    new Prisma.Decimal(0),
  );
  const pending = status === 'PENDING_PAYMENT';
  const row = await tx.order.create({
    data: {
      orderCode: code,
      userId: customer.id,
      status,
      subtotal: total,
      grandTotal: total,
      shippingRecipient: 'Khách E2E',
      shippingPhone: '0900000000',
      shippingAddress: 'Địa chỉ mô phỏng E2E',
      createdAt: at,
      confirmedAt: pending ? null : at,
      reservationExpiresAt: expiresAt,
      items: { create: items },
      statusHistory: { create: { toStatus: status, createdAt: at } },
    },
    select: { id: true, orderCode: true, items: { select: { id: true } } },
  });

  if (expiresAt) {
    await tx.stockReservation.create({
      data: {
        orderId: row.id,
        orderItemId: row.items[0].id,
        inventoryId: items[0].inventoryId,
        quantity: items[0].quantity,
        expiresAt,
        createdAt: at,
      },
    });
  }
  return { id: row.id, code: row.orderCode };
}

async function createChat(tx, customerId, suffix, prefix) {
  const message = `Tin nhắn kiểm thử ${prefix} ${suffix}`;
  const row = await tx.chatSession.create({
    data: {
      userId: customerId,
      sessionToken: randomUUID(),
      messageCount: 1,
      messages: { create: { role: 'USER', content: message } },
    },
    select: { id: true },
  });
  return { id: row.id, message };
}

async function prepareE2e({
  databaseUrl = process.env[FIXTURE_DATABASE_ENV],
  runId = randomBytes(12).toString('hex'),
  password = process.env.E2E_FIXTURE_PASSWORD ??
    randomBytes(18).toString('hex'),
} = {}) {
  const names = fixtureNames(runId);
  fixtureDatabaseTarget(databaseUrl);
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password) > 72
  ) {
    throw new FixtureInputError(
      'Mật khẩu kiểm thử phải có ít nhất 8 ký tự, tối đa 72 byte.',
    );
  }
  const passwordHash = await bcrypt.hash(password, 4);
  const { prisma, target } = await openFixtureDatabase(databaseUrl);
  try {
    return await prisma.$transaction(
      async (tx) => {
        const soldAt = new Date(`${ANALYTICS_DATE}T10:00:00+07:00`);
        const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
        const users = {};
        for (const [key, role] of Object.entries({
          admin: UserRole.ADMIN,
          staff: UserRole.WAREHOUSE_STAFF,
          customerA: UserRole.CUSTOMER,
          customerB: UserRole.CUSTOMER,
        })) {
          users[key] = await tx.user.create({
            data: {
              ...names.users[key],
              fullName: `QA ${key}`,
              role,
              passwordHash,
              emailVerifiedAt: now,
              mustChangePassword: false,
            },
            select: { id: true, username: true, role: true },
          });
        }

        const warehouses = {};
        for (const [key, code] of Object.entries(names.warehouseCodes)) {
          warehouses[key] = await tx.warehouse.create({
            data: { code, name: `Kho QA ${key}`, region: 'VN', capacity: 100 },
            select: { id: true, code: true },
          });
        }
        const product = await tx.product.create({
          data: {
            sku: names.sku,
            slug: names.sku.toLowerCase(),
            name: `Sản phẩm QA ${names.prefix}`,
            basePrice: SALE_PRICE,
            costPrice: COST_PRICE,
          },
          select: { id: true, name: true, sku: true },
        });
        const inventory = {
          a: await createInventory(tx, product.id, warehouses.a.id, 12, 0),
          b: await createInventory(tx, product.id, warehouses.b.id, 2, 1),
        };
        const line = (key, quantity) => ({
          warehouseId: warehouses[key].id,
          inventoryId: inventory[key].id,
          quantity,
        });
        const orders = {
          a: await createOrder(tx, {
            code: names.orderCodes.a,
            customer: users.customerA,
            status: 'CONFIRMED',
            product,
            at: soldAt,
            lines: [line('a', 2), line('b', 1)],
          }),
          b: await createOrder(tx, {
            code: names.orderCodes.b,
            customer: users.customerB,
            status: 'DELIVERED',
            product,
            at: soldAt,
            lines: [line('b', 1)],
          }),
          pending: await createOrder(tx, {
            code: names.orderCodes.pending,
            customer: users.customerA,
            status: 'PENDING_PAYMENT',
            product,
            at: new Date(now.getTime() - 16 * 60_000),
            expiresAt: new Date(now.getTime() - 60_000),
            lines: [line('b', 1)],
          }),
        };

        const chat = {
          a: await createChat(tx, users.customerA.id, 'A', names.prefix),
          b: await createChat(tx, users.customerB.id, 'B', names.prefix),
        };
        const kb = await tx.kbDocument.create({
          data: {
            title: `Chính sách QA ${names.prefix}`,
            docType: 'POLICY',
            content: 'Đoạn dữ liệu tổng hợp dùng cho kiểm thử E2E.',
            sourceUrl: names.kbSource,
          },
          select: { id: true },
        });

        return {
          version: MANIFEST_VERSION,
          database: target,
          runId,
          prefix: names.prefix,
          users,
          warehouses,
          product,
          inventory,
          orders,
          chat,
          kbDocumentId: kb.id,
          expected: {
            analyticsDate: ANALYTICS_DATE,
            orderCount: 3,
            costPrice: COST_PRICE,
            revenueA: '250001.00',
            revenueB: '250001.00',
          },
        };
      },
      { timeout: 15000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

function handleFixtureCliError(error) {
  const message =
    error instanceof FixtureInputError
      ? error.message
      : `Thao tác fixture thất bại (${error?.code ?? error?.name ?? 'unknown'}). Kiểm tra database thử nghiệm và migrations.`;
  console.error(message);
  process.exitCode = 1;
}

module.exports = {
  FIXTURE_DATABASE_ENV,
  MANIFEST_VERSION,
  FixtureInputError,
  fixtureNames,
  fixtureDatabaseTarget,
  openFixtureDatabase,
  prepareE2e,
  handleFixtureCliError,
};

if (require.main === module) {
  prepareE2e()
    .then((manifest) => console.log(JSON.stringify(manifest, null, 2)))
    .catch(handleFixtureCliError);
}
