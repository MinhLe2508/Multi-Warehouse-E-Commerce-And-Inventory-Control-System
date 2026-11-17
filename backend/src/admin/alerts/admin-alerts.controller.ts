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
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import {
  InventoryService,
  type StockAlertView,
} from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QueryAdminAlertsDto,
  normalizeAdminAlertsQuery,
} from './dto/query-admin-alerts.dto';

@Controller('admin/alerts')
@UseGuards(JwtAuthGuard, PasswordChangedGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.WAREHOUSE_STAFF)
export class AdminAlertsController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryAdminAlertsDto = new QueryAdminAlertsDto(),
    @CurrentUser('role') role: UserRole,
  ) {
    const validQuery = normalizeAdminAlertsQuery(query);
    const result = await this.inventoryService.findAlerts(validQuery, role);
    return {
      ...result,
      items: result.items.map((item) => this.normalizeAlertItem(item)),
    };
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

    const executeResolve = async (tx: Pick<PrismaService, 'stockAlert'>) => {
      const now = new Date();
      const updateResult = await tx.stockAlert.updateMany({
        where: { id, status: AlertStatus.OPEN },
        data: {
          status: AlertStatus.RESOLVED,
          resolvedAt: now,
          resolvedBy: userId,
        },
      });

      const current = await tx.stockAlert.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          resolvedAt: true,
          resolvedBy: true,
        },
      });
      if (!current) {
        throw new NotFoundException('Không tìm thấy cảnh báo');
      }

      return {
        id: current.id.toString(),
        status: current.status,
        resolvedAt: current.resolvedAt,
        resolvedBy: current.resolvedBy,
        alreadyResolved: updateResult.count === 0,
      };
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction((tx) => executeResolve(tx));
    }
    return executeResolve(this.prisma);
  }

  private normalizeAlertItem(item: StockAlertView) {
    const product = item.product ?? {
      id: '',
      sku: '',
      name: '',
    };
    const warehouse = item.warehouse ?? {
      id: '',
      code: '',
      name: '',
    };

    return {
      ...item,
      triggeredAt:
        item.triggeredAt instanceof Date
          ? item.triggeredAt.toISOString()
          : item.triggeredAt,
      resolvedAt:
        item.resolvedAt instanceof Date
          ? item.resolvedAt.toISOString()
          : (item.resolvedAt ?? null),
      productId: product.id,
      productSku: product.sku,
      productName: product.name,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      product,
      warehouse,
    };
  }
}
