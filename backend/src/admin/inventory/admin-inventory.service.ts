import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { InventoryService } from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { QueryInventoryDto } from './dto/query-inventory.dto';
import type { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    query: QueryInventoryDto & {
      productId?: string;
      lowStockOnly?: string;
      offset?: string;
    },
    role: UserRole,
  ) {
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const page = Math.max(1, Number(query.page ?? 1));
    const offset =
      query.offset !== undefined
        ? Math.max(0, Number(query.offset))
        : (page - 1) * limit;

    return this.inventoryService.findAll(
      {
        warehouseId:
          query.warehouseId && query.warehouseId !== 'ALL'
            ? query.warehouseId
            : undefined,
        productId: query.productId,
        lowStockOnly:
          query.lowStockOnly === 'true' || query.status === 'LOW_STOCK',
        limit,
        offset,
      },
      role,
    );
  }

  async getSummary() {
    const [warehouses, rows] = await Promise.all([
      this.prisma.warehouse.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          region: true,
          defaultLowStockThreshold: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.inventory.findMany({
        select: {
          warehouseId: true,
          productId: true,
          stock: true,
          reservedStock: true,
          availableStock: true,
          threshold: true,
        },
      }),
    ]);

    const byWarehouseMap = new Map(
      warehouses.map((w) => [
        w.id,
        {
          warehouseId: w.id,
          code: w.code,
          name: w.name,
          defaultThreshold: w.defaultLowStockThreshold,
          totalStock: 0,
          totalReserved: 0,
          totalAvailable: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
        },
      ]),
    );

    const productIds = new Set<string>();
    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const row of rows) {
      productIds.add(row.productId);
      totalStock += row.stock;
      totalReserved += row.reservedStock;
      totalAvailable += row.availableStock;

      const wh = byWarehouseMap.get(row.warehouseId);
      if (wh) {
        wh.totalStock += row.stock;
        wh.totalReserved += row.reservedStock;
        wh.totalAvailable += row.availableStock;
        const effectiveThreshold = row.threshold ?? wh.defaultThreshold;
        if (row.availableStock === 0) {
          wh.outOfStockCount += 1;
          outOfStockCount += 1;
        } else if (row.availableStock <= effectiveThreshold) {
          wh.lowStockCount += 1;
          lowStockCount += 1;
        }
      }
    }

    return {
      totalProducts: productIds.size,
      totalStock,
      totalReserved,
      totalAvailable,
      lowStockCount,
      outOfStockCount,
      byWarehouse: Array.from(byWarehouseMap.values()).map((w) => ({
        warehouseId: w.warehouseId,
        code: w.code,
        name: w.name,
        totalStock: w.totalStock,
        totalReserved: w.totalReserved,
        totalAvailable: w.totalAvailable,
        lowStockCount: w.lowStockCount,
        outOfStockCount: w.outOfStockCount,
      })),
    };
  }

  async adjustStock(id: string, dto: UpdateInventoryDto, actorId: string) {
    const stock = dto.stock ?? dto.newStock;
    if (stock === undefined && dto.threshold === undefined) {
      throw new BadRequestException(
        'Phải cung cấp ít nhất stock hoặc threshold để cập nhật',
      );
    }

    return this.inventoryService.updateStock(
      id,
      {
        stock,
        threshold: dto.threshold,
        note: dto.note,
      },
      actorId,
    );
  }
}
