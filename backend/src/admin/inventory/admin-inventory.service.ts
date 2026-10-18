import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

export interface WarehouseStockItem {
  inventoryId: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold: number;
  effectiveThreshold: number;
  isLowStock: boolean;
  version: number;
  updatedAt: string;
}

export interface AdminProductInventory {
  id: string;
  sku: string;
  name: string;
  category: string;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  effectiveThreshold: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  warehouses: Record<string, WarehouseStockItem>;
}

@Injectable()
export class AdminInventoryService {
  // Kho hàng mẫu
  private readonly warehouses = [
    { id: 'wh-hn-01', code: 'WH-HN-01', name: 'Kho Miền Bắc (Bắc Ninh)' },
    { id: 'wh-dn-01', code: 'WH-DN-01', name: 'Kho Miền Trung (Đà Nẵng)' },
    { id: 'wh-sg-01', code: 'WH-SG-01', name: 'Kho Miền Nam (Bình Dương)' },
  ];

  // In-memory inventory state (Tuân thủ NFR-02.4: sẵn sàng delegate qua InventoryService của Khang)
  private inventoryData: AdminProductInventory[] = [];

  constructor() {
    this.initMockData();
  }

  private initMockData() {
    const categories = ['Điện tử', 'Điện gia dụng', 'Thời trang', 'Phụ kiện', 'Sức khỏe'];

    for (let i = 1; i <= 50; i++) {
      const pad = String(i).padStart(3, '0');
      const id = `prod-${pad}`;
      const sku = `SKU-${pad}`;
      const cat = categories[i % categories.length];
      const baseThreshold = 10 + (i % 10);

      const warehousesMap: Record<string, WarehouseStockItem> = {};
      let totalStock = 0;
      let totalReserved = 0;
      let totalAvailable = 0;
      let hasLow = false;

      this.warehouses.forEach((wh, whIdx) => {
        let stock = 20 + ((i * 7 + whIdx * 11) % 80);
        let reserved = (i + whIdx) % 8;

        if (i === 1) {
          // Case hết hàng
          stock = 0;
          reserved = 0;
        } else if (i === 2) {
          // Case giữ chỗ hết
          stock = 10;
          reserved = 10;
        } else if (i === 3 && whIdx === 1) {
          // Case sắp hết ở kho ĐN
          stock = baseThreshold;
          reserved = 2;
        }

        const avail = Math.max(0, stock - reserved);
        const low = avail <= baseThreshold;
        if (low) hasLow = true;

        totalStock += stock;
        totalReserved += reserved;
        totalAvailable += avail;

        warehousesMap[wh.id] = {
          inventoryId: `inv-${id}-${wh.id}`,
          warehouseId: wh.id,
          warehouseCode: wh.code,
          warehouseName: wh.name,
          stock,
          reservedStock: reserved,
          availableStock: avail,
          threshold: baseThreshold,
          effectiveThreshold: baseThreshold,
          isLowStock: low,
          version: 1,
          updatedAt: new Date().toISOString(),
        };
      });

      let status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK' = 'IN_STOCK';
      if (totalAvailable <= 0) {
        status = 'OUT_OF_STOCK';
      } else if (hasLow) {
        status = 'LOW_STOCK';
      }

      this.inventoryData.push({
        id,
        sku,
        name: `Sản phẩm mẫu ${sku} (${cat})`,
        category: cat,
        totalStock,
        totalReserved,
        totalAvailable,
        effectiveThreshold: baseThreshold,
        status,
        warehouses: warehousesMap,
      });
    }
  }

  findAll(query: QueryInventoryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));

    let filtered = [...this.inventoryData];

    if (query.category && query.category !== 'ALL') {
      filtered = filtered.filter((p) => p.category === query.category);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }

    if (query.status && query.status !== 'ALL') {
      if (query.warehouseId && query.warehouseId !== 'ALL') {
        filtered = filtered.filter((p) => {
          const wh = p.warehouses[query.warehouseId!];
          if (!wh) return query.status === 'OUT_OF_STOCK';
          if (wh.availableStock <= 0) return query.status === 'OUT_OF_STOCK';
          if (wh.availableStock <= wh.effectiveThreshold) return query.status === 'LOW_STOCK';
          return query.status === 'IN_STOCK';
        });
      } else {
        filtered = filtered.filter((p) => p.status === query.status);
      }
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  getSummary() {
    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const whMap: Record<string, { stock: number; reserved: number; available: number }> = {};
    this.warehouses.forEach((w) => {
      whMap[w.id] = { stock: 0, reserved: 0, available: 0 };
    });

    this.inventoryData.forEach((prod) => {
      totalStock += prod.totalStock;
      totalReserved += prod.totalReserved;
      totalAvailable += prod.totalAvailable;

      if (prod.status === 'OUT_OF_STOCK') outOfStockCount++;
      if (prod.status === 'LOW_STOCK') lowStockCount++;

      Object.values(prod.warehouses).forEach((w) => {
        if (whMap[w.warehouseId]) {
          whMap[w.warehouseId].stock += w.stock;
          whMap[w.warehouseId].reserved += w.reservedStock;
          whMap[w.warehouseId].available += w.availableStock;
        }
      });
    });

    const warehouseDistribution = this.warehouses.map((w) => {
      const stat = whMap[w.id];
      const capacityRate = Math.min(100, Math.round((stat.stock / 10000) * 100));
      return {
        warehouseId: w.id,
        warehouseCode: w.code,
        warehouseName: w.name,
        totalStock: stat.stock,
        totalReserved: stat.reserved,
        totalAvailable: stat.available,
        capacityRate,
      };
    });

    return {
      kpis: {
        totalProducts: this.inventoryData.length,
        totalStock,
        totalReserved,
        totalAvailable,
        lowStockCount,
        outOfStockCount,
      },
      warehouseDistribution,
    };
  }

  adjustStock(inventoryId: string, dto: UpdateInventoryDto, actorId: string) {
    let targetProduct: AdminProductInventory | null = null;
    let targetDetail: WarehouseStockItem | null = null;

    for (const prod of this.inventoryData) {
      for (const whId of Object.keys(prod.warehouses)) {
        if (prod.warehouses[whId].inventoryId === inventoryId) {
          targetProduct = prod;
          targetDetail = prod.warehouses[whId];
          break;
        }
      }
      if (targetProduct) break;
    }

    if (!targetProduct || !targetDetail) {
      throw new NotFoundException(`Không tìm thấy bản ghi tồn kho với ID ${inventoryId}`);
    }

    // 1. Kiểm tra Optimistic locking
    if (targetDetail.version !== dto.expectedVersion) {
      throw new ConflictException(
        `Xung đột dữ liệu (409 Conflict): Phiên bản tồn kho đã bị thay đổi (hiện tại: ${targetDetail.version}, kỳ vọng: ${dto.expectedVersion}). Vui lòng tải lại trang!`
      );
    }

    // 2. Kiểm tra không nhỏ hơn reservedStock
    if (dto.newStock < targetDetail.reservedStock) {
      throw new UnprocessableEntityException(
        `Số lượng tồn kho mới (${dto.newStock}) không được nhỏ hơn số lượng đang giữ chỗ (${targetDetail.reservedStock})!`
      );
    }

    // 3. Cập nhật tồn kho
    const newAvailable = Math.max(0, dto.newStock - targetDetail.reservedStock);
    const low = newAvailable <= targetDetail.effectiveThreshold;

    targetDetail.stock = dto.newStock;
    targetDetail.availableStock = newAvailable;
    targetDetail.isLowStock = low;
    targetDetail.version += 1;
    targetDetail.updatedAt = new Date().toISOString();

    // 4. Cập nhật tổng thể sản phẩm
    let newTotalStock = 0;
    let newTotalReserved = 0;
    let newTotalAvailable = 0;
    let hasLow = false;

    Object.values(targetProduct.warehouses).forEach((w) => {
      newTotalStock += w.stock;
      newTotalReserved += w.reservedStock;
      newTotalAvailable += w.availableStock;
      if (w.isLowStock) hasLow = true;
    });

    targetProduct.totalStock = newTotalStock;
    targetProduct.totalReserved = newTotalReserved;
    targetProduct.totalAvailable = newTotalAvailable;

    if (newTotalAvailable <= 0) {
      targetProduct.status = 'OUT_OF_STOCK';
    } else if (hasLow) {
      targetProduct.status = 'LOW_STOCK';
    } else {
      targetProduct.status = 'IN_STOCK';
    }

    return {
      success: true,
      message: 'Điều chỉnh tồn kho thành công',
      audit: {
        inventoryId,
        actorId,
        note: dto.note,
        adjustedAt: targetDetail.updatedAt,
      },
      data: { ...targetDetail },
    };
  }
}
