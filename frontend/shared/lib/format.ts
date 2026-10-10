import type { OrderStatus } from '../types/admin';

export const formatVnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫';

// Cố định múi giờ để server và client render giống nhau (tránh hydration warning)
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  });

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy',
};

// State machine một chiều theo FR-ORD-05
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  CONFIRMED: 'SHIPPING', SHIPPING: 'DELIVERED',
};
