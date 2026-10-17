import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminRolesGuard } from './guards/admin-roles.guard';

@Module({
  controllers: [AdminController],
  providers: [AdminRolesGuard],
  exports: [AdminRolesGuard],
})
export class AdminModule {}
