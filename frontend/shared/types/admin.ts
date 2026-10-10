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
