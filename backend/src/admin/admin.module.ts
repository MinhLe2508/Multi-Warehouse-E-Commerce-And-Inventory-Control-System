import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminInventoryController } from './inventory/admin-inventory.controller';
import { AdminInventoryService } from './inventory/admin-inventory.service';

@Module({
  controllers: [AdminController, AdminInventoryController],
  providers: [AdminInventoryService],
  exports: [AdminInventoryService],
})
export class AdminModule {}
