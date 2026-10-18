import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { AdminInventoryController } from './inventory/admin-inventory.controller';
import { AdminInventoryService } from './inventory/admin-inventory.service';

@Module({
  controllers: [AdminController, AdminInventoryController],
  providers: [AdminRolesGuard, AdminInventoryService],
  exports: [AdminRolesGuard, AdminInventoryService],
})
export class AdminModule {}
