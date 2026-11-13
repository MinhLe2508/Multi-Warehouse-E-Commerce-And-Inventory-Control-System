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
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminInventoryService } from './admin-inventory.service';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminInventoryController {
  constructor(private readonly inventoryService: AdminInventoryService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  findAll(
    @Query()
    query: QueryInventoryDto & {
      productId?: string;
      lowStockOnly?: string;
      offset?: string;
    },
    @CurrentUser('role') role: UserRole,
  ) {
    return this.inventoryService.findAll(query, role);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
  getSummary() {
    return this.inventoryService.getSummary();
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
