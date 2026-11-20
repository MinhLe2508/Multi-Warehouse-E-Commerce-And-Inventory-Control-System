import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AdminOperationsService } from '../admin/operations/admin-operations.service';
import { InventoryAuditListQuery } from '../admin/operations/admin-list.dto';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../core/guards/password-changed.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { StaffDashboardQuery, StaffProfileUpdate } from './staff-portal.dto';
import { StaffPortalService } from './staff-portal.service';

@Controller('staff')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.WAREHOUSE_STAFF)
export class StaffPortalController {
  constructor(
    private readonly portal: StaffPortalService,
    private readonly operations: AdminOperationsService,
  ) {}

  @Get('dashboard')
  dashboard(
    @CurrentUser('userId') userId: string,
    @Query() query: StaffDashboardQuery,
  ) {
    return this.portal.dashboard(userId, query.warehouseId);
  }

  @Get('inventory/audit-logs')
  listAudit(
    @CurrentUser('userId') userId: string,
    @Query() query: InventoryAuditListQuery,
  ) {
    return this.operations.listInventoryAudit(query, userId);
  }

  @Get('profile')
  profile(@CurrentUser('userId') userId: string) {
    return this.portal.profile(userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() input: StaffProfileUpdate,
  ) {
    return this.portal.updateProfile(userId, input);
  }
}
