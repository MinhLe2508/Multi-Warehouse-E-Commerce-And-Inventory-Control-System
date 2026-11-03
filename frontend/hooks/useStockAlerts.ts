'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { authenticatedRequest } from '@/store/useAuthStore';
import { ALERTS as MOCK_ALERTS } from '@/shared/mock/adminMock';

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
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchAlerts = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      // Gọi endpoint thật của Khang: GET /inventory/alerts?status=OPEN
      const data = await authenticatedRequest<AlertsApiResponse>(
        '/inventory/alerts?status=OPEN&limit=10'
      );
      setAlerts(data.items || []);
      setTotal(data.total || (data.items ? data.items.length : 0));
      setError(null);
    } catch {
      // Fallback an toàn sang mock nếu backend chưa seed xong cảnh báo
      const openMocks: StockAlertItem[] = MOCK_ALERTS.filter(a => a.status === 'OPEN').map(a => ({
        id: String(a.id),
        inventoryId: String(a.inventoryId),
        alertLevel: a.alertLevel,
        status: a.status,
        stockAtTrigger: a.availableAtTrigger,
        availableAtTrigger: a.availableAtTrigger,
        thresholdAtTrigger: a.thresholdAtTrigger,
        currentStock: a.availableAtTrigger,
        currentAvailable: a.availableAtTrigger,
        productId: a.sku,
        productSku: a.sku,
        productName: a.productName,
        warehouseId: a.warehouseId,
        warehouseCode: a.warehouseCode,
        warehouseName: `Kho ${a.warehouseCode}`,
        triggeredAt: a.triggeredAt,
      }));
      setAlerts(openMocks);
      setTotal(openMocks.length);
      setError(null);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAlerts();
    }, 0);

    // Chu kỳ 30 giây (T5)
    const interval = setInterval(fetchAlerts, 30000);

    // Cập nhật khi tab được focus lại (T5)
    const onFocus = () => {
      fetchAlerts();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAlerts]);

  return { alerts, total, loading, error, refresh: fetchAlerts };
}
