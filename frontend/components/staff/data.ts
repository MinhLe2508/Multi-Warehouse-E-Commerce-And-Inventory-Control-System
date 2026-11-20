import type { OrderStatus } from '@/shared/types/admin';

export type Warehouse = { id: string; code: string; name: string };
export type Item = {
  id: string;
  warehouseId: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  effectiveThreshold: number;
  updatedAt: string;
  lastRestockedAt: string | null;
  warehouse: Warehouse;
  product: {
    id: string; sku: string; name: string; imageUrl: string | null;
    category?: { id: string; name: string } | null;
  };
};
export type AlertItem = {
  id: string; inventoryId: string; alertLevel: 'WARNING' | 'CRITICAL';
  status: 'OPEN' | 'RESOLVED'; triggeredAt: string; resolvedAt: string | null;
  currentStock: number; currentReserved?: number; currentAvailable: number;
  thresholdAtTrigger: number; effectiveThreshold?: number;
  product: Pick<Item['product'], 'id' | 'sku' | 'name'>;
  warehouse: Warehouse;
};
export type Order = {
  id: string; orderCode: string; status: OrderStatus; shippingRecipient: string;
  nextStatuses?: Array<'SHIPPING' | 'DELIVERED'>;
  shippingPhone: string; shippingAddress: string; reservationExpiresAt: string | null;
  createdAt: string; grandTotal: string;
  items: Array<{
    id: string; productName: string; sku: string; quantity: number;
    warehouse: Warehouse; imageUrl?: string | null; inventoryId?: string;
    reservationStatus?: string;
  }>;
  payments: Array<{
    id: string; method: 'COD' | 'BANK_TRANSFER' | 'MOCK_CARD' | 'MOCK_EWALLET';
    status: 'PENDING' | 'SUCCESS' | 'FAILED'; amount: string; transactionRef?: string;
  }>;
  statusHistory: Array<{
    id: string; toStatus: OrderStatus; fromStatus: OrderStatus | null;
    actorName: string; reason?: string | null; createdAt: string;
  }>;
};
export type Profile = {
  id: string; fullName: string; username: string; email: string; phone: string | null;
  avatarUrl: string | null; isActive: boolean; createdAt: string; warehouses: Warehouse[];
};
export type List<T> = { items: T[]; total: number };

const number = new Intl.NumberFormat('vi-VN');
const timestamp = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short',
});

export const count = (n: number) => number.format(n);
export const dateTime = (date?: string | null) => date ? timestamp.format(new Date(date)) : '—';
export const warehouseParam = (id: string) => id === 'ALL' ? undefined : id;
export const getStockStatus = (item: Item) => item.availableStock === 0 ? 'OUT_OF_STOCK' :
  item.availableStock <= item.effectiveThreshold ? 'LOW_STOCK' : 'IN_STOCK';

export function query(path: string, values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.size ? `${path}?${params}` : path;
}

export function restockHref(inventoryId: string, warehouseId: string) {
  return query('/staff/inventory/restock', { inventoryId, warehouseId });
}

export const STAFF_NOTIFICATIONS_CHANGED = 'mwh:staff-notifications-changed';
export const STAFF_PROFILE_CHANGED = 'mwh:staff-profile-changed';
