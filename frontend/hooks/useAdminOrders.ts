'use client';
import { useCallback, useState } from 'react';
import { ORDERS } from '../shared/mock/adminMock';
import { NEXT_STATUS } from '../shared/lib/format';
import type { AdminOrder } from '../shared/types/admin';

// TODO(API): thay mock bằng GET /admin/orders và PATCH /admin/orders/{id}/status
export function useAdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>(ORDERS);
  const loading = false;
  const error: string | null = null;

  const advanceStatus = useCallback((orderId: string) => {
    setOrders(prev => prev.map(o => {
      const next = NEXT_STATUS[o.status];
      if (o.id !== orderId || !next) return o;
      const now = new Date().toISOString();
      return { ...o, status: next, updatedAt: now,
        history: [...o.history, { fromStatus: o.status, toStatus: next, actor: 'Bạn', createdAt: now }] };
    }));
  }, []);

  return { orders, loading, error, advanceStatus };
}
