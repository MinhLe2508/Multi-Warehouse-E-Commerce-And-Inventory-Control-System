'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function useDashboardAnalytics(warehouseId?: string) {
  const { isAdmin, ready, authenticated } = useCurrentAdminUser();
  const defaults = getDefaultDateRange();

  const [fromDate, setFromDate] = useState<string>(defaults.fromDate);
  const [toDate, setToDate] = useState<string>(defaults.toDate);
  const [summary, setSummary] = useState<AnalyticsSummaryData | null>(null);
  const [series, setSeries] = useState<RevenueSeriesPointApi[]>([]);
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryApi | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    if (!ready || !authenticated) return;
    setLoading(true);
    try {
      const invPromise = apiGet<InventorySummaryApi>('/admin/inventory/summary');

      if (isAdmin) {
        const params = new URLSearchParams({
          fromDate,
          toDate,
        });
        if (warehouseId && warehouseId !== 'ALL') {
          params.set('warehouseId', warehouseId);
        }

        const [sumRes, seriesRes, invRes] = await Promise.all([
          apiGet<AnalyticsSummaryData>(`/admin/analytics/summary?${params.toString()}`),
          apiGet<{ series: RevenueSeriesPointApi[] }>(
            `/admin/analytics/revenue-series?${params.toString()}&granularity=day`
          ),
          invPromise,
        ]);

        setSummary(sumRes);
        setSeries(seriesRes.series || []);
        setInventorySummary(invRes);
      } else {
        // WAREHOUSE_STAFF không được gọi /admin/analytics/* (403) -> chỉ tải tồn kho
        const invRes = await invPromise;
        setSummary(null);
        setSeries([]);
        setInventorySummary(invRes);
      }

      setError(null);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Không tải được dữ liệu Dashboard từ máy chủ.'));
    } finally {
      setLoading(false);
    }
  }, [ready, authenticated, isAdmin, fromDate, toDate, warehouseId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadAnalytics();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAnalytics]);

  return {
    isAdmin,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    summary,
    series,
    inventorySummary,
    loading,
    error,
    refresh: loadAnalytics,
  };
}
