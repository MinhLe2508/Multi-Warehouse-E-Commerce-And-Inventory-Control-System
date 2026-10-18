import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminRolesGuard } from '../guards/admin-roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { AdminInventoryService } from './admin-inventory.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

interface RequestWithUser {
  user?: {
    id: string;
    role: string;
    email: string;
  };
  headers?: Record<string, string | undefined>;
}

@Controller('admin/inventory')
@UseGuards(AdminRolesGuard)
export class AdminInventoryController {
  constructor(private readonly inventoryService: AdminInventoryService) {}

  @Get()
  @Roles('ADMIN')
  findAll(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('summary')
  @Roles('ADMIN')
  getSummary() {
    return this.inventoryService.getSummary();
  }

  @Patch(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  adjustStock(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
    @Req() req: RequestWithUser
  ) {
    const actorId = req.user?.id || req.headers?.['x-actor-id'] || 'admin-system';
    return this.inventoryService.adjustStock(id, dto, actorId);
  }
}
