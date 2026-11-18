import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminInventoryService } from './admin-inventory.service';
import { QueryInventorySummaryDto } from './dto/query-inventory-summary.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
export class AdminInventoryController {
  constructor(private readonly inventoryService: AdminInventoryService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  findAll(
    @Query() query: QueryInventoryDto,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.inventoryService.findAll(query, role);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  getSummary(
    @Query() query: QueryInventorySummaryDto = {},
    @CurrentUser('role') role: UserRole = UserRole.WAREHOUSE_STAFF,
  ) {
    return this.inventoryService.getSummary(query, role);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  adjustStock(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.inventoryService.adjustStock(id, dto, actorId);
  }
}
