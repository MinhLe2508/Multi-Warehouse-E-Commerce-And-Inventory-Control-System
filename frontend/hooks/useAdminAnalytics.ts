'use client';

import { useEffect, useState } from 'react';
import { apiGet, extractErrorMessage } from '../shared/lib/apiClient';
import { useCurrentAdminUser } from './useCurrentAdminUser';

export interface AnalyticsSummaryData {
  range: {
    fromDate: string;
    toDate: string;
    warehouseId: string | null;
  };
  ordersByStatus: {
    PENDING_PAYMENT: number;
    CONFIRMED: number;
    SHIPPING: number;
    DELIVERED: number;
    CANCELLED: number;
  };
  revenue: {
    total: string;
    currency: 'VND';
    orderCount: number;
  };
  topProducts: Array<{
    productId: string;
    sku: string;
    name: string;
    quantitySold: number;
    revenue: string;
  }>;
  lowStockByWarehouse: Array<{
    warehouseId: string;
    code: string;
    name: string;
    lowStockItems: number;
    outOfStockItems: number;
  }>;
  expiredReservations: number;
}

export interface RevenueSeriesPointApi {
  date: string;
  revenue: string;
  orderCount: number;
}

export interface InventorySummaryApi {
  totalProducts: number;
  totalStock: number;
  totalReserved: number;
  totalAvailable: number;
  lowStockCount: number;
  outOfStockCount: number;
  byWarehouse: Array<{
    warehouseId: string;
    code: string;
    name: string;
    totalStock: number;
    totalReserved: number;
    totalAvailable: number;
    lowStockCount: number;
    outOfStockCount: number;
  }>;
}

function getDefaultDateRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const toDate = vnNow.toISOString().slice(0, 10);
  const vnFrom = new Date(vnNow.getTime() - 13 * 24 * 60 * 60 * 1000);
  const fromDate = vnFrom.toISOString().slice(0, 10);
  return { fromDate, toDate };
}

interface DashboardData {
  summary: AnalyticsSummaryData | null;
  series: RevenueSeriesPointApi[];
  inventorySummary: InventorySummaryApi;
}

export function useDashboardAnalytics(warehouseId?: string) {
  const { user, isAdmin, isStaff, ready, authenticated } =
    useCurrentAdminUser();
  const [dates, setDates] = useState(getDefaultDateRange);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data?: DashboardData;
    error?: string;
  }>();
  const scope = warehouseId && warehouseId !== 'ALL' ? warehouseId : '';
  const permitted = ready && authenticated && (isAdmin || isStaff);
  const { fromDate, toDate } = dates;
  const key = JSON.stringify([
    user.id,
    isAdmin,
    scope,
    fromDate,
    toDate,
    revision,
  ]);

  useEffect(() => {
    if (!permitted) return;
    let active = true;
    const warehouse = new URLSearchParams();
    if (scope) warehouse.set('warehouseId', scope);
    const inventoryUrl = scope
      ? `/admin/inventory/summary?${warehouse}`
      : '/admin/inventory/summary';
    const analytics = new URLSearchParams(warehouse);
    if (fromDate) analytics.set('fromDate', fromDate);
    if (toDate) analytics.set('toDate', toDate);

    async function read(): Promise<DashboardData> {
      const inventory = apiGet<InventorySummaryApi>(inventoryUrl);
      if (!isAdmin) {
        return { summary: null, series: [], inventorySummary: await inventory };
      }
      const [summary, series, inventorySummary] = await Promise.all([
        apiGet<AnalyticsSummaryData>(`/admin/analytics/summary?${analytics}`),
        apiGet<{ series: RevenueSeriesPointApi[] }>(
          `/admin/analytics/revenue-series?${analytics}&granularity=day`,
        ),
        inventory,
      ]);
      return { summary, series: series.series, inventorySummary };
    }

    void read().then(
      (data) => {
        if (active) setSnapshot({ key, data });
      },
      (error: unknown) => {
        if (active) {
          setSnapshot({
            key,
            error: extractErrorMessage(
              error,
              'Không tải được dữ liệu Dashboard.',
            ),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [fromDate, isAdmin, key, permitted, scope, toDate]);

  const current = permitted && snapshot?.key === key ? snapshot : undefined;
  return {
    isAdmin,
    ...dates,
    setFromDate: (value: string) =>
      setDates((current) => ({ ...current, fromDate: value })),
    setToDate: (value: string) =>
      setDates((current) => ({ ...current, toDate: value })),
    summary: current?.data?.summary ?? null,
    series: current?.data?.series ?? [],
    inventorySummary: current?.data?.inventorySummary ?? null,
    loading: !ready || (permitted && !current),
    error: current?.error ?? null,
    refresh: () => setRevision((current) => current + 1),
  };
}
