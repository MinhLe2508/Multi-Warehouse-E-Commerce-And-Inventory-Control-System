// =============================================================================
// Quản lý cảnh báo tồn kho thấp (bảng "stock_alerts"). 
// Service này chỉ có MỘT hàm công khai là evaluate(): đánh giá lại một số dòng tồn kho rồi
//   (a) TẠO cảnh báo OPEN cho dòng có hàng khả dụng <= ngưỡng,
//   (b) NÂNG cảnh báo OPEN từ WARNING lên CRITICAL khi hàng khả dụng về 0,
//   (c) ĐÓNG (RESOLVED) cảnh báo OPEN khi hàng khả dụng đã vượt ngưỡng trở lại.
//
// AI gọi hàm này và gọi khi nào:
// - StockReservation (Huy): gọi sau khi giữ chỗ (reserve) vì lúc đó hàng khả
//   dụng giảm, và sau khi RELEASE / EXPIRE vì lúc đó hàng khả dụng tăng lại.
// - InventoryService (Khang): gọi sau khi tạo dòng tồn kho, nhập hàng, kiểm kê hoặc
//   đổi ngưỡng riêng.
//
// NGUYÊN TẮC THIẾT KẾ:
// 1. KHÔNG TỰ MỞ TRANSACTION, KHÔNG DÙNG PrismaService. Mọi truy vấn chạy trên
//    "tx" do NGƯỜI GỌI truyền vào, nên cảnh báo được ghi/rollback CÙNG giao dịch
//    với thao tác tồn kho. Service không có phụ thuộc nào, nhờ vậy module này
//    (InventoryAlertModule) import được vào StockReservationModule của Huy mà
//    không kéo theo PrismaService.
// 2. Không publish Redis tại đây. Giao dịch thuộc về người gọi nên không biết
//    lúc nào commit; publish trong giao dịch có thể bắn sự kiện cho giao dịch
//    sau đó bị rollback. Cảnh báo chỉ được GHI vào CSDL; job định kỳ của P5
//    (Minh) đọc các cảnh báo OPEN để tạo thông báo và đẩy realtime.
// 3. Chống trùng nhờ CSDL: chỉ mục duy nhất có điều kiện
//    "uq_alerts_one_open_per_inventory" (inventory_id WHERE status = 'OPEN') bảo
//    đảm mỗi dòng tồn kho tối đa 1 cảnh báo OPEN. Hàm dùng INSERT ... ON CONFLICT
//    nên gọi lặp hay gọi đồng thời đều vô hại (idempotent).
// 4. Xử lý theo lô bằng 2 câu SQL (không lặp từng dòng) để giảm số lượt truy vấn.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';

// BIGINT dương lớn nhất của PostgreSQL
const MAX_BIGINT = 9223372036854775807n;

// Kết quả đánh giá, để người gọi ghi log hoặc kiểm thử
export interface AlertEvaluationResult {
  // Số cảnh báo vừa được TẠO MỚI hoặc NÂNG mức
  raised: number;
  // Số cảnh báo vừa được ĐÓNG (RESOLVED) vì hàng khả dụng đã vượt ngưỡng.
  resolved: number;
}

@Injectable()
export class InventoryAlertService {
  // Đánh giá lại cảnh báo tồn kho thấp cho các dòng inventory được chỉ định
  async evaluate(
    tx: Prisma.TransactionClient,
    inventoryIds: bigint[],
    resolvedBy: string | null = null,
  ): Promise<AlertEvaluationResult> {
    const ids = this.normalizeIds(inventoryIds);
    if (resolvedBy !== null && !isUUID(resolvedBy)) {
      throw new Error('Resolved By phải là UUID hợp lệ hoặc Null.');
    }
    if (ids.length === 0) {
      return { raised: 0, resolved: 0 };
    }

    // — TẠO / NÂNG cảnh báo cho dòng có hàng khả dụng <= ngưỡng.
    // - Chưa có cảnh báo OPEN: INSERT mới (mức CRITICAL nếu hết hàng, ngược lại WARNING).
    // - Đã có cảnh báo OPEN: chỉ NÂNG từ WARNING lên CRITICAL (cập nhật số liệu chụp tại thời điểm cảnh báo), còn lại giữ nguyên để không làm job thông báo của P5 coi đây là cảnh báo mới. 
    // "triggered_at" luôn giữ nguyên.
    // - Điều kiện sau ON CONFLICT phải khớp đúng điều kiện của chỉ mục có điều kiện "uq_alerts_one_open_per_inventory" (status = 'OPEN').
    const raised = await tx.$executeRaw`
      INSERT INTO "stock_alerts" (
        "inventory_id", "alert_level", "status",
        "stock_at_trigger", "available_at_trigger", "threshold_at_trigger"
      )
      SELECT i."id",
             (CASE WHEN i."available_stock" <= 0 THEN 'CRITICAL' ELSE 'WARNING' END)::"AlertLevel",
             'OPEN'::"AlertStatus",
             i."stock",
             i."available_stock",
             COALESCE(i."threshold", w."default_low_stock_threshold")
        FROM "inventory" i
        JOIN "warehouses" w ON w."id" = i."warehouse_id"
       WHERE i."id" = ANY(${ids}::bigint[])
         AND i."available_stock" <= COALESCE(i."threshold", w."default_low_stock_threshold")
       ORDER BY i."id"
      ON CONFLICT ("inventory_id") WHERE "status" = 'OPEN'
      DO UPDATE SET
        "alert_level"          = EXCLUDED."alert_level",
        "stock_at_trigger"     = EXCLUDED."stock_at_trigger",
        "available_at_trigger" = EXCLUDED."available_at_trigger",
        "threshold_at_trigger" = EXCLUDED."threshold_at_trigger"
      WHERE "stock_alerts"."alert_level" = 'WARNING'::"AlertLevel"
        AND EXCLUDED."alert_level" = 'CRITICAL'::"AlertLevel"
    `;

    // Đóng cảnh báo OPEN của dòng đã có đủ hàng khả dụng trở lại (available_stock > ngưỡng). 
    // Hai câu loại trừ nhau trên cùng một dòng: mỗi dòng chỉ thỏa đúng một trong hai điều kiện (<= ngưỡng hoặc > ngưỡng).
    const resolved = await tx.$executeRaw`
      UPDATE "stock_alerts" AS a
         SET "status"      = 'RESOLVED'::"AlertStatus",
             "resolved_at" = NOW(),
             "resolved_by" = ${resolvedBy}::uuid
        FROM "inventory" i
        JOIN "warehouses" w ON w."id" = i."warehouse_id"
       WHERE a."inventory_id" = i."id"
         AND a."status" = 'OPEN'::"AlertStatus"
         AND i."id" = ANY(${ids}::bigint[])
         AND i."available_stock" > COALESCE(i."threshold", w."default_low_stock_threshold")
    `;
    return { raised, resolved };
  }

  // Kiểm tra danh sách ID đầu vào, loại ID trùng và sắp xếp tăng dần theo số để thứ tự ghi nhất quán giữa các giao dịch
  private normalizeIds(inventoryIds: bigint[]): bigint[] {
    if (!Array.isArray(inventoryIds)) {
      throw new Error('Inventory Ids phải là một mảng Bigint.');
    }

    for (const id of inventoryIds) {
      if (typeof id !== 'bigint' || id <= 0n || id > MAX_BIGINT) {
        throw new Error('Mỗi InventoryId phải là Bigint dương trong khoảng BIGINT.');
      }
    }
    return [...new Set(inventoryIds)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}