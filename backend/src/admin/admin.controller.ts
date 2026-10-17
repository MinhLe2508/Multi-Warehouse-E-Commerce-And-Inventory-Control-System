import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import { Roles } from './decorators/roles.decorator';

export interface AdminHealthResponse {
  status: 'ok';
  module: 'AdminModule';
  timestamp: string;
}

@Controller('admin')
@UseGuards(AdminRolesGuard)
export class AdminController {
  @Get('health')
  @Roles('ADMIN', 'WAREHOUSE_STAFF')
  checkHealth(): AdminHealthResponse {
    return {
      status: 'ok',
      module: 'AdminModule',
      timestamp: new Date().toISOString(),
    };
  }
}
