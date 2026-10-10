// DỮ LIỆU MẪU — thay bằng gọi API thật trong hooks/ khi backend sẵn sàng
import type { AdminOrder, InventoryRow, RevenuePoint, StockAlert, Warehouse } from '../types/admin';

export const WAREHOUSES: Warehouse[] = [
  { id: 'w-hcm', code: 'WH-HCM', name: 'Kho TP.HCM' },
  { id: 'w-hn', code: 'WH-HN', name: 'Kho Hà Nội' },
  { id: 'w-dn', code: 'WH-DN', name: 'Kho Đà Nẵng' },
];

const inv = (id: number, sku: string, name: string, cat: string, w: string, stock: number, res: number, th: number): InventoryRow =>
  ({ inventoryId: id, productId: 'p-' + sku, sku, name, categoryName: cat, warehouseId: w, stock, reservedStock: res, availableStock: stock - res, threshold: th });

export const INVENTORY: InventoryRow[] = [
  inv(1, 'SKU-1001', 'Tai nghe Bluetooth', 'Âm thanh', 'w-hcm', 10, 9, 10),
  inv(2, 'SKU-1001', 'Tai nghe Bluetooth', 'Âm thanh', 'w-hn', 64, 5, 10),
  inv(3, 'SKU-1014', 'Sạc nhanh 65W', 'Phụ kiện', 'w-dn', 18, 4, 20),
  inv(4, 'SKU-1014', 'Sạc nhanh 65W', 'Phụ kiện', 'w-hcm', 120, 12, 20),
  inv(5, 'SKU-1020', 'Cáp USB-C 1m', 'Phụ kiện', 'w-hn', 240, 12, 10),
  inv(6, 'SKU-1020', 'Cáp USB-C 1m', 'Phụ kiện', 'w-dn', 6, 6, 10),
  inv(7, 'SKU-1033', 'Chuột không dây', 'Ngoại vi', 'w-hcm', 96, 6, 10),
  inv(8, 'SKU-1033', 'Chuột không dây', 'Ngoại vi', 'w-hn', 52, 2, 10),
];

export const ALERTS: StockAlert[] = [
  { id: 3, inventoryId: 6, alertLevel: 'CRITICAL', status: 'OPEN', sku: 'SKU-1020', productName: 'Cáp USB-C 1m', warehouseId: 'w-dn', warehouseCode: 'WH-DN', availableAtTrigger: 0, thresholdAtTrigger: 10, triggeredAt: '2026-10-10T02:10:00Z' },
  { id: 2, inventoryId: 1, alertLevel: 'CRITICAL', status: 'OPEN', sku: 'SKU-1001', productName: 'Tai nghe Bluetooth', warehouseId: 'w-hcm', warehouseCode: 'WH-HCM', availableAtTrigger: 1, thresholdAtTrigger: 10, triggeredAt: '2026-10-10T01:48:00Z' },
  { id: 1, inventoryId: 3, alertLevel: 'WARNING', status: 'OPEN', sku: 'SKU-1014', productName: 'Sạc nhanh 65W', warehouseId: 'w-dn', warehouseCode: 'WH-DN', availableAtTrigger: 14, thresholdAtTrigger: 20, triggeredAt: '2026-10-09T09:25:00Z' },
];

const ord = (n: number, status: AdminOrder['status'], cust: string, total: number, wh: string[], at: string): AdminOrder => ({
  id: 'o-' + n, orderCode: `ORD-2026-${String(n).padStart(6, '0')}`, status, customerName: cust, grandTotal: total,
  warehouseCodes: wh, createdAt: at, updatedAt: at, paymentMethod: 'MOCK_EWALLET',
  shipping: { recipient: cust, phone: '0900000000', address: '12 Nguyễn Huệ, Quận 1, TP.HCM' },
  items: [{ productName: 'Tai nghe Bluetooth', sku: 'SKU-1001', quantity: 1, unitPrice: total, lineTotal: total, warehouseCode: wh[0] }],
  history: [
    { fromStatus: null, toStatus: 'PENDING_PAYMENT', actor: 'Hệ thống', createdAt: at },
    ...(status !== 'PENDING_PAYMENT' ? [{ fromStatus: 'PENDING_PAYMENT' as const, toStatus: status, actor: 'Hệ thống', createdAt: at }] : []),
  ],
});

export const ORDERS: AdminOrder[] = [
  ord(88, 'CONFIRMED', 'Nguyễn Văn A', 1250000, ['WH-HCM'], '2026-10-10T03:42:00Z'),
  ord(87, 'SHIPPING', 'Trần Thị B', 3480000, ['WH-HN', 'WH-DN'], '2026-10-10T02:15:00Z'),
  ord(86, 'PENDING_PAYMENT', 'Lê Văn C', 420000, ['WH-HCM'], '2026-10-10T02:02:00Z'),
  ord(85, 'CANCELLED', 'Phạm Thị D', 890000, ['WH-DN'], '2026-10-09T01:40:00Z'),
  ord(84, 'DELIVERED', 'Hoàng Văn E', 2150000, ['WH-HN'], '2026-10-08T07:10:00Z'),
  ord(83, 'CONFIRMED', 'Vũ Thị F', 760000, ['WH-HCM'], '2026-10-08T04:30:00Z'),
];

// 14 ngày gần nhất, sinh bằng công thức cố định (không dùng random để tránh lệch SSR/client)
const LABELS = ['27/09','28/09','29/09','30/09','01/10','02/10','03/10','04/10','05/10','06/10','07/10','08/10','09/10','10/10'];
export const REVENUE: RevenuePoint[] = LABELS.map((date, i) => ({
  date, revenue: 38_000_000 + ((i * 7) % 5) * 6_000_000 + i * 900_000, orders: 90 + ((i * 7) % 5) * 9 + i,
}));
