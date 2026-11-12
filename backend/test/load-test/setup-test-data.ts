/**
 * SETUP TEST DATA FOR CONCURRENCY OVERSELL LOAD TEST (Task 32: NFR-04.1 & NFR-01)
 *
 * Chức năng:
 * 1. Khởi tạo sản phẩm test 'TEST-FLASH-SALE-01' (SKU: SKU-LOADTEST-OVERSELL).
 * 2. Dọn dẹp đơn hàng và reservation cũ của sản phẩm này.
 * 3. Thiết lập tồn kho ban đầu: stock = 10, reserved_stock = 0 tại kho active (WH-HN01).
 * 4. Lấy 100 tài khoản customer hợp lệ.
 * 5. Ký 100 JWT Access Token hợp lệ (HS256 với JWT_ACCESS_SECRET).
 * 6. Xuất metadata ra `load-tests/test-data.json`.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

const envCandidates = [
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(__dirname, '../../../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

export const TEST_SKU = 'SKU-LOADTEST-OVERSELL';
export const INITIAL_STOCK = 10;
export const TOTAL_CUSTOMERS = 100;

async function setupTestData() {
  console.log('====================================================');
  console.log('🚀 [TASK 32] KHỞI TẠO DỮ LIỆU KIỂM THỬ TRANH MUA CONCURRENCY');
  console.log('====================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const jwtAccessSecret = process.env.JWT_ACCESS_SECRET;
  if (!jwtAccessSecret) {
    throw new Error('JWT_ACCESS_SECRET is not set in .env');
  }
  const jwtService = new JwtService({ secret: jwtAccessSecret });

  try {
    // 1. Kiểm tra kho hàng active
    let warehouse = await prisma.warehouse.findFirst({
      where: { code: 'WH-HN01', isActive: true },
    });
    if (!warehouse) {
      warehouse = await prisma.warehouse.findFirst({
        where: { isActive: true },
      });
    }
    if (!warehouse) {
      throw new Error('Không tìm thấy kho hàng active nào trong hệ thống!');
    }
    console.log(
      `📦 Kho hàng được chọn: ${warehouse.name} (${warehouse.code}) - Vùng: ${warehouse.region}`,
    );

    // 2. Kiểm tra danh mục sản phẩm
    let category = await prisma.category.findFirst({
      where: { isActive: true },
    });
    if (!category) {
      category = await prisma.category.create({
        data: {
          name: 'Danh mục Test Concurrency',
          slug: 'danh-muc-test-concurrency',
          isActive: true,
        },
      });
    }

    // 3. Tìm hoặc tạo sản phẩm kiểm thử tranh mua
    let product = await prisma.product.findUnique({
      where: { sku: TEST_SKU },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          sku: TEST_SKU,
          name: 'Sản phẩm Test Concurrency Oversell (10 tồn kho)',
          slug: 'san-pham-test-concurrency-oversell',
          categoryId: category.id,
          basePrice: 100000,
          discountPercent: 0,
          isActive: true,
        },
      });
      console.log(
        `✨ Đã tạo mới sản phẩm test: ${product.name} (ID: ${product.id})`,
      );
    } else {
      console.log(
        `ℹ️ Tìm thấy sản phẩm test đã có: ${product.name} (ID: ${product.id})`,
      );
      if (!product.isActive) {
        product = await prisma.product.update({
          where: { id: product.id },
          data: { isActive: true },
        });
      }
    }

    // 4. Dọn dẹp các đơn hàng & reservation cũ của sản phẩm này
    const existingOrderItems = await prisma.orderItem.findMany({
      where: { productId: product.id },
      select: { orderId: true, id: true },
    });

    if (existingOrderItems.length > 0) {
      const orderIds = [
        ...new Set(
          existingOrderItems.map(
            (item: { orderId: string; id: string }) => item.orderId,
          ),
        ),
      ];
      const orderItemIds = existingOrderItems.map(
        (item: { orderId: string; id: string }) => item.id,
      );
      console.log(
        `🧹 Dọn dẹp ${orderIds.length} đơn hàng test cũ liên quan tới sản phẩm...`,
      );

      await prisma.stockReservation.deleteMany({
        where: { orderItemId: { in: orderItemIds } },
      });
      await prisma.orderStatusHistory.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: orderIds } },
      });
      console.log('✅ Đã xóa sạch dữ liệu đơn hàng cũ.');
    }

    // 5. Khởi tạo / Reset tồn kho: stock = INITIAL_STOCK (10), reserved_stock = 0
    // available_stock là GENERATED ALWAYS AS (stock - reserved_stock) STORED nên dùng raw query
    await prisma.$executeRaw`
      INSERT INTO "inventory" ("product_id", "warehouse_id", "stock", "reserved_stock", "updated_at")
      VALUES (${product.id}::uuid, ${warehouse.id}::uuid, ${INITIAL_STOCK}, 0, NOW())
      ON CONFLICT ("product_id", "warehouse_id")
      DO UPDATE SET stock = ${INITIAL_STOCK}, reserved_stock = 0, updated_at = NOW()
    `;

    const inventory = await prisma.inventory.findFirstOrThrow({
      where: { productId: product.id, warehouseId: warehouse.id },
    });
    console.log(
      `📊 Tồn kho thiết lập: stock=${inventory.stock}, reserved_stock=${inventory.reservedStock}, available_stock=${inventory.stock - inventory.reservedStock}`,
    );

    // 6. Lấy danh sách 100 customer
    const customers = await prisma.user.findMany({
      where: {
        role: UserRole.CUSTOMER,
        isActive: true,
        mustChangePassword: false,
      },
      take: TOTAL_CUSTOMERS,
      select: {
        id: true,
        email: true,
        fullName: true,
      },
      orderBy: { email: 'asc' },
    });

    if (customers.length < TOTAL_CUSTOMERS) {
      console.warn(
        `⚠️ Số lượng customer trong DB (${customers.length}) ít hơn yêu cầu (${TOTAL_CUSTOMERS}). Tiến hành tạo thêm...`,
      );
      const needed = TOTAL_CUSTOMERS - customers.length;
      const now = new Date();
      for (let i = 1; i <= needed; i++) {
        const email = `k6_cust_${Date.now()}_${i}@test.local`;
        const newUser = await prisma.user.create({
          data: {
            email,
            username: `k6_cust_${Date.now()}_${i}`,
            passwordHash:
              '$2b$10$xyzFakeHashForK6LoadTestingPurposeOnly1234567890',
            fullName: `K6 Customer Test ${i}`,
            phone: `0999${String(i).padStart(6, '0')}`,
            role: UserRole.CUSTOMER,
            isActive: true,
            mustChangePassword: false,
            emailVerifiedAt: now,
          },
          select: { id: true, email: true, fullName: true },
        });
        customers.push(newUser);
      }
    }

    console.log(
      `👥 Đã lấy ${customers.length} tài khoản khách hàng chuẩn bị cấp JWT Token.`,
    );

    // 7. Sinh JWT Token cho từng khách hàng
    const userTokens = customers
      .slice(0, TOTAL_CUSTOMERS)
      .map(
        (
          user: { id: string; email: string; fullName: string },
          idx: number,
        ) => {
          const payload = {
            sub: user.id,
            type: 'access',
          };
          const token = jwtService.sign(payload, { expiresIn: '2h' });
          return {
            vuIndex: idx + 1,
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            token,
          };
        },
      );

    // 8. Xuất file test-data.json ra thư mục load-tests
    const testDataOutput = {
      createdAt: new Date().toISOString(),
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      warehouseId: warehouse.id,
      warehouseRegion: warehouse.region,
      inventoryId: inventory.id.toString(),
      initialStock: INITIAL_STOCK,
      totalVUs: TOTAL_CUSTOMERS,
      targetEndpoint: '/orders',
      localApiUrl: 'http://127.0.0.1:3001',
      dockerApiUrl: 'http://host.docker.internal:3001',
      users: userTokens,
    };

    const targetDirs = [
      path.resolve(__dirname, '../../../load-tests'),
      path.resolve(__dirname, '../load-test'),
    ];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const outPath = path.join(dir, 'test-data.json');
      fs.writeFileSync(
        outPath,
        JSON.stringify(testDataOutput, null, 2),
        'utf-8',
      );
      console.log(`💾 Đã lưu cấu hình dữ liệu test vào: ${outPath}`);
    }

    console.log('\n====================================================');
    console.log('✅ KHỞI TẠO TEST DATA HOÀN TẤT!');
    console.log(`- Sản phẩm: ${product.name} (ID: ${product.id})`);
    console.log(`- Kho: ${warehouse.code} | Stock ban đầu = ${INITIAL_STOCK}`);
    console.log(`- Tổng số người dùng giả lập (VUs): ${userTokens.length}`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('❌ Lỗi khi khởi tạo test data:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void setupTestData();
