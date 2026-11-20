import { assertAssignedWarehouses } from '../../staff/warehouse-scope';
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
import { AlertStatus, type Prisma, UserRole } from '@prisma/client';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { PasswordChangedGuard } from '../../core/guards/password-changed.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { InventoryChangeEmitter } from '../../inventory/inventory-change-emitter.service';
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
    private readonly changes: InventoryChangeEmitter,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryAdminAlertsDto = new QueryAdminAlertsDto(),
    @CurrentUser('role') role: UserRole,
    @CurrentUser('userId') userId?: string,
  ) {
    const validQuery = normalizeAdminAlertsQuery(query);
    const result = await this.inventoryService.findAlerts(
      validQuery,
      role,
      ...(role === UserRole.WAREHOUSE_STAFF && userId ? [userId] : []),
    );
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
    @CurrentUser('role') role?: UserRole,
  ) {
    if (!/^[1-9]\d{0,17}$/.test(rawId)) {
      throw new BadRequestException('ID cảnh báo không hợp lệ');
    }
    const id = BigInt(rawId);

    const executeResolve = async (tx: Prisma.TransactionClient) => {
      if (role === UserRole.WAREHOUSE_STAFF) {
        const alert = await tx.stockAlert.findUnique({
          where: { id },
          select: { inventory: { select: { warehouseId: true } } },
        });
        if (!alert) throw new NotFoundException('Không tìm thấy cảnh báo');
        await assertAssignedWarehouses(tx, userId, [
          alert.inventory.warehouseId,
        ]);
      }
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
          inventoryId: true,
          status: true,
          resolvedAt: true,
          resolvedBy: true,
        },
      });
      if (!current) {
        throw new NotFoundException('Không tìm thấy cảnh báo');
      }

      return {
        inventoryId: current.inventoryId,
        response: {
          id: current.id.toString(),
          status: current.status,
          resolvedAt: current.resolvedAt,
          resolvedBy: current.resolvedBy,
          alreadyResolved: updateResult.count === 0,
        },
      };
    };

    const { inventoryId, response } =
      await this.prisma.$transaction(executeResolve);
    if (!response.alreadyResolved) {
      await this.changes.publishInventory([inventoryId]);
    }
    return response;
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
