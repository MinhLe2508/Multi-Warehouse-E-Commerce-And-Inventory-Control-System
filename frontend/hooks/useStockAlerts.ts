'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { apiGet, apiPatch, extractErrorMessage } from '@/shared/lib/apiClient';
import {
  useInventoryRealtime,
  type LowStockRealtimeEvent,
  type RealtimeStatus,
} from './useInventoryRealtime';

export interface StockAlertItem {
  id: string;
  inventoryId: string;
  alertLevel: 'WARNING' | 'CRITICAL' | string;
  status: 'OPEN' | 'RESOLVED' | string;
  stockAtTrigger: number;
  availableAtTrigger: number;
  thresholdAtTrigger: number;
  currentStock?: number;
  currentAvailable?: number;
  productId: string;
  productSku: string;
  productName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  triggeredAt: string;
  resolvedAt?: string | null;
}

interface AlertsApiResponse {
  items: StockAlertItem[];
  total: number;
  limit: number;
  offset: number;
}

export function useStockAlerts() {
  const [alerts, setAlerts] = useState<StockAlertItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchAlerts = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const data = await apiGet<AlertsApiResponse>('/admin/alerts?status=OPEN&limit=50');
      setAlerts(data.items || []);
      setTotal(data.total ?? (data.items ? data.items.length : 0));
      setError(null);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Không tải được danh sách cảnh báo tồn kho.'));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchAlerts();
    }, 0);

    const interval = setInterval(() => {
      void fetchAlerts();
    }, 30000);

    const onFocus = () => {
      void fetchAlerts();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAlerts]);

  const handleRealtimeAlert = useCallback((event: LowStockRealtimeEvent) => {
    setAlerts((prev) => {
      const exists = prev.some(
        (a) =>
          (event.alertId && a.id === event.alertId) ||
          (a.inventoryId === event.inventoryId && a.status === 'OPEN')
      );
      if (exists) {
        return prev.map((a) =>
          a.inventoryId === event.inventoryId && a.status === 'OPEN'
            ? {
                ...a,
                alertLevel: event.alertLevel ?? (event.availableStock === 0 ? 'CRITICAL' : 'WARNING'),
                currentAvailable: event.availableStock,
              }
            : a
        );
      }

      const incoming: StockAlertItem = {
        id: event.alertId ?? `rt-${event.inventoryId}-${Date.now()}`,
        inventoryId: event.inventoryId,
        alertLevel: event.alertLevel ?? (event.availableStock === 0 ? 'CRITICAL' : 'WARNING'),
        status: 'OPEN',
        stockAtTrigger: event.availableStock,
        availableAtTrigger: event.availableStock,
        thresholdAtTrigger: event.threshold,
        currentAvailable: event.availableStock,
        productId: event.productId,
        productSku: event.sku ?? event.productId.slice(0, 8),
        productName: event.productName ?? 'Sản phẩm dưới ngưỡng',
        warehouseId: event.warehouseId,
        warehouseCode: event.warehouseCode ?? 'WH',
        warehouseName: event.warehouseCode ?? 'Kho hàng',
        triggeredAt: event.triggeredAt ?? new Date().toISOString(),
      };
      setTotal((t) => t + 1);
      return [incoming, ...prev];
    });
  }, []);

  const { status: realtimeStatus } = useInventoryRealtime({
    onLowStockAlert: handleRealtimeAlert,
    onReconnectSync: fetchAlerts,
  });

  const resolve = useCallback(
    async (id: string): Promise<boolean> => {
      setResolvingId(id);
      try {
        await apiPatch(`/admin/alerts/${id}/resolve`, {});
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        setTotal((t) => Math.max(0, t - 1));
        setError(null);
        return true;
      } catch (err: unknown) {
        setError(extractErrorMessage(err, 'Không thể đánh dấu đã xử lý cảnh báo.'));
        return false;
      } finally {
        setResolvingId(null);
      }
    },
    []
  );

  return {
    alerts,
    total,
    loading,
    resolvingId,
    error,
    realtimeStatus: realtimeStatus as RealtimeStatus,
    resolve,
    refresh: fetchAlerts,
  };
}
