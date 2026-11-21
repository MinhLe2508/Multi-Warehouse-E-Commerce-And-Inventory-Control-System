import 'dotenv/config';

import { createHash } from 'node:crypto';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { InventoryAlertService } from '../src/inventory/inventory-alert.service';
import {
  DEMO_CATEGORIES,
  DEMO_PRODUCTS,
  DEMO_WAREHOUSES,
  type DemoWarehouseCode,
} from './demo-catalog';
import { EXTRA_CATEGORIES, EXTRA_PRODUCTS } from './seed-data/catalog';
import { KNOWLEDGE_DOCUMENTS, LEGACY_KNOWLEDGE_HASHES } from './seed-data/knowledge';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const accounts = [
  { username: 'admin', fullName: 'Admin', oldName: 'Admin Demo', role: UserRole.ADMIN },
  { username: 'staff', fullName: 'Staff', oldName: 'Nhân viên kho Demo', role: UserRole.WAREHOUSE_STAFF },
  { username: 'customer', fullName: 'Customer', oldName: 'Khách hàng Demo', role: UserRole.CUSTOMER },
] as const;

const categories = [...DEMO_CATEGORIES, ...EXTRA_CATEGORIES];
const products = [
  ...DEMO_PRODUCTS.map((product) => ({
    ...product,
    imageUrl: `/products/${product.slug}.webp`,
    threshold: null,
  })),
  ...EXTRA_PRODUCTS.map((product) => ({ ...product, threshold: 1 })),
];

async function seedCatalog(tx: Prisma.TransactionClient) {
  await tx.category.createMany({ data: categories, skipDuplicates: true });
  const catalogCategories = await tx.category.findMany({
    where: { slug: { in: categories.map(({ slug }) => slug) } },
    select: { slug: true, id: true },
  });
  const categoryIds = new Map(catalogCategories.map(({ slug, id }) => [slug, id]));

  // Đổi SKU có chọn lọc trên sản phẩm cũ để giữ ID và liên kết đơn hàng.
  // SKU tại thời điểm mua vẫn nằm trong snapshot của từng dòng hàng.
  for (const { legacySku, sku, slug } of DEMO_PRODUCTS) {
    const current = await tx.product.findUnique({
      where: { sku: legacySku, slug },
      select: { id: true },
    });
    if (!current) continue;
    if (await tx.product.findUnique({ where: { sku }, select: { id: true } })) {
      console.warn(`Bỏ qua đổi SKU ${legacySku} vì mã ${sku} đang được dùng.`);
      continue;
    }
    await tx.product.updateMany({ where: { id: current.id, sku: legacySku }, data: { sku } });
  }

  const createdProducts = await tx.product.createManyAndReturn({
    data: products.map(({ sku, slug, name, description, category, basePrice, costPrice, imageUrl }) => ({
      sku, slug, name, description, basePrice, costPrice, imageUrl,
      categoryId: categoryIds.get(category),
    })),
    select: { sku: true, id: true },
    skipDuplicates: true,
  });
  const productIds = new Map(createdProducts.map(({ sku, id }) => [sku, id]));

  // Bổ sung ảnh cho sản phẩm mẫu đã nạp. Ảnh Admin đã chọn vẫn được giữ.
  const illustrations = Prisma.join(
    EXTRA_PRODUCTS.map(({ sku, slug, imageUrl }) => Prisma.sql`(${sku}, ${slug}, ${imageUrl})`),
  );
  await tx.$executeRaw`
    UPDATE products AS product
    SET image_url = illustration.image_url, updated_at = NOW()
    FROM (VALUES ${illustrations}) AS illustration(sku, slug, image_url)
    WHERE product.sku = illustration.sku
      AND product.slug = illustration.slug
      AND product.image_url IS NULL
  `;

  await tx.warehouse.createMany({ data: [...DEMO_WAREHOUSES], skipDuplicates: true });
  if (productIds.size === 0) return;

  // Khóa kho theo cùng thứ tự với luồng nhập kho trước khi kiểm tra sức chứa.
  const warehouses = await tx.$queryRaw<
    { id: string; code: DemoWarehouseCode; capacity: number | null }[]
  >`
    SELECT id, code, capacity
      FROM warehouses
     WHERE code = ANY(${DEMO_WAREHOUSES.map(({ code }) => code)}::text[]) AND is_active
     ORDER BY id
       FOR UPDATE
  `;
  const existingTotals = await tx.inventory.groupBy({
    by: ['warehouseId'],
    where: { warehouseId: { in: warehouses.map(({ id }) => id) } },
    _sum: { stock: true },
  });
  const warehouseStock = new Map(
    existingTotals.map(({ warehouseId, _sum }) => [warehouseId, _sum.stock ?? 0]),
  );
  const inventoryIds: bigint[] = [];
  const auditRows: Prisma.InventoryAuditLogCreateManyInput[] = [];
  const constrained = new Set<DemoWarehouseCode>();

  for (const product of products) {
    const productId = productIds.get(product.sku);
    if (!productId) continue;
    for (const { id: warehouseId, code, capacity } of warehouses) {
      const planned = product.stock[code];
      if (planned === undefined) continue;
      const occupied = warehouseStock.get(warehouseId) ?? 0;
      const stock = capacity === null ? planned : Math.min(planned, Math.max(0, capacity - occupied));
      if (stock < planned) constrained.add(code);
      if (planned > 0 && stock === 0) continue;

      const [inventory] = await tx.$queryRaw<{ id: bigint }[]>`
        INSERT INTO inventory (product_id, warehouse_id, stock, threshold, last_restocked_at, updated_at)
        VALUES (
          ${productId}::uuid, ${warehouseId}::uuid, ${stock}, ${product.threshold}::integer,
          CASE WHEN ${stock}::integer > 0 THEN NOW() END, NOW()
        )
        ON CONFLICT (product_id, warehouse_id) DO NOTHING
        RETURNING id
      `;
      if (!inventory) continue;
      warehouseStock.set(warehouseId, occupied + stock);
      inventoryIds.push(inventory.id);
      if (stock > 0) {
        auditRows.push({
          inventoryId: inventory.id,
          reason: 'RESTOCK',
          stockBefore: 0,
          stockAfter: stock,
          reservedBefore: 0,
          reservedAfter: 0,
          quantityDelta: stock,
          referenceType: 'demo_seed',
          note: 'Nhập tồn đầu kỳ cho dữ liệu mẫu',
        });
      }
    }
  }

  if (auditRows.length) await tx.inventoryAuditLog.createMany({ data: auditRows });
  await new InventoryAlertService().evaluate(tx, inventoryIds);
  if (constrained.size) {
    console.warn(`Đã giới hạn tồn của sản phẩm mới theo sức chứa kho ${[...constrained].join(', ')}.`);
  }
}

async function seedKnowledge(tx: Prisma.TransactionClient) {
  for (const doc of KNOWLEDGE_DOCUMENTS) {
    const existing = await tx.kbDocument.findMany({
      where: { title: doc.title, docType: doc.docType, chunkIndex: 0 },
      select: { id: true, content: true },
    });
    if (!existing.length) {
      await tx.kbDocument.create({ data: doc });
      continue;
    }
    for (const row of existing) {
      if (row.content === doc.content ||
          !LEGACY_KNOWLEDGE_HASHES.has(createHash('sha256').update(row.content).digest('hex'))) continue;

      // Chỉ thay nội dung gốc đã biết. Xóa vector cũ để có thể tái đồng bộ.
      await tx.$executeRaw`
        UPDATE kb_documents
           SET content = ${doc.content}, embedding = NULL, token_count = NULL, updated_at = NOW()
         WHERE id = ${row.id}::uuid AND content = ${row.content}
      `;
    }
  }
}

async function seedAccounts(tx: Prisma.TransactionClient, hashes: string[]) {
  let newStaffId: string | undefined;
  for (const [index, { username, fullName, oldName, role }] of accounts.entries()) {
    const email = `${username}@gmail.com`;
    const existing = await tx.user.findUnique({
      where: { username },
      select: { id: true, email: true, fullName: true },
    });
    const legacyEmail = `${username}@demo.example.test`;
    if (existing && existing.email !== legacyEmail) continue;

    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      console.warn(`Tên email mẫu ${email} đang được sử dụng. Giữ lại các tài khoản hiện có.`);
      continue;
    }
    if (existing) {
      await tx.user.updateMany({
        where: { id: existing.id, email: legacyEmail },
        data: { email, ...(existing.fullName === oldName && { fullName }) },
      });
      continue;
    }
    const user = await tx.user.create({
      data: {
        username, email, fullName, role,
        passwordHash: hashes[index],
        emailVerifiedAt: new Date(),
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true },
    });
    if (role === UserRole.WAREHOUSE_STAFF) newStaffId = user.id;
  }
  return newStaffId;
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED?.toLowerCase() !== 'true') {
    throw new Error('Hãy bật ALLOW_DEMO_SEED=true khi chạy seed trên CSDL phát triển.');
  }

  const hashes = await Promise.all(accounts.map(({ username }) => bcrypt.hash(username, 10)));
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261121, 1)`;
      const newStaffId = await seedAccounts(tx, hashes);
      await seedCatalog(tx);
      if (newStaffId) {
        const warehouses = await tx.warehouse.findMany({
          where: { isActive: true, code: { in: ['WH-HN01', 'WH-HCM01'] } },
          select: { id: true },
        });
        await tx.warehouseStaffAssignment.createMany({
          data: warehouses.map(({ id: warehouseId }) => ({ userId: newStaffId, warehouseId })),
          skipDuplicates: true,
        });
      }
      await seedKnowledge(tx);
    },
    { timeout: 30_000 },
  );

  console.log(`Đã đồng bộ dữ liệu mẫu. Bộ dữ liệu gồm ${products.length} sản phẩm, ${categories.length} danh mục và ${KNOWLEDGE_DOCUMENTS.length} tài liệu RAG.`);
}

main()
  .catch((error: unknown) => {
    console.error('Không nạp được dữ liệu mẫu:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
