import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { AdminInventoryService } from './admin-inventory.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

@Controller('admin/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminInventoryController {
  constructor(private readonly inventoryService: AdminInventoryService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('summary')
  @Roles(UserRole.ADMIN)
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
