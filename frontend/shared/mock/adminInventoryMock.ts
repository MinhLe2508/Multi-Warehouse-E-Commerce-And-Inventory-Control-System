import type {
  ProductInventoryItem,
  Warehouse,
  WarehouseStockDetail,
  InventorySummaryResponse,
  StockStatus,
  StockAdjustPayload,
} from '../types/admin';

// Pure calculation helpers matching inventoryStatus.ts
const calculateAvailableStock = (stock: number, reserved: number): number =>
  Math.max(0, (stock || 0) - (reserved || 0));

const getEffectiveThreshold = (productThreshold: number, warehouseThreshold?: number | null): number =>
  warehouseThreshold !== null && warehouseThreshold !== undefined && warehouseThreshold >= 0
    ? warehouseThreshold
    : productThreshold > 0
    ? productThreshold
    : 10;

const isLowStock = (availableStock: number, effectiveThreshold: number): boolean =>
  availableStock <= effectiveThreshold;

const determineProductStatus = (totalAvailable: number, hasLowStockWarehouse: boolean): StockStatus => {
  if (totalAvailable <= 0) return 'OUT_OF_STOCK';
  if (hasLowStockWarehouse) return 'LOW_STOCK';
  return 'IN_STOCK';
};

export const MOCK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-hn-01', code: 'WH-HN-01', name: 'Kho Miền Bắc (Bắc Ninh)' },
  { id: 'wh-dn-01', code: 'WH-DN-01', name: 'Kho Miền Trung (Đà Nẵng)' },
  { id: 'wh-sg-01', code: 'WH-SG-01', name: 'Kho Miền Nam (Bình Dương)' },
];

export const MOCK_CATEGORIES = [
  'Tất cả danh mục',
  'Điện tử',
  'Điện gia dụng',
  'Thời trang',
  'Phụ kiện',
  'Sức khỏe',
];

// Helper sinh dữ liệu deterministic
function generateMockProducts(): ProductInventoryItem[] {
  const products: ProductInventoryItem[] = [];

  // 15 TRƯỜNG HỢP BIÊN KIỂM THỬ XÁC ĐỊNH
  const edgeCases = [
    {
      id: 'prod-001',
      sku: 'SKU-001-OOS',
      name: 'Tai nghe Bluetooth True Wireless Zero (Hết hàng toàn quốc)',
      category: 'Điện tử',
      baseThreshold: 15,
      whStocks: [
        { whId: 'wh-hn-01', stock: 0, reserved: 0, whThreshold: 15 },
        { whId: 'wh-dn-01', stock: 0, reserved: 0, whThreshold: 15 },
        { whId: 'wh-sg-01', stock: 0, reserved: 0, whThreshold: 15 },
      ],
      version: 1,
    },
    {
      id: 'prod-002',
      sku: 'SKU-002-RSV-FULL',
      name: 'Bàn phím cơ không dây RGB Pro (Khả dụng = 0 do giữ chỗ hết)',
      category: 'Phụ kiện',
      baseThreshold: 10,
      whStocks: [
        { whId: 'wh-hn-01', stock: 10, reserved: 10, whThreshold: 10 },
        { whId: 'wh-dn-01', stock: 15, reserved: 15, whThreshold: 10 },
        { whId: 'wh-sg-01', stock: 5, reserved: 5, whThreshold: 10 },
      ],
      version: 2,
    },
    {
      id: 'prod-003',
      sku: 'SKU-003-LOW-ONE',
      name: 'Chuột không dây Silent Click (Sắp hết ở Kho Đà Nẵng)',
      category: 'Phụ kiện',
      baseThreshold: 10,
      whStocks: [
        { whId: 'wh-hn-01', stock: 80, reserved: 10, whThreshold: 10 }, // avail: 70
        { whId: 'wh-dn-01', stock: 12, reserved: 4, whThreshold: 10 },  // avail: 8 <= 10 (LOW)
        { whId: 'wh-sg-01', stock: 120, reserved: 20, whThreshold: 10 }, // avail: 100
      ],
      version: 4,
    },
    {
      id: 'prod-004',
      sku: 'SKU-004-LOW-ALL',
      name: 'Cáp sạc Type-C Fast Charging 65W (Sắp hết cả 3 kho)',
      category: 'Phụ kiện',
      baseThreshold: 20,
      whStocks: [
        { whId: 'wh-hn-01', stock: 22, reserved: 5, whThreshold: 20 }, // avail: 17 <= 20
        { whId: 'wh-dn-01', stock: 18, reserved: 3, whThreshold: 20 }, // avail: 15 <= 20
        { whId: 'wh-sg-01', stock: 25, reserved: 6, whThreshold: 20 }, // avail: 19 <= 20
      ],
      version: 3,
    },
    {
      id: 'prod-005',
      sku: 'SKU-005-OVERRIDE',
      name: 'Nồi chiên không dầu 5L (Ngưỡng kho HN ghi đè)',
      category: 'Điện gia dụng',
      baseThreshold: 25,
      whStocks: [
        { whId: 'wh-hn-01', stock: 15, reserved: 5, whThreshold: 8 },  // avail: 10 > 8 (Safe vì whThreshold=8 ghi đè base=25)
        { whId: 'wh-dn-01', stock: 35, reserved: 5, whThreshold: 25 }, // avail: 30 > 25
        { whId: 'wh-sg-01', stock: 40, reserved: 10, whThreshold: 25 }, // avail: 30 > 25
      ],
      version: 5,
    },
    {
      id: 'prod-006',
      sku: 'SKU-006-MASSIVE',
      name: 'Khẩu trang y tế kháng khuẩn 4 lớp (Tồn kho cực lớn)',
      category: 'Sức khỏe',
      baseThreshold: 1000,
      whStocks: [
        { whId: 'wh-hn-01', stock: 50000, reserved: 2500, whThreshold: 1000 },
        { whId: 'wh-dn-01', stock: 25000, reserved: 1200, whThreshold: 1000 },
        { whId: 'wh-sg-01', stock: 75000, reserved: 4500, whThreshold: 1000 },
      ],
      version: 1,
    },
    {
      id: 'prod-007',
      sku: 'SKU-007-UNICODE',
      name: 'Máy Đo Huyết Áp Bắp Tay Tự Động (Tìm kiếm không dấu)',
      category: 'Sức khỏe',
      baseThreshold: 12,
      whStocks: [
        { whId: 'wh-hn-01', stock: 45, reserved: 5, whThreshold: 12 },
        { whId: 'wh-dn-01', stock: 30, reserved: 2, whThreshold: 12 },
        { whId: 'wh-sg-01', stock: 60, reserved: 8, whThreshold: 12 },
      ],
      version: 2,
    },
    {
      id: 'prod-008',
      sku: 'SKU-008-SINGLE-WH',
      name: 'Áo khoác gió thể thao nam chống nước (Chỉ có ở Kho Bắc Ninh)',
      category: 'Thời trang',
      baseThreshold: 15,
      whStocks: [
        { whId: 'wh-hn-01', stock: 95, reserved: 12, whThreshold: 15 },
        { whId: 'wh-dn-01', stock: 0, reserved: 0, whThreshold: 15 },
        { whId: 'wh-sg-01', stock: 0, reserved: 0, whThreshold: 15 },
      ],
      version: 1,
    },
    {
      id: 'prod-009',
      sku: 'SKU-009-HEAVY-RSV',
      name: 'Smart Tivi 4K Ultra HD 55 Inch (Giữ chỗ đơn hàng lớn)',
      category: 'Điện tử',
      baseThreshold: 5,
      whStocks: [
        { whId: 'wh-hn-01', stock: 20, reserved: 18, whThreshold: 5 }, // avail: 2 <= 5 (LOW)
        { whId: 'wh-dn-01', stock: 15, reserved: 13, whThreshold: 5 }, // avail: 2 <= 5 (LOW)
        { whId: 'wh-sg-01', stock: 30, reserved: 28, whThreshold: 5 }, // avail: 2 <= 5 (LOW)
      ],
      version: 8,
    },
    {
      id: 'prod-010',
      sku: 'SKU-010-EXACT-THRESH',
      name: 'Cân sức khỏe điện tử thông minh (Đúng bằng ngưỡng cảnh báo)',
      category: 'Sức khỏe',
      baseThreshold: 10,
      whStocks: [
        { whId: 'wh-hn-01', stock: 15, reserved: 5, whThreshold: 10 }, // avail: 10 == 10 (LOW)
        { whId: 'wh-dn-01', stock: 25, reserved: 5, whThreshold: 10 }, // avail: 20 > 10 (Safe)
        { whId: 'wh-sg-01', stock: 40, reserved: 5, whThreshold: 10 }, // avail: 35 > 10 (Safe)
      ],
      version: 3,
    },
    {
      id: 'prod-011',
      sku: 'SKU-011-JUST-ABOVE',
      name: 'Máy sấy tóc ion âm bảo vệ tóc (Trên ngưỡng đúng 1 đơn vị)',
      category: 'Điện gia dụng',
      baseThreshold: 10,
      whStocks: [
        { whId: 'wh-hn-01', stock: 16, reserved: 5, whThreshold: 10 }, // avail: 11 > 10 (Safe)
        { whId: 'wh-dn-01', stock: 21, reserved: 10, whThreshold: 10 }, // avail: 11 > 10 (Safe)
        { whId: 'wh-sg-01', stock: 31, reserved: 20, whThreshold: 10 }, // avail: 11 > 10 (Safe)
      ],
      version: 2,
    },
    {
      id: 'prod-012',
      sku: 'SKU-012-NEW-PROD',
      name: 'Đồng hồ thông minh theo dõi nhịp tim (Mới nhập, Version 1)',
      category: 'Điện tử',
      baseThreshold: 15,
      whStocks: [
        { whId: 'wh-hn-01', stock: 50, reserved: 0, whThreshold: 15 },
        { whId: 'wh-dn-01', stock: 30, reserved: 0, whThreshold: 15 },
        { whId: 'wh-sg-01', stock: 70, reserved: 0, whThreshold: 15 },
      ],
      version: 1,
    },
    {
      id: 'prod-013',
      sku: 'SKU-013-HIGH-VER',
      name: 'Bình giữ nhiệt Inox 304 cao cấp (Đã cập nhật 15 lần)',
      category: 'Điện gia dụng',
      baseThreshold: 20,
      whStocks: [
        { whId: 'wh-hn-01', stock: 120, reserved: 15, whThreshold: 20 },
        { whId: 'wh-dn-01', stock: 85, reserved: 10, whThreshold: 20 },
        { whId: 'wh-sg-01', stock: 140, reserved: 25, whThreshold: 20 },
      ],
      version: 15,
    },
    {
      id: 'prod-014',
      sku: 'SKU-014-ACCESSORY-OOS',
      name: 'Miếng dán cường lực chống nhìn trộm (Hết sạch mọi kho)',
      category: 'Phụ kiện',
      baseThreshold: 50,
      whStocks: [
        { whId: 'wh-hn-01', stock: 0, reserved: 0, whThreshold: 50 },
        { whId: 'wh-dn-01', stock: 0, reserved: 0, whThreshold: 50 },
        { whId: 'wh-sg-01', stock: 0, reserved: 0, whThreshold: 50 },
      ],
      version: 6,
    },
    {
      id: 'prod-015',
      sku: 'SKU-015-SPECIAL-CHAR',
      name: 'Chuột Gaming Pro Wireless (Gen 2) - Black & White / 2.4GHz',
      category: 'Phụ kiện',
      baseThreshold: 10,
      whStocks: [
        { whId: 'wh-hn-01', stock: 40, reserved: 8, whThreshold: 10 },
        { whId: 'wh-dn-01', stock: 12, reserved: 4, whThreshold: 10 }, // avail: 8 <= 10 (LOW)
        { whId: 'wh-sg-01', stock: 55, reserved: 12, whThreshold: 10 },
      ],
      version: 7,
    },
  ];

  // Xử lý 15 edge cases
  edgeCases.forEach((ec) => {
    const warehousesMap: Record<string, WarehouseStockDetail> = {};
    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let hasLow = false;

    ec.whStocks.forEach((wh) => {
      const whInfo = MOCK_WAREHOUSES.find((w) => w.id === wh.whId)!;
      const avail = calculateAvailableStock(wh.stock, wh.reserved);
      const effectiveThresh = getEffectiveThreshold(ec.baseThreshold, wh.whThreshold);
      const low = isLowStock(avail, effectiveThresh);
      if (low) hasLow = true;

      totalStock += wh.stock;
      totalReserved += wh.reserved;
      totalAvailable += avail;

      warehousesMap[wh.whId] = {
        inventoryId: `inv-${ec.id}-${wh.whId}`,
        warehouseId: wh.whId,
        warehouseCode: whInfo.code,
        warehouseName: whInfo.name,
        stock: wh.stock,
        reservedStock: wh.reserved,
        availableStock: avail,
        threshold: ec.baseThreshold,
        effectiveThreshold: effectiveThresh,
        isLowStock: low,
        version: ec.version,
        updatedAt: '2026-10-18T10:00:00Z',
      };
    });

    const status = determineProductStatus(totalAvailable, hasLow);

    products.push({
      id: ec.id,
      sku: ec.sku,
      name: ec.name,
      category: ec.category,
      totalStock,
      totalReserved,
      totalAvailable,
      effectiveThreshold: ec.baseThreshold,
      status,
      warehouses: warehousesMap,
    });
  });

  // Sinh thêm 185 sản phẩm có quy luật ổn định (Tổng cộng 200 SP)
  const categories = ['Điện tử', 'Điện gia dụng', 'Thời trang', 'Phụ kiện', 'Sức khỏe'];
  const namePrefixes = [
    'Quạt điện thông minh',
    'Bình đun siêu tốc',
    'Tai nghe chụp tai gaming',
    'Bộ sạc nhanh đa năng',
    'Đèn bàn học chống cận',
    'Bàn ủi hơi nước cầm tay',
    'Balo laptop chống sốc',
    'Áo thun thể thao thoáng khí',
    'Máy lọc không khí mini',
    'Loa bluetooth chống nước',
  ];

  for (let i = 16; i <= 200; i++) {
    const pad = String(i).padStart(3, '0');
    const id = `prod-${pad}`;
    const sku = `SKU-${pad}`;
    const cat = categories[i % categories.length];
    const prefix = namePrefixes[i % namePrefixes.length];
    const name = `${prefix} Model V${(i % 5) + 1} (${cat} #${i})`;
    const baseThreshold = 10 + (i % 15);

    const warehousesMap: Record<string, WarehouseStockDetail> = {};
    let totalStock = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let hasLow = false;

    MOCK_WAREHOUSES.forEach((wh, whIdx) => {
      // Logic phân bổ stock: một số SP có kho hết, kho sắp hết, kho dồi dào
      let stock = 0;
      let reserved = 0;

      if (i % 17 === 0) {
        // Hết hàng
        stock = 0;
        reserved = 0;
      } else if (i % 7 === 0 && whIdx === 1) {
        // Kho thứ 2 sắp hết
        stock = baseThreshold - 2;
        reserved = 1;
      } else {
        // Bình thường
        stock = 30 + ((i * 13 + whIdx * 19) % 150);
        reserved = (i + whIdx * 2) % 12;
      }

      const avail = calculateAvailableStock(stock, reserved);
      const effectiveThresh = baseThreshold;
      const low = isLowStock(avail, effectiveThresh);
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
        effectiveThreshold: effectiveThresh,
        isLowStock: low,
        version: 1 + (i % 4),
        updatedAt: '2026-10-18T12:00:00Z',
      };
    });

    const status = determineProductStatus(totalAvailable, hasLow);

    products.push({
      id,
      sku,
      name,
      category: cat,
      totalStock,
      totalReserved,
      totalAvailable,
      effectiveThreshold: baseThreshold,
      status,
      warehouses: warehousesMap,
    });
  }

  return products;
}

// In-memory state cho mock (giúp modal điều chỉnh cập nhật ngay trên giao diện)
export let adminInventoryData: ProductInventoryItem[] = generateMockProducts();

/**
 * Reset lại dữ liệu mock về ban đầu nếu cần
 */
export function resetMockInventory(): void {
  adminInventoryData = generateMockProducts();
}

/**
 * Thực hiện điều chỉnh tồn kho theo quy tắc Optimistic Locking và Validate
 */
export function adjustMockStock(payload: StockAdjustPayload): WarehouseStockDetail {
  const { inventoryId, newStock, expectedVersion, note } = payload;

  if (newStock < 0) {
    throw new Error('Số lượng tồn kho không được là số âm (NFR-05.2)');
  }

  if (!note || note.trim().length < 5 || note.trim().length > 500) {
    throw new Error('Lý do điều chỉnh (note) bắt buộc từ 5 đến 500 ký tự (FR-INV-01)');
  }

  // Tìm sản phẩm và kho tương ứng
  let targetProduct: ProductInventoryItem | null = null;
  let targetDetail: WarehouseStockDetail | null = null;

  for (const prod of adminInventoryData) {
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
    throw new Error(`Không tìm thấy bản ghi tồn kho với ID ${inventoryId}`);
  }

  // 1. Kiểm tra Optimistic Locking
  if (targetDetail.version !== expectedVersion) {
    const err = new Error(
      `Xung đột dữ liệu (409 Conflict): Tồn kho đã được thay đổi bởi người khác (version hiện tại: ${targetDetail.version}, bạn đang sửa: ${expectedVersion}). Vui lòng tải lại trang!`
    ) as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  // 2. Kiểm tra không được nhỏ hơn reservedStock
  if (newStock < targetDetail.reservedStock) {
    const err = new Error(
      `Không thể điều chỉnh tồn kho (${newStock}) nhỏ hơn số lượng đang giữ chỗ đơn hàng (${targetDetail.reservedStock})!`
    ) as Error & { status?: number };
    err.status = 422;
    throw err;
  }

  // 3. Tiến hành cập nhật
  const newAvailable = calculateAvailableStock(newStock, targetDetail.reservedStock);
  const isNowLow = isLowStock(newAvailable, targetDetail.effectiveThreshold);

  targetDetail.stock = newStock;
  targetDetail.availableStock = newAvailable;
  targetDetail.isLowStock = isNowLow;
  targetDetail.version += 1;
  targetDetail.updatedAt = new Date().toISOString();

  // 4. Tính toán lại tổng thể sản phẩm
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
  targetProduct.status = determineProductStatus(newTotalAvailable, hasLow);

  return { ...targetDetail };
}

/**
 * Tính toán báo cáo thống kê tổng hợp (Summary KPIs & Warehouse Distribution)
 */
export function getMockInventorySummary(): InventorySummaryResponse {
  let totalStock = 0;
  let totalReserved = 0;
  let totalAvailable = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const whMap: Record<
    string,
    { id: string; code: string; name: string; stock: number; reserved: number; available: number }
  > = {};

  MOCK_WAREHOUSES.forEach((w) => {
    whMap[w.id] = { id: w.id, code: w.code, name: w.name, stock: 0, reserved: 0, available: 0 };
  });

  const lowStockProds: Array<{
    id: string;
    sku: string;
    name: string;
    totalAvailable: number;
    status: StockStatus;
  }> = [];

  adminInventoryData.forEach((prod) => {
    totalStock += prod.totalStock;
    totalReserved += prod.totalReserved;
    totalAvailable += prod.totalAvailable;

    if (prod.status === 'OUT_OF_STOCK') {
      outOfStockCount++;
      lowStockProds.push({
        id: prod.id,
        sku: prod.sku,
        name: prod.name,
        totalAvailable: prod.totalAvailable,
        status: prod.status,
      });
    } else if (prod.status === 'LOW_STOCK') {
      lowStockCount++;
      lowStockProds.push({
        id: prod.id,
        sku: prod.sku,
        name: prod.name,
        totalAvailable: prod.totalAvailable,
        status: prod.status,
      });
    }

    Object.values(prod.warehouses).forEach((w) => {
      if (whMap[w.warehouseId]) {
        whMap[w.warehouseId].stock += w.stock;
        whMap[w.warehouseId].reserved += w.reservedStock;
        whMap[w.warehouseId].available += w.availableStock;
      }
    });
  });

  const warehouseDistribution = MOCK_WAREHOUSES.map((w) => {
    const stat = whMap[w.id];
    // Giả lập capacity chuẩn
    const capacityLimit = 20000;
    const capacityRate = Math.min(100, Math.round((stat.stock / capacityLimit) * 100));
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
      totalProducts: adminInventoryData.length,
      totalStock,
      totalReserved,
      totalAvailable,
      lowStockCount,
      outOfStockCount,
    },
    warehouseDistribution,
    topLowStockProducts: lowStockProds.slice(0, 10),
  };
}
