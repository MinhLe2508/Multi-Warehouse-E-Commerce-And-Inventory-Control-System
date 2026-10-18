// Types khớp schema trong Documents/api/admin-api.openapi.yaml và ERD v1.0
export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';
export type AlertLevel = 'WARNING' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'RESOLVED';

export interface Warehouse { id: string; code: string; name: string }

export interface InventoryRow {
  inventoryId: number; productId: string; sku: string; name: string; categoryName: string;
  warehouseId: string; stock: number; reservedStock: number; availableStock: number; threshold: number;
}

export interface StockAlert {
  id: number; inventoryId: number; alertLevel: AlertLevel; status: AlertStatus;
  sku: string; productName: string; warehouseId: string; warehouseCode: string;
  availableAtTrigger: number; thresholdAtTrigger: number; triggeredAt: string;
}

export interface AdminOrderItem {
  productName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number; warehouseCode: string;
}
export interface OrderHistoryItem { fromStatus: OrderStatus | null; toStatus: OrderStatus; actor: string; createdAt: string }
export interface AdminOrder {
  id: string; orderCode: string; status: OrderStatus; customerName: string; grandTotal: number;
  warehouseCodes: string[]; createdAt: string; updatedAt: string;
  shipping: { recipient: string; phone: string; address: string };
  paymentMethod: 'MOCK_CARD' | 'MOCK_EWALLET' | 'COD';
  items: AdminOrderItem[]; history: OrderHistoryItem[];
}
export interface RevenuePoint { date: string; revenue: number; orders: number }

export type StockStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

export interface WarehouseStockDetail {
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

export interface ProductInventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  effectiveThreshold: number;
  status: StockStatus;
  warehouses: Record<string, WarehouseStockDetail>;
}

export interface InventoryWarehouseStat {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  capacityRate: number;
}

export interface InventorySummaryResponse {
  kpis: {
    totalProducts: number;
    totalStock: number;
    totalReserved: number;
    totalAvailable: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  warehouseDistribution: InventoryWarehouseStat[];
  topLowStockProducts: Array<{
    id: string;
    sku: string;
    name: string;
    totalAvailable: number;
    status: StockStatus;
  }>;
}

export interface StockAdjustPayload {
  inventoryId: string;
  newStock: number;
  expectedVersion: number;
  note: string;
}

export interface StockAdjustResponse {
  success: boolean;
  message: string;
  data?: WarehouseStockDetail;
}
