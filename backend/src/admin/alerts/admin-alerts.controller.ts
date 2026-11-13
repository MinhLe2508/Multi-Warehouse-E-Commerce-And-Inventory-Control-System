import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AlertStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('admin/alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
export class AdminAlertsController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  findAll(
    @Query('status') status: 'OPEN' | 'RESOLVED' | 'ALL' = 'OPEN',
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.inventoryService.findAlerts(
      {
        status,
        warehouseId,
        limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50,
        offset: offset ? Math.max(0, Number(offset)) : 0,
      },
      role,
    );
  }

  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveAlert(
    @Param('id') rawId: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!/^[1-9]\d{0,17}$/.test(rawId)) {
      throw new BadRequestException('ID cảnh báo không hợp lệ');
    }
    const id = BigInt(rawId);

    const existing = await this.prisma.stockAlert.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy cảnh báo');
    }

    const updated = await this.prisma.stockAlert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: userId,
      },
      select: {
        id: true,
        status: true,
        resolvedAt: true,
        resolvedBy: true,
      },
    });

    return {
      id: updated.id.toString(),
      status: updated.status,
      resolvedAt: updated.resolvedAt,
      resolvedBy: updated.resolvedBy,
    };
  }
}
