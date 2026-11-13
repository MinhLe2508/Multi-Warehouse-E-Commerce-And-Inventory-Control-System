// =============================================================================
// Multi-Warehouse E-Commerce & Inventory Control System
// File: backend/src/inventory/inventory.module.ts
// Owner: P4 (Backend Data Lead) — thuộc thư mục inventory/, sở hữu riêng của P4
//
// MỤC ĐÍCH: Module quản lý TỒN KHO: REST API "/inventory" (InventoryController),
// nghiệp vụ nhập hàng / kiểm kê / đọc tồn kho và cảnh báo (InventoryService).
//
// app.module.ts ĐÃ import sẵn InventoryModule nên KHÔNG cần sửa file đó.
//
// PHỤ THUỘC:
// - PrismaService: do PrismaModule (@Global) cung cấp, không cần import ở đây.
// - InventoryAlertService: lấy từ InventoryAlertModule (import bên dưới).
// - Guard (JwtAuthGuard, RolesGuard) gắn trực tiếp ở Controller, không cần provider.
//
// EXPORT (cho module khác dùng):
// - InventoryService: module Notifications (P5) import InventoryModule rồi gọi
//   findOpenAlerts() để job định kỳ đọc các cảnh báo tồn thấp đang mở.
// - InventoryAlertModule (xuất lại): module nào đã import InventoryModule cũng
//   inject được InventoryAlertService mà không cần import thêm. Riêng
//   StockReservationModule (P3) nên import TRỰC TIẾP InventoryAlertModule (nhẹ,
//   không kéo theo PrismaService) thay vì InventoryModule.
//
// Không đăng ký DTO trong "providers": DTO là class dữ liệu cho ValidationPipe,
// không phải provider của NestJS.
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryAlertModule } from './inventory-alert.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryPubSubService } from './inventory-pubsub.service';
import { ReservationCleanupJob } from './reservation-cleanup.job';

@Module({
  imports: [PrismaModule, InventoryAlertModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryPubSubService, ReservationCleanupJob],
  exports: [InventoryService, InventoryPubSubService, InventoryAlertModule],
})
export class InventoryModule {}
