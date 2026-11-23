'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch, AuthError, extractErrorMessage } from '../shared/lib/apiClient';
import { NEXT_STATUS } from '../shared/lib/format';
import type { AdminOrder, OrderStatus, Warehouse } from '../shared/types/admin';
import type { AdminPaymentSupport } from '../shared/types/paymentSupport';

interface ApiAdminOrderItem {
  id: string;
  productId: string;
  warehouse?: Pick<Warehouse, 'code' | 'name'>;
  productName: string;
  sku: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface ApiAdminOrder {
  id: string;
  orderCode: string;
  status: OrderStatus;
  grandTotal: string;
  promotionCode?: string | null;
  promotionDiscountTotal?: string;
  shippingWarehouse?: Pick<Warehouse, 'id' | 'name' | 'code'> | null;
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
    method: AdminOrder['paymentMethod'];
    status: NonNullable<AdminOrder['paymentStatus']>;
  }>;
  paymentSupport?: AdminPaymentSupport | null;
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

interface OrderFilters {
  warehouseId: string;
  status: OrderStatus | 'ALL';
  from: string;
  to: string;
  q: string;
  paymentSupport: 'ALL' | 'OPEN';
  page: number;
  limit: number;
}

type OrdersSnapshot = {
  filters: OrderFilters;
  orders: AdminOrder[];
  total: number;
  totalPages: number;
  lastUpdated: string;
  error: string | null;
};

export function mapApiOrder(raw: ApiAdminOrder): AdminOrder {
  const warehouseSet = new Set<string>();
  const items = raw.items.map((item) => {
    const warehouseCode = item.warehouse?.code ?? '';
    if (warehouseCode) warehouseSet.add(warehouseCode);
    return {
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      warehouseCode,
      warehouseName: item.warehouse?.name ?? '',
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
    paymentStatus: raw.payments[0]?.status ?? null,
    paymentSupport: raw.paymentSupport ?? null,
    items,
    history: raw.statusHistory.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      actor: h.actorName || 'Hệ thống',
      createdAt: h.createdAt,
    })),
  };
}

export function useAdminOrders(warehouseId: string) {
  const [filters, setFilters] = useState<OrderFilters>({
    warehouseId,
    status: 'ALL',
    from: '',
    to: '',
    q: '',
    paymentSupport: 'ALL',
    page: 1,
    limit: 20,
  });
  if (filters.warehouseId !== warehouseId) {
    setFilters({ ...filters, warehouseId, page: 1 });
  }

  const [snapshot, setSnapshot] = useState<OrdersSnapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const isUpdating = useRef(false);

  const refreshOrders = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.warehouseId !== 'ALL') params.set('warehouseId', filters.warehouseId);
      if (filters.status !== 'ALL') params.set('status', filters.status);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.paymentSupport === 'OPEN') params.set('paymentSupport', 'OPEN');

      try {
        const data = await apiGet<ApiAdminOrdersResponse>(`/admin/orders?${params.toString()}`);
        if (!active) return;
        if (filters.page > data.totalPages) {
          setFilters((current) =>
            current === filters ? { ...current, page: data.totalPages } : current
          );
          return;
        }

        setSnapshot({
          filters,
          orders: data.items.map(mapApiOrder),
          total: data.total,
          totalPages: data.totalPages,
          lastUpdated: new Date().toLocaleTimeString('vi-VN'),
          error: null,
        });
      } catch (err: unknown) {
        if (active) {
          setSnapshot({
            filters,
            orders: [],
            total: 0,
            totalPages: 1,
            lastUpdated: '—',
            error: extractErrorMessage(err, 'Không tải được danh sách đơn hàng từ máy chủ.'),
          });
        }
      }
    }, 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, revision]);

  useEffect(() => {
    const interval = setInterval(refreshOrders, 30000);
    window.addEventListener('focus', refreshOrders);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshOrders);
    };
  }, [refreshOrders]);

  const updateFilters = useCallback((patch: Partial<Omit<OrderFilters, 'warehouseId'>>) => {
    setUpdateError(null);
    setFilters((prev) => ({
      ...prev,
      ...patch,
      page: patch.page ?? 1,
    }));
  }, []);

  const updateStatus = useCallback(
    async (
      orderId: string,
      targetStatus: 'SHIPPING' | 'DELIVERED',
      note?: string,
      codCollected = false,
    ): Promise<boolean> => {
      if (isUpdating.current) return false;
      isUpdating.current = true;
      setConflictNotice(null);
      setUpdateError(null);
      setUpdating(true);
      try {
        await apiPatch<ApiAdminOrder>(`/admin/orders/${orderId}/status`, {
          targetStatus,
          ...(note ? { note } : {}),
          ...(codCollected ? { codCollected: true } : {}),
        });
        refreshOrders();
        return true;
      } catch (err: unknown) {
        if (err instanceof AuthError && err.status === 409) {
          setConflictNotice(
            'Trạng thái đã thay đổi bởi thao tác khác. Dữ liệu đã được tải lại.'
          );
          refreshOrders();
        } else {
          setUpdateError(extractErrorMessage(err, 'Không thể cập nhật trạng thái đơn hàng.'));
        }
        return false;
      } finally {
        isUpdating.current = false;
        setUpdating(false);
      }
    },
    [refreshOrders]
  );

  const current = snapshot?.filters === filters ? snapshot : null;
  const advanceStatus = useCallback(
    async (orderId: string) => {
      const currentOrder = current?.orders.find((o) => o.id === orderId);
      if (!currentOrder) return;
      const next = NEXT_STATUS[currentOrder.status];
      if (next !== 'SHIPPING' && next !== 'DELIVERED') return;
      await updateStatus(orderId, next, undefined, next === 'DELIVERED' && currentOrder.paymentMethod === 'COD');
    },
    [current, updateStatus]
  );

  return {
    orders: current?.orders ?? [],
    total: current?.total ?? 0,
    totalPages: current?.totalPages ?? 1,
    filters,
    loading: current === null,
    updating,
    error: current?.error ?? null,
    updateError,
    lastUpdated: current?.lastUpdated ?? '—',
    conflictNotice,
    setConflictNotice,
    updateFilters,
    updateStatus,
    advanceStatus,
    refreshOrders,
  };
}
