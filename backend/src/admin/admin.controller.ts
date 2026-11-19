import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';

export interface AdminHealthResponse {
  status: 'ok';
  module: 'AdminModule';
  timestamp: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get('health')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  checkHealth(): AdminHealthResponse {
    return {
      status: 'ok',
      module: 'AdminModule',
      timestamp: new Date().toISOString(),
    };
  }
}
