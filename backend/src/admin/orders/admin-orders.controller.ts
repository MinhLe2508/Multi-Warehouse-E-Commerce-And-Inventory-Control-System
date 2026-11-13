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
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminOrdersQueryService } from './admin-orders.service';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
export class AdminOrdersGatewayController {
  constructor(private readonly adminOrdersService: AdminOrdersQueryService) {}

  @Get()
  findAll(@Query() query: QueryAdminOrdersDto) {
    return this.adminOrdersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminOrdersService.findOne(id);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminOrderStatusDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.adminOrdersService.updateStatus(id, dto, actorId);
  }
}
