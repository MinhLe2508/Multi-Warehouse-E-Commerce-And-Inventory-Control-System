import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { InventoryModule } from '../inventory/inventory.module';
import { AdminStaffWarehousesController } from './admin-staff-warehouses.controller';
import { StaffPortalController } from './staff-portal.controller';
import { StaffPortalService } from './staff-portal.service';

@Module({
  imports: [AdminModule, InventoryModule],
  controllers: [StaffPortalController, AdminStaffWarehousesController],
  providers: [StaffPortalService],
})
export class StaffPortalModule {}
