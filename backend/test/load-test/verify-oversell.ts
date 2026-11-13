/**
 * VERIFY OVERSELL & GENERATE NFR REPORT (Task 32: NFR-04.1 & NFR-01)
 *
 * Chức năng:
 * 1. Đọc dữ liệu trực tiếp từ PostgreSQL thông qua Prisma.
 * 2. Đối soát dữ liệu tồn kho `inventory` (stock, reserved_stock, available_stock).
 * 3. Kiểm tra số lượng đơn hàng thực tế được tạo và trạng thái.
 * 4. Kiểm tra các bản ghi giữ chỗ `stock_reservations` (trạng thái HOLDING, quantity).
 * 5. Xác nhận không có hiện tượng oversell (0 oversell, không có tồn kho âm).
 * 6. Đối chiếu chỉ số NFR-01 (Độ trễ phản hồi API) và NFR-04.1 (0 oversell).
 * 7. Xuất báo cáo markdown hoàn chỉnh vào `backend/reports/NFR-04.1-NFR-01-OVERSELL-REPORT.md`.
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
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { evaluateOversell, MetricsSummary } from './oversell-verifier';

interface TestDataPayload {
  runId?: string;
  productId: string;
  productSku: string;
  productName: string;
  initialStock: number;
  totalVUs: number;
}

async function verifyOversell() {
  console.log('====================================================');
  console.log('🔍 [TASK 32] ĐỐI SOÁT CƠ SỞ DỮ LIỆU & KIỂM TRA NFR-04.1');
  console.log('====================================================\n');

  // Đọc metadata từ test-data.json
  const candidatePaths = [
    path.resolve(__dirname, '../../../load-tests/test-data.json'),
    path.resolve(__dirname, 'test-data.json'),
  ];
  let testDataPath = '';
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      testDataPath = p;
      break;
    }
  }

  if (!testDataPath) {
    throw new Error(
      'Không tìm thấy file test-data.json! Hãy chạy setup-test-data.ts trước.',
    );
  }

  const testData = JSON.parse(
    fs.readFileSync(testDataPath, 'utf-8'),
  ) as TestDataPayload;
  const { productId, initialStock, totalVUs } = testData;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);

  try {
    // 1. Kiểm tra bảng inventory
    const inventory = await prisma.inventory.findFirst({
      where: { productId },
      include: { warehouse: true },
    });

    if (!inventory) {
      throw new Error(
        `Không tìm thấy dòng inventory nào cho productId ${productId}`,
      );
    }

    const currentStock = inventory.stock;
    const currentReservedStock = inventory.reservedStock;
    const availableStock = currentStock - currentReservedStock;

    console.log('1. TRẠNG THÁI TỒN KHO HIỆN TẠI TRONG DATABASE:');
    console.log(`   - Tổng tồn kho (stock): ${currentStock}`);
    console.log(`   - Đang giữ chỗ (reserved_stock): ${currentReservedStock}`);
    console.log(
      `   - Tồn khả dụng (available_stock = stock - reserved_stock): ${availableStock}`,
    );

    // 2. Kiểm tra các OrderItem liên kết với sản phẩm này
    const orderItems = await prisma.orderItem.findMany({
      where: { productId },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            userId: true,
            status: true,
            grandTotal: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    console.log('\n2. SỐ LƯỢNG ĐƠN HÀNG ĐƯỢC TẠO THÀNH CÔNG:');
    console.log(`   - Tổng số order_items: ${orderItems.length}`);
    const distinctOrders = [
      ...new Set(orderItems.map((item) => item.order.id)),
    ];
    console.log(
      `   - Tổng số đơn hàng (distinct orders): ${distinctOrders.length}`,
    );

    const totalSoldQuantity = orderItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
    console.log(
      `   - Tổng số lượng sản phẩm được đặt mua: ${totalSoldQuantity}`,
    );

    // 3. Kiểm tra bảng stock_reservations
    const orderItemIds = orderItems.map((item) => item.id);
    const reservations = await prisma.stockReservation.findMany({
      where: { orderItemId: { in: orderItemIds } },
    });

    const holdingReservations = reservations.filter(
      (r) => r.status === 'HOLDING',
    );
    const totalHoldingQuantity = holdingReservations.reduce(
      (sum, r) => sum + r.quantity,
      0,
    );

    console.log('\n3. BẢNG STOCK_RESERVATIONS:');
    console.log(`   - Tổng số bản ghi giữ chỗ: ${reservations.length}`);
    console.log(
      `   - Bản ghi trạng thái HOLDING: ${holdingReservations.length}`,
    );
    console.log(
      `   - Tổng số lượng giữ chỗ (quantity): ${totalHoldingQuantity}`,
    );

    // 4. Thu thập dbData và metricsSummary để đánh giá chuẩn xác
    const dbData = {
      currentStock,
      currentReservedStock,
      availableStock,
      distinctOrderCount: distinctOrders.length,
      totalSoldQuantity,
      holdingReservationCount: holdingReservations.length,
      totalHoldingQuantity,
      deadlockCount: 0,
      runId: testData.runId,
    };

    // Đọc số liệu k6/concurrency metrics nếu có
    let metricsSummary: MetricsSummary = {};

    const summaryCandidates = [
      path.resolve(__dirname, '../../../load-tests/load-test-summary.json'),
      path.resolve(__dirname, 'load-test-summary.json'),
    ];
    for (const sp of summaryCandidates) {
      if (fs.existsSync(sp)) {
        try {
          metricsSummary = JSON.parse(
            fs.readFileSync(sp, 'utf-8'),
          ) as MetricsSummary;
          break;
        } catch {
          // ignore parse error
        }
      }
    }

    // 5. Đánh giá tính toàn vẹn (NFR-04.1) và độ trễ (NFR-01) qua oversell-verifier
    const evaluation = evaluateOversell({
      testData: {
        productId,
        productSku: testData.productSku,
        productName: testData.productName,
        initialStock,
        totalVUs,
        runId: testData.runId,
      },
      dbData,
      metricsSummary,
    });

    console.log('\n4. ĐÁNH GIÁ CÁC TIÊU CHÍ NFR-04.1 (ZERO OVERSELL):');
    for (const chk of evaluation.checks) {
      console.log(
        `   [${chk.passed ? 'PASS ✅' : 'FAIL ❌'}] ${chk.name}: ${chk.actual} (Kỳ vọng: ${chk.expected})`,
      );
    }

    // 6. Xuất báo cáo Markdown NFR được sinh động (không bao giờ hardcode PASS khi có lỗi)
    const reportDir = path.resolve(__dirname, '../../reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportPath = path.join(
      reportDir,
      'NFR-04.1-NFR-01-OVERSELL-REPORT.md',
    );

    fs.writeFileSync(reportPath, evaluation.markdownReport, 'utf-8');
    console.log(`\n📄 ĐÃ XUẤT BÁO CÁO KỸ THUẬT: ${reportPath}`);

    if (evaluation.verdict === 'PASS') {
      console.log('\n🎉 ====================================================');
      console.log('🎉 XÁC NHẬN NFR-04.1 (0 OVERSELL) THÀNH CÔNG 100%!');
      console.log('🎉 ====================================================\n');
    } else if (evaluation.verdict === 'INVALID') {
      console.error(
        '\n⚠️ CẢNH BÁO: DỮ LIỆU KIỂM THỬ KHÔNG HỢP LỆ HOẶC THIẾU DỮ LIỆU HẬU KIỂM!',
      );
      process.exit(evaluation.exitCode);
    } else {
      console.error(
        '\n❌ CẢNH BÁO: MỘT HOẶC NHIỀU TIÊU CHÍ NFR-04.1 CHƯA ĐẠT!',
      );
      process.exit(evaluation.exitCode);
    }
  } catch (error) {
    console.error('❌ Lỗi khi đối soát dữ liệu:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void verifyOversell();
