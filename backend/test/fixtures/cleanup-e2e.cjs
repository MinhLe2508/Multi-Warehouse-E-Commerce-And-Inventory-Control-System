const { readFile } = require('node:fs/promises');
const {
  FIXTURE_DATABASE_ENV,
  MANIFEST_VERSION,
  FixtureInputError,
  fixtureDatabaseTarget,
  fixtureNames,
  openFixtureDatabase,
  handleFixtureCliError,
} = require('./prepare-e2e.cjs');

function uuid(value, field) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new FixtureInputError(`ID ${field} trong manifest không hợp lệ.`);
  }
  return value;
}

function inventoryId(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  ) {
    throw new FixtureInputError(
      'Inventory ID trong manifest phải là chuỗi BIGINT dương.',
    );
  }
  return BigInt(value);
}

function cleanupScopes(manifest, databaseUrl) {
  if (manifest?.version !== MANIFEST_VERSION) {
    throw new FixtureInputError('Phiên bản manifest fixture không hợp lệ.');
  }
  const names = fixtureNames(manifest.runId);
  const target = fixtureDatabaseTarget(databaseUrl);
  if (
    manifest.prefix !== names.prefix ||
    Object.keys(target).some((key) => manifest.database?.[key] !== target[key])
  ) {
    throw new FixtureInputError(
      'Manifest không khớp mã lượt chạy hoặc database kiểm thử đã dùng khi tạo dữ liệu.',
    );
  }

  const userScopes = Object.fromEntries(
    Object.entries(names.users).map(([key, account]) => [
      key,
      {
        ...account,
        id: uuid(manifest.users?.[key]?.id, `users.${key}`),
      },
    ]),
  );
  const warehouses = Object.entries(names.warehouseCodes).map(
    ([key, code]) => ({
      id: uuid(manifest.warehouses?.[key]?.id, `warehouses.${key}`),
      code,
    }),
  );
  const orders = Object.entries({
    a: 'customerA',
    b: 'customerB',
    pending: 'customerA',
  }).map(([key, customer]) => ({
    id: uuid(manifest.orders?.[key]?.id, `orders.${key}`),
    orderCode: names.orderCodes[key],
    user: userScopes[customer],
  }));
  const chat = ['a', 'b'].map((key) => ({
    id: uuid(manifest.chat?.[key]?.id, `chat.${key}`),
    user: key === 'a' ? userScopes.customerA : userScopes.customerB,
  }));
  const product = {
    id: uuid(manifest.product?.id, 'product'),
    sku: names.sku,
  };
  const kbDocument = {
    id: uuid(manifest.kbDocumentId, 'kbDocumentId'),
    sourceUrl: names.kbSource,
  };
  const inventory = ['a', 'b'].map((key, index) => ({
    id: inventoryId(manifest.inventory?.[key]?.id),
    product,
    warehouse: warehouses[index],
  }));

  return {
    orders,
    chat,
    kbDocument,
    inventory,
    product,
    warehouses,
    users: Object.values(userScopes),
  };
}

async function cleanupE2e(
  manifest,
  { databaseUrl = process.env[FIXTURE_DATABASE_ENV] } = {},
) {
  const scope = cleanupScopes(manifest, databaseUrl);
  const { prisma } = await openFixtureDatabase(databaseUrl);
  try {
    const deleted = await prisma.$transaction(
      async (tx) => {
        const work = [
          ['orders', tx.order, scope.orders],
          ['chatSessions', tx.chatSession, scope.chat],
          ['kbDocuments', tx.kbDocument, [scope.kbDocument]],
          ['users', tx.user, scope.users],
          ['inventory', tx.inventory, scope.inventory],
          ['products', tx.product, [scope.product]],
          ['warehouses', tx.warehouse, scope.warehouses],
        ];
        const counts = {};
        for (const [label, model, rows] of work) {
          const ids = rows.map(({ id }) => id);
          if (new Set(ids).size !== ids.length) {
            throw new FixtureInputError(`Manifest chứa ID lặp trong ${label}.`);
          }
          const found = await model.count({ where: { id: { in: ids } } });
          counts[label] = await model.count({ where: { OR: rows } });
          if (found !== counts[label]) {
            throw new FixtureInputError(
              `Có ID trong ${label} không thuộc lượt fixture này.`,
            );
          }
        }

        for (const [label, model, rows] of work) {
          const where =
            label === 'products'
              ? { OR: rows, inventory: { none: {} }, cartItems: { none: {} } }
              : { OR: rows };
          const result = await model.deleteMany({ where });
          if (result.count !== counts[label]) {
            throw new FixtureInputError(
              `Phạm vi dọn ${label} đã thay đổi hoặc còn dữ liệu phụ thuộc. Thao tác đã được hoàn tác.`,
            );
          }
        }
        return counts;
      },
      { timeout: 15000 },
    );
    return { runId: manifest.runId, deleted };
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanupFromCli() {
  const filename = process.argv[2];
  if (!filename || process.argv.length !== 3) {
    throw new FixtureInputError(
      'Cách dùng: node test/fixtures/cleanup-e2e.cjs <manifest.json>',
    );
  }
  const bytes = await readFile(filename);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8';
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString(encoding).replace(/^\uFEFF/, ''));
  } catch {
    throw new FixtureInputError('Không đọc được JSON trong manifest fixture.');
  }
  const result = await cleanupE2e(manifest);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { cleanupE2e };

if (require.main === module) {
  cleanupFromCli().catch(handleFixtureCliError);
}
