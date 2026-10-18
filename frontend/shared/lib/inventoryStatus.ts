import type { ProductInventoryItem, StockStatus, WarehouseStockDetail } from '../types/admin';

/**
 * Tính số lượng tồn khả dụng (available = stock - reserved).
 * Khớp logic Postgres GENERATED ALWAYS AS (GREATEST(0, stock - reserved_stock)).
 */
export function calculateAvailableStock(stock: number, reserved: number): number {
  return Math.max(0, (stock || 0) - (reserved || 0));
}

/**
 * Lấy ngưỡng cảnh báo hiệu lực: Ưu tiên ngưỡng riêng của kho (nếu có và >= 0),
 * nếu không thì fallback về ngưỡng mặc định của sản phẩm.
 */
export function getEffectiveThreshold(
  productThreshold: number,
  warehouseThreshold?: number | null
): number {
  if (warehouseThreshold !== null && warehouseThreshold !== undefined && warehouseThreshold >= 0) {
    return warehouseThreshold;
  }
  return productThreshold > 0 ? productThreshold : 10;
}

/**
 * Kiểm tra xem một kho có bị cảnh báo sắp hết hàng không.
 * SRS FR-NOT-01 & Bảng phản biện Tuần 3: availableStock <= effectiveThreshold.
 */
export function isLowStock(availableStock: number, effectiveThreshold: number): boolean {
  return availableStock <= effectiveThreshold;
}

/**
 * Xác định trạng thái tổng thể của sản phẩm (thứ tự ưu tiên rõ ràng):
 * 1. OUT_OF_STOCK: Tổng khả dụng toàn quốc <= 0.
 * 2. LOW_STOCK: Tổng khả dụng > 0 nhưng có ít nhất 1 kho có available <= effectiveThreshold.
 * 3. IN_STOCK: Mọi kho đều an toàn trên ngưỡng.
 */
export function determineProductStatus(
  totalAvailable: number,
  hasLowStockWarehouse: boolean
): StockStatus {
  if (totalAvailable <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (hasLowStockWarehouse) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

/**
 * Xác định trạng thái của sản phẩm tại một kho cụ thể.
 */
export function determineWarehouseStatus(
  availableStock: number,
  effectiveThreshold: number
): StockStatus {
  if (availableStock <= 0) {
    return 'OUT_OF_STOCK';
  }
  if (availableStock <= effectiveThreshold) {
    return 'LOW_STOCK';
  }
  return 'IN_STOCK';
}

/**
 * Chuẩn hóa chuỗi tiếng Việt không dấu để tìm kiếm thân thiện.
 */
export function removeVietnameseAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Tính tỷ lệ khả dụng tránh lỗi chia cho 0 (Zero-division safe).
 */
export function calculateAvailabilityRate(totalAvailable: number, totalStock: number): string {
  if (!totalStock || totalStock <= 0) {
    return '—';
  }
  const percent = Math.round((totalAvailable / totalStock) * 100);
  return `${percent}%`;
}

export interface InventoryFilterOptions {
  search?: string;
  category?: string;
  warehouseId?: string;
  status?: string; // 'ALL' | StockStatus
}

/**
 * Lọc danh sách sản phẩm tồn kho theo các tiêu chí (Search, Category, Warehouse, Status).
 * Xử lý chính xác quan hệ giữa lọc kho và lọc trạng thái.
 */
export function filterInventoryProducts(
  items: ProductInventoryItem[],
  filters: InventoryFilterOptions
): ProductInventoryItem[] {
  const { search, category, warehouseId, status } = filters;
  const cleanSearch = search ? removeVietnameseAccents(search) : '';

  return items.filter((item) => {
    // 1. Lọc theo danh mục
    if (category && category !== 'ALL' && item.category !== category) {
      return false;
    }

    // 2. Lọc theo từ khóa tìm kiếm (tên hoặc SKU)
    if (cleanSearch) {
      const matchSku = removeVietnameseAccents(item.sku).includes(cleanSearch);
      const matchName = removeVietnameseAccents(item.name).includes(cleanSearch);
      if (!matchSku && !matchName) {
        return false;
      }
    }

    // 3. Lọc theo trạng thái và kho
    if (status && status !== 'ALL') {
      let resolvedStatus: StockStatus;

      if (warehouseId && warehouseId !== 'ALL') {
        const whDetail = item.warehouses[warehouseId] as WarehouseStockDetail | undefined;
        if (!whDetail) {
          resolvedStatus = 'OUT_OF_STOCK';
        } else {
          resolvedStatus = determineWarehouseStatus(
            whDetail.availableStock,
            whDetail.effectiveThreshold
          );
        }
      } else {
        resolvedStatus = item.status;
      }

      if (resolvedStatus !== status) {
        return false;
      }
    }

    return true;
  });
}
