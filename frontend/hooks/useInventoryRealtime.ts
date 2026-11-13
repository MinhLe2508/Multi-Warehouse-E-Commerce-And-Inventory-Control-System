'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from '@/shared/lib/apiClient';
import { useAuthStore } from '@/store/useAuthStore';

export interface LowStockRealtimeEvent {
  inventoryId: string;
  productId: string;
  warehouseId: string;
  availableStock: number;
  threshold: number;
  alertId?: string;
  alertLevel?: 'WARNING' | 'CRITICAL';
  sku?: string;
  productName?: string;
  warehouseCode?: string;
  triggeredAt?: string;
}

export interface InventoryChangedEvent {
  inventoryId: string;
  productId?: string;
  warehouseId?: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold?: number | null;
  effectiveThreshold?: number;
  isLowStock?: boolean;
}

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseInventoryRealtimeOptions {
  enabled?: boolean;
  onLowStockAlert?: (event: LowStockRealtimeEvent) => void;
  onInventoryChanged?: (event: InventoryChangedEvent) => void;
  onReconnectSync?: () => void | Promise<void>;
}

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

export function useInventoryRealtime(options: UseInventoryRealtimeOptions = {}) {
  const {
    enabled = true,
    onLowStockAlert,
    onInventoryChanged,
    onReconnectSync,
  } = options;

  const session = useAuthStore((state) => state.session);
  const accessToken = session?.tokens.accessToken ?? null;
  const role = session?.user.role ?? null;

  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  // Giữ callback mới nhất trong ref để tránh reconnect khi parent re-render
  const onLowStockRef = useRef(onLowStockAlert);
  const onInvChangedRef = useRef(onInventoryChanged);
  const onSyncRef = useRef(onReconnectSync);

  useEffect(() => {
    onLowStockRef.current = onLowStockAlert;
    onInvChangedRef.current = onInventoryChanged;
    onSyncRef.current = onReconnectSync;
  }, [onLowStockAlert, onInventoryChanged, onReconnectSync]);

  // Khử trùng lặp theo alertId hoặc (inventoryId + availableStock + timestamp phút)
  const seenAlertKeysRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnceRef = useRef<boolean>(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const canConnect =
    enabled &&
    Boolean(accessToken) &&
    (role === 'ADMIN' || role === 'WAREHOUSE_STAFF');

  useEffect(() => {
    if (!canConnect || !accessToken) {
      return;
    }

    let disposed = false;

    const connectSocket = (token: string) => {
      if (disposed) return;
      clearRetryTimer();

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      setTimeout(() => {
        if (!disposed) {
          setStatus(hasConnectedOnceRef.current ? 'reconnecting' : 'connecting');
        }
      }, 0);

      const baseUrl = getApiBaseUrl();
      // Kết nối tới namespace /notifications theo NotificationsGateway của Minh
      const socket = io(`${baseUrl}/notifications`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: false, // Tự quản lý backoff + refresh token
      });

      socketRef.current = socket;

      const scheduleReconnect = (refreshFirst = false) => {
        if (disposed) return;
        setStatus('reconnecting');
        const attempt = retryAttemptRef.current;
        const baseDelay = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempt));
        const jitter = Math.floor(Math.random() * 500);
        retryAttemptRef.current = Math.min(attempt + 1, 10);

        clearRetryTimer();
        retryTimerRef.current = setTimeout(async () => {
          if (disposed) return;
          let nextToken = useAuthStore.getState().session?.tokens.accessToken;
          if (refreshFirst || !nextToken) {
            try {
              const refreshed = await useAuthStore.getState().refresh();
              nextToken = refreshed.tokens.accessToken;
            } catch {
              setStatus('disconnected');
              return;
            }
          }
          if (nextToken && !disposed) {
            connectSocket(nextToken);
          }
        }, baseDelay + jitter);
      };

      socket.on('connect', () => {
        if (disposed) return;
        const wasReconnect = hasConnectedOnceRef.current;
        hasConnectedOnceRef.current = true;
        retryAttemptRef.current = 0;
        setStatus('connected');

        // Refetch lại alerts & inventory sau mỗi lần (re)connect để bù sự kiện bị lỡ
        if (wasReconnect) {
          void onSyncRef.current?.();
        }
      });

      socket.on('low_stock_alert', (payload: LowStockRealtimeEvent) => {
        if (disposed || !payload || !payload.inventoryId) return;
        const dedupKey = payload.alertId
          ? `alert:${payload.alertId}`
          : `inv:${payload.inventoryId}:${payload.availableStock}:${payload.triggeredAt ?? ''}`;

        if (seenAlertKeysRef.current.has(dedupKey)) return;
        seenAlertKeysRef.current.add(dedupKey);
        if (seenAlertKeysRef.current.size > 500) {
          const oldest = seenAlertKeysRef.current.values().next().value;
          if (oldest) seenAlertKeysRef.current.delete(oldest);
        }

        setLastEventAt(new Date().toISOString());
        onLowStockRef.current?.(payload);
      });

      socket.on('inventory.changed', (payload: InventoryChangedEvent) => {
        if (disposed || !payload || !payload.inventoryId) return;
        setLastEventAt(new Date().toISOString());
        onInvChangedRef.current?.(payload);
      });

      socket.on('auth_error', () => {
        if (disposed) return;
        socket.disconnect();
        scheduleReconnect(true);
      });

      socket.on('connect_error', () => {
        if (disposed) return;
        scheduleReconnect(false);
      });

      socket.on('disconnect', (reason) => {
        if (disposed) return;
        if (reason === 'io client disconnect') {
          setStatus('disconnected');
          return;
        }
        scheduleReconnect(false);
      });
    };

    connectSocket(accessToken);

    return () => {
      disposed = true;
      clearRetryTimer();
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [canConnect, accessToken, clearRetryTimer]);

  const effectiveStatus: RealtimeStatus = canConnect ? status : 'disconnected';

  return {
    status: effectiveStatus,
    isConnected: effectiveStatus === 'connected',
    isReconnecting: effectiveStatus === 'reconnecting',
    lastEventAt,
  };
}
