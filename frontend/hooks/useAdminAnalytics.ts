'use client';
import { useCallback, useMemo, useState } from 'react';
import { ALERTS, INVENTORY, ORDERS, REVENUE, WAREHOUSES } from '../shared/mock/adminMock';

// TODO(API): thay mock bằng GET /admin/analytics/overview | /inventory | /low-stock
export function useDashboard() {
  return useMemo(() => {
    const total = ORDERS.length;
    const delivered = ORDERS.filter(o => o.status === 'DELIVERED').length;
    const today = REVENUE[REVENUE.length - 1].revenue;
    const month = REVENUE.reduce((s, r) => s + r.revenue, 0);
    return {
      series: REVENUE,
      kpi: {
        revenueToday: today, revenueMonth: month, totalOrders: total,
        // Giả định: tỉ lệ hoàn tất = đơn DELIVERED / tổng đơn. Nhóm cần chốt công thức.
        completionRate: total ? Math.round((delivered / total) * 100) : 0,
        lowStockCount: ALERTS.filter(a => a.status === 'OPEN').length,
      },
    };
  }, []);
}

export function useInventory() {
  return { rows: INVENTORY, warehouses: WAREHOUSES, loading: false, error: null as string | null };
}

export function useAlerts() {
  const [alerts, setAlerts] = useState(ALERTS);
  const resolve = useCallback((id: number) =>
    setAlerts(p => p.map(a => (a.id === id ? { ...a, status: 'RESOLVED' as const } : a))), []);
  return { alerts, resolve };
}
