// =============================================================================
// Khai báo WarehousesModule của NestJS, đóng gói Controller và Service quản lý kho hàng thành một module
// Export WarehousesService để các module khác (Inventory, Orders...) inject và dùng lại
// =============================================================================

import { Module } from '@nestjs/common';
import { WarehousesController } from './warehouses.controller';
import { WarehousesService } from './warehouses.service';

@Module({
  controllers: [WarehousesController],
  providers: [WarehousesService],

  // Export WarehousesService để InventoryModule / OrdersModule inject được.
  // Controller và DTO không cần export.
  exports: [WarehousesService],
})
export class WarehousesModule {}