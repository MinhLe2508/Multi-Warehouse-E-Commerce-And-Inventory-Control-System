import { staffWarehouseWhere } from '../../staff/warehouse-scope';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import {
  InventoryService,
  type InventoryView,
} from '../../inventory/inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  InventoryStockStatus,
  QueryInventorySummaryDto,
} from './dto/query-inventory-summary.dto';
import {
  MAX_INVENTORY_OFFSET,
  type QueryInventoryDto,
} from './dto/query-inventory.dto';
import type { UpdateInventoryDto } from './dto/update-inventory.dto';

const UNCLASSIFIED = 'Chưa phân loại';
const categorySelect = { id: true, name: true } as const;
const productFilterSelect = {
  sku: true,
  name: true,
  category: { select: categorySelect },
} as const;

const stockSelect = {
  warehouseId: true,
  productId: true,
  stock: true,
  reservedStock: true,
  availableStock: true,
  threshold: true,
  product: { select: productFilterSelect },
} satisfies Prisma.InventorySelect;

type StockRow = Prisma.InventoryGetPayload<{ select: typeof stockSelect }>;
type AdminInventoryView = InventoryView & {
  product: InventoryView['product'] & {
    category?: { id: string; name: string } | null;
  };
};

function inventoryWarehouseWhere(
  query: QueryInventorySummaryDto,
  role: UserRole,
  staffId?: string,
): Prisma.WarehouseWhereInput {
  return {
    id: query.warehouseId,
    ...staffWarehouseWhere(staffId),
    ...(role === UserRole.ADMIN ? {} : { isActive: true }),
  };
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

function productStatuses<Row extends StockRow>(
  rows: Row[],
  thresholdFor: (row: Row) => number,
) {
  const totals = new Map<
    string,
    { available: number; hasLowStockWarehouse: boolean }
  >();
  for (const row of rows) {
    const product = totals.get(row.productId) ?? {
      available: 0,
      hasLowStockWarehouse: false,
    };
    product.available += row.availableStock;
    product.hasLowStockWarehouse ||= row.availableStock <= thresholdFor(row);
    totals.set(row.productId, product);
  }

  const statuses = new Map<string, InventoryStockStatus>();
  for (const [id, { available, hasLowStockWarehouse }] of totals) {
    let status: InventoryStockStatus = 'IN_STOCK';
    if (available === 0) status = 'OUT_OF_STOCK';
    else if (hasLowStockWarehouse) status = 'LOW_STOCK';
    statuses.set(id, status);
  }
  return statuses;
}

function filterInventoryRows<Row extends StockRow>(
  rows: Row[],
  query: QueryInventorySummaryDto,
  thresholdFor: (row: Row) => number,
): { rows: Row[]; statuses: Map<string, InventoryStockStatus> } {
  const search = normalizeSearch(query.search ?? '');
  const matched = rows.filter((row) => {
    if (query.productId && row.productId !== query.productId) return false;
    if (query.lowStockOnly && row.availableStock > thresholdFor(row))
      return false;
    if (
      query.category &&
      (row.product.category?.name ?? UNCLASSIFIED) !== query.category
    ) {
      return false;
    }
    return (
      !search ||
      normalizeSearch(row.product.sku).includes(search) ||
      normalizeSearch(row.product.name).includes(search)
    );
  });

  const statuses = productStatuses(matched, thresholdFor);
  if (!query.status) return { rows: matched, statuses };

  for (const [id, status] of statuses) {
    if (status !== query.status) statuses.delete(id);
  }
  return {
    rows: matched.filter((row) => statuses.has(row.productId)),
    statuses,
  };
}

function emptyStockTotals() {
  return {
    totalStock: 0,
    totalReserved: 0,
    totalAvailable: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };
}

function addStockTotals(
  totals: ReturnType<typeof emptyStockTotals>,
  row: StockRow,
  threshold: number,
): void {
  totals.totalStock += row.stock;
  totals.totalReserved += row.reservedStock;
  totals.totalAvailable += row.availableStock;
  if (row.availableStock === 0) totals.outOfStockCount++;
  else if (row.availableStock <= threshold) totals.lowStockCount++;
}

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    query: QueryInventoryDto,
    role: UserRole,
    staffId?: string,
  ): Promise<{
    items: AdminInventoryView[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? ((query.page ?? 1) - 1) * limit;
    if (offset > MAX_INVENTORY_OFFSET) {
      throw new BadRequestException('Vị trí phân trang vượt giới hạn.');
    }

    // Keep the indexed row pagination for the shared /inventory filters.
    if (!query.search && !query.category && !query.status) {
      const result = await this.inventoryService.findAll(
        {
          warehouseId: query.warehouseId,
          productId: query.productId,
          lowStockOnly: query.lowStockOnly ?? false,
          limit,
          offset,
        },
        role,
        ...(staffId ? [staffId] : []),
      );
      if (!query.includeCategory || result.items.length === 0) return result;

      const products = await this.prisma.product.findMany({
        where: {
          id: { in: [...new Set(result.items.map((r) => r.productId))] },
        },
        select: { id: true, category: { select: categorySelect } },
      });
      const categories = new Map(products.map((p) => [p.id, p.category]));
      return {
        ...result,
        items: result.items.map((row) => ({
          ...row,
          product: {
            ...row.product,
            category: categories.get(row.productId) ?? null,
          },
        })),
      };
    }

    const isAdmin = role === UserRole.ADMIN;
    const inventory = await this.prisma.inventory.findMany({
      where: {
        warehouse: inventoryWarehouseWhere(query, role, staffId),
        productId: query.productId,
      },
      select: {
        ...stockSelect,
        id: true,
        version: true,
        lastRestockedAt: true,
        createdAt: true,
        updatedAt: true,
        warehouse: {
          select: {
            id: true,
            code: true,
            name: true,
            region: true,
            isActive: true,
            defaultLowStockThreshold: true,
          },
        },
        product: {
          select: {
            ...productFilterSelect,
            id: true,
            imageUrl: true,
            basePrice: true,
            isActive: true,
            costPrice: isAdmin,
          },
        },
      },
      orderBy: [
        { warehouse: { code: 'asc' } },
        { product: { name: 'asc' } },
        { id: 'asc' },
      ],
    });
    const thresholdFor = (row: (typeof inventory)[number]) =>
      row.threshold ?? row.warehouse.defaultLowStockThreshold;
    const { rows } = filterInventoryRows(inventory, query, thresholdFor);
    const items = rows.slice(offset, offset + limit).map((row) => {
      const { id, product, warehouse, ...stock } = row;
      const effectiveThreshold = thresholdFor(row);
      return {
        ...stock,
        id: id.toString(),
        effectiveThreshold,
        isLowStock: row.availableStock <= effectiveThreshold,
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          basePrice: product.basePrice.toFixed(2),
          ...(isAdmin
            ? { costPrice: product.costPrice?.toFixed(2) ?? null }
            : {}),
          ...(query.includeCategory ? { category: product.category } : {}),
        },
        warehouse: {
          id: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          region: warehouse.region,
          isActive: warehouse.isActive,
        },
      };
    });
    return { items, total: rows.length, limit, offset };
  }

  async getSummary(
    query: QueryInventorySummaryDto,
    role: UserRole,
    staffId?: string,
  ) {
    const warehouseWhere = inventoryWarehouseWhere(query, role, staffId);
    const [warehouses, visibleStock] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: warehouseWhere,
        select: {
          id: true,
          code: true,
          name: true,
          capacity: true,
          defaultLowStockThreshold: true,
        },
        orderBy: { code: 'asc' },
      }),
      this.prisma.inventory.findMany({
        where: { warehouse: warehouseWhere },
        select: stockSelect,
      }),
    ]);
    const warehouseTotals = new Map(
      warehouses.map((warehouse) => [
        warehouse.id,
        {
          warehouseId: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          capacity: warehouse.capacity ?? null,
          defaultThreshold: warehouse.defaultLowStockThreshold,
          occupiedStock: 0,
          ...emptyStockTotals(),
        },
      ]),
    );
    const thresholdFor = (row: StockRow) =>
      row.threshold ??
      warehouseTotals.get(row.warehouseId)?.defaultThreshold ??
      0;
    const { rows, statuses } = filterInventoryRows(
      visibleStock,
      query,
      thresholdFor,
    );
    const totals = emptyStockTotals();

    for (const row of visibleStock) {
      const warehouse = warehouseTotals.get(row.warehouseId);
      if (warehouse) warehouse.occupiedStock += row.stock;
    }
    for (const row of rows) {
      const threshold = thresholdFor(row);
      addStockTotals(totals, row, threshold);
      const warehouse = warehouseTotals.get(row.warehouseId);
      if (warehouse) addStockTotals(warehouse, row, threshold);
    }

    const productsByStatus = { IN_STOCK: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 };
    for (const status of statuses.values()) productsByStatus[status]++;

    return {
      totalProducts: statuses.size,
      totalInventoryRows: rows.length,
      productsByStatus,
      ...totals,
      byWarehouse: Array.from(warehouseTotals.values(), (warehouse) => ({
        warehouseId: warehouse.warehouseId,
        code: warehouse.code,
        name: warehouse.name,
        totalStock: warehouse.totalStock,
        totalReserved: warehouse.totalReserved,
        totalAvailable: warehouse.totalAvailable,
        lowStockCount: warehouse.lowStockCount,
        outOfStockCount: warehouse.outOfStockCount,
        capacity: warehouse.capacity,
        // Kho chứa toàn bộ tồn vật lý, kể cả khi bảng đang lọc theo SKU.
        occupiedStock: warehouse.occupiedStock,
        capacityRate:
          warehouse.capacity !== null && warehouse.capacity > 0
            ? Math.round((warehouse.occupiedStock / warehouse.capacity) * 100)
            : null,
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
