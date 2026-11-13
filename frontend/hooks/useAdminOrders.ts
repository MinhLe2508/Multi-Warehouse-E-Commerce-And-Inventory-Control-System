'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch, AuthError, extractErrorMessage } from '../shared/lib/apiClient';
import { NEXT_STATUS } from '../shared/lib/format';
import type { AdminOrder, OrderStatus } from '../shared/types/admin';

interface ApiAdminOrderItem {
  id: string;
  productId: string;
  warehouseId: string;
  productName: string;
  sku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

interface ApiAdminOrder {
  id: string;
  orderCode: string;
  status: OrderStatus;
  grandTotal: string;
  shippingRecipient: string;
  shippingPhone: string;
  shippingAddress: string;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    username: string;
    fullName: string;
  } | null;
  items: ApiAdminOrderItem[];
  payments: Array<{
    method: 'MOCK_CARD' | 'MOCK_EWALLET' | 'COD';
  }>;
  statusHistory: Array<{
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actorName?: string;
    createdAt: string;
  }>;
}

interface ApiAdminOrdersResponse {
  items: ApiAdminOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OrderFilters {
  status?: OrderStatus | 'ALL';
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}

function mapApiOrder(raw: ApiAdminOrder): AdminOrder {
  const warehouseSet = new Set<string>();
  const items = raw.items.map((item) => {
    const whShort = item.warehouseId.slice(0, 8).toUpperCase();
    warehouseSet.add(whShort);
    return {
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      warehouseCode: whShort,
    };
  });

  return {
    id: raw.id,
    orderCode: raw.orderCode,
    status: raw.status,
    customerName: raw.customer?.fullName || raw.shippingRecipient,
    grandTotal: Number(raw.grandTotal),
    warehouseCodes: Array.from(warehouseSet),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    shipping: {
      recipient: raw.shippingRecipient,
      phone: raw.shippingPhone,
      address: raw.shippingAddress,
    },
    paymentMethod: raw.payments[0]?.method ?? 'MOCK_CARD',
    items,
    history: raw.statusHistory.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actor: h.actorName || 'Hệ thống',
      createdAt: h.createdAt,
    })),
  };
}

export function useAdminOrders(initialFilters: OrderFilters = {}) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [filters, setFilters] = useState<OrderFilters>({
    status: initialFilters.status ?? 'ALL',
    from: initialFilters.from ?? '',
    to: initialFilters.to ?? '',
    q: initialFilters.q ?? '',
    page: initialFilters.page ?? 1,
    limit: initialFilters.limit ?? 20,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchOrders = useCallback(async (overrideFilters?: OrderFilters) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const active = overrideFilters ?? filters;

    try {
      const params = new URLSearchParams();
      if (active.status && active.status !== 'ALL') {
        params.set('status', active.status);
      }
      if (active.from) params.set('from', active.from);
      if (active.to) params.set('to', active.to);
      if (active.q?.trim()) params.set('q', active.q.trim());
      params.set('page', String(active.page ?? 1));
      params.set('limit', String(active.limit ?? 20));

      const data = await apiGet<ApiAdminOrdersResponse>(
        `/admin/orders?${params.toString()}`
      );

      setOrders((data.items || []).map(mapApiOrder));
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setLastUpdated(
        new Date().toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setError(null);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Không tải được danh sách đơn hàng từ máy chủ.'));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchOrders();
    }, 0);

    const interval = setInterval(() => {
      void fetchOrders();
    }, 30000);

    const onFocus = () => {
      void fetchOrders();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchOrders]);

  const updateFilters = useCallback((patch: Partial<OrderFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...patch,
      page: patch.page !== undefined ? patch.page : 1,
    }));
  }, []);

  const updateStatus = useCallback(
    async (
      orderId: string,
      targetStatus: 'SHIPPING' | 'DELIVERED',
      note?: string
    ): Promise<boolean> => {
      setConflictNotice(null);
      setUpdatingId(orderId);
      try {
        const updatedRaw = await apiPatch<ApiAdminOrder>(`/admin/orders/${orderId}/status`, {
          targetStatus,
          ...(note ? { note } : {}),
        });
        const mapped = mapApiOrder(updatedRaw);
        setOrders((prev) => prev.map((o) => (o.id === orderId ? mapped : o)));
        setLastUpdated(
          new Date().toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
        return true;
      } catch (err: unknown) {
        if (err instanceof AuthError && err.status === 409) {
          setConflictNotice(
            'Trạng thái đã thay đổi bởi thao tác khác. Dữ liệu đã được tải lại.'
          );
          await fetchOrders();
        } else {
          setError(extractErrorMessage(err, 'Không thể cập nhật trạng thái đơn hàng.'));
        }
        return false;
      } finally {
        setUpdatingId(null);
      }
    },
    [fetchOrders]
  );

  const advanceStatus = useCallback(
    async (orderId: string) => {
      const currentOrder = orders.find((o) => o.id === orderId);
      if (!currentOrder) return;
      const next = NEXT_STATUS[currentOrder.status];
      if (next !== 'SHIPPING' && next !== 'DELIVERED') return;
      await updateStatus(orderId, next);
    },
    [orders, updateStatus]
  );

  return {
    orders,
    total,
    totalPages,
    filters,
    loading,
    updatingId,
    error,
    lastUpdated,
    conflictNotice,
    setConflictNotice,
    updateFilters,
    updateStatus,
    advanceStatus,
    refreshOrders: () => fetchOrders(),
  };
}
