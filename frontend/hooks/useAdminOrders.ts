'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { ORDERS } from '../shared/mock/adminMock';
import { NEXT_STATUS } from '../shared/lib/format';
import type { AdminOrder } from '../shared/types/admin';

// TODO(API): Sẽ nối API thật khi Task 22 (AdminOrdersController) hoàn thành với OrdersService của Huy.
// Hiện tại duy trì dữ liệu mẫu trong bộ nhớ (không lưu localStorage) kèm chiến lược polling và xử lý xung đột 409.
export function useAdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>(ORDERS);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [error, setError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const fetchOrders = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      // Khi có API backend: const data = await authenticatedRequest<AdminOrder[]>('/admin/orders');
      // Tạm thời refresh timestamp và giữ đồng bộ
      setLastUpdated(
        new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải đơn hàng';
      setError(msg);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Chu kỳ 30 giây tự động làm mới
    const interval = setInterval(fetchOrders, 30000);

    // Lấy lại dữ liệu khi tab được focus lại
    const onFocus = () => {
      fetchOrders();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchOrders]);

  const advanceStatus = useCallback(
    async (orderId: string) => {
      setConflictNotice(null);
      try {
        // Mô phỏng kiểm tra xung đột trạng thái (409)
        const currentOrder = orders.find(o => o.id === orderId);
        if (!currentOrder) {
          throw new Error('Đơn hàng không tồn tại.');
        }

        const next = NEXT_STATUS[currentOrder.status];
        if (!next) {
          throw new Error('Đơn hàng không thể chuyển tiếp trạng thái.');
        }

        const now = new Date().toISOString();
        setOrders(prev =>
          prev.map(o => {
            if (o.id !== orderId) return o;
            return {
              ...o,
              status: next,
              updatedAt: now,
              history: [
                ...o.history,
                { fromStatus: o.status, toStatus: next, actor: 'Bạn', createdAt: now },
              ],
            };
          })
        );

        // Ngay sau khi cập nhật thành công, làm mới lại dữ liệu và timestamp
        setLastUpdated(
          new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
      } catch {
        // Xử lý xung đột 409
        setConflictNotice('Đơn vừa được cập nhật bởi thao tác khác. Dữ liệu đã được làm mới.');
        await fetchOrders();
      }
    },
    [orders, fetchOrders]
  );

  return {
    orders,
    loading,
    error,
    lastUpdated,
    conflictNotice,
    setConflictNotice,
    advanceStatus,
    refreshOrders: fetchOrders,
  };
}
