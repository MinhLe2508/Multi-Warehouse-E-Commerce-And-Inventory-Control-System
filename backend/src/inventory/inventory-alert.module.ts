// =============================================================================
// Đóng gói InventoryAlertService thành một module NHỎ, ĐỘC LẬP, để các module khác import và gọi evaluate() sau khi thay đổi tồn kho:
//   - StockReservationModule (P3 — Huy): gọi sau giữ chỗ / release / expire.
//   - InventoryModule (P4): dùng cho nhập hàng, kiểm kê, đổi ngưỡng.
//
// Lý do tách thành Module riêng thay vì gộp vào InventoryModule:
// - InventoryAlertService không có phụ thuộc nào (không cần PrismaService): mọi truy vấn chạy trên transaction do người gọi truyền vào. 
// - Module này vì thế dựng được trong test của StockReservationModule mà không cần PrismaModule.
// - InventoryModule còn chứa InventoryService (cần PrismaService, WarehousesService), nếu StockReservationModule import cả InventoryModule sẽ kéo theo các phụ thuộc đó và làm vỡ spec module của Huy.
// =============================================================================

import { Module } from '@nestjs/common';
import { InventoryAlertService } from './inventory-alert.service';

@Module({
  providers: [InventoryAlertService],
  exports: [InventoryAlertService],
})
export class InventoryAlertModule {}