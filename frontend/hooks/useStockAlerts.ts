'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch, extractErrorMessage } from '@/shared/lib/apiClient';
import type { AlertLevel } from '@/shared/types/admin';
import { useAuthStore } from '@/store/useAuthStore';
import { useInventoryRealtime } from './useInventoryRealtime';

export interface StockAlertItem {
  id: string;
  inventoryId: string;
  alertLevel: AlertLevel;
  status: 'OPEN' | 'RESOLVED';
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

interface AlertFilters {
  warehouseId?: string;
  alertLevel?: AlertLevel;
  limit?: number;
  offset?: number;
}

type Snapshot = {
  key: string;
  data?: AlertsApiResponse;
  error?: string;
};

const ALERTS_REFRESH = 'mwh:stock-alerts-refresh';
const EMPTY_ALERTS: StockAlertItem[] = [];

export function useStockAlerts({
  warehouseId,
  alertLevel,
  limit = 50,
  offset = 0,
}: AlertFilters = {}) {
  const scope = useAuthStore(({ session }) => {
    const user = session?.user;
    return user && !user.mustChangePassword &&
      (user.role === 'ADMIN' || user.role === 'WAREHOUSE_STAFF')
      ? `${user.id}:${user.role}`
      : null;
  });
  const params = new URLSearchParams({
    status: 'OPEN',
    limit: String(limit),
    offset: String(offset),
  });
  if (warehouseId && warehouseId !== 'ALL') params.set('warehouseId', warehouseId);
  if (alertLevel) params.set('alertLevel', alertLevel);
  const url = `/admin/alerts?${params}`;
  const key = `${scope}:${url}`;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<{ key: string; message: string } | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolving = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const refresh = useCallback(() => {
    clearRefreshTimer();
    generation.current++;
    setResolveError(null);
    setRevision((value) => value + 1);
  }, [clearRefreshTimer]);

  const queueRefresh = useCallback(() => {
    if (timer.current !== null) return;
    // Invalidate any pending read immediately and coalesce changes before fetching again.
    generation.current++;
    timer.current = setTimeout(refresh, 100);
  }, [refresh]);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    const currentGeneration = generation.current;
    void apiGet<AlertsApiResponse>(url).then(
      (data) => {
        if (active && currentGeneration === generation.current) setSnapshot({ key, data });
      },
      (err: unknown) => {
        if (active && currentGeneration === generation.current) {
          setSnapshot({ key, error: extractErrorMessage(err, 'Không tải được cảnh báo tồn kho.') });
        }
      },
    );
    return () => { active = false; };
  }, [key, revision, scope, url]);

  useEffect(() => {
    if (!scope) return;
    window.addEventListener(ALERTS_REFRESH, queueRefresh);
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, 30_000);
    return () => {
      clearInterval(interval);
      clearRefreshTimer();
      window.removeEventListener(ALERTS_REFRESH, queueRefresh);
      window.removeEventListener('focus', refresh);
    };
  }, [clearRefreshTimer, queueRefresh, refresh, scope]);

  const { status: realtimeStatus } = useInventoryRealtime({
    enabled: Boolean(scope),
    onLowStockAlert: queueRefresh,
    onInventoryChanged: queueRefresh,
    onReconnectSync: queueRefresh,
  });

  const resolve = useCallback(async (id: string): Promise<boolean> => {
    if (!scope || resolving.current) return false;
    resolving.current = true;
    setResolvingId(id);
    setResolveError(null);
    try {
      await apiPatch(`/admin/alerts/${id}/resolve`, {});
      window.dispatchEvent(new Event(ALERTS_REFRESH));
      return true;
    } catch (err: unknown) {
      setResolveError({
        key,
        message: extractErrorMessage(err, 'Không thể đánh dấu đã xử lý cảnh báo.'),
      });
      return false;
    } finally {
      resolving.current = false;
      setResolvingId(null);
    }
  }, [key, scope]);

  const current = scope && snapshot?.key === key ? snapshot : null;
  return {
    alerts: current?.data?.items ?? EMPTY_ALERTS,
    total: current?.data?.total ?? 0,
    loading: Boolean(scope) && !current,
    resolvingId,
    error: current?.error ?? null,
    resolveError: resolveError?.key === key ? resolveError.message : null,
    realtimeStatus,
    resolve,
    refresh,
  };
}
