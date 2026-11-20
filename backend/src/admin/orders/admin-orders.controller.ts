import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminOrdersQueryService } from './admin-orders.service';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
export class AdminOrdersGatewayController {
  constructor(private readonly adminOrdersService: AdminOrdersQueryService) {}

  @Get()
  findAll(
    @Query() query: QueryAdminOrdersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminOrdersService.findAll(
      query,
      ...(user.role === UserRole.WAREHOUSE_STAFF ? [user.userId] : []),
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminOrdersService.findOne(
      id,
      ...(user.role === UserRole.WAREHOUSE_STAFF ? [user.userId] : []),
    );
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminOrdersService.updateStatus(
      id,
      dto,
      user.userId,
      ...(user.role === UserRole.WAREHOUSE_STAFF ? [user.userId] : []),
    );
  }
}
