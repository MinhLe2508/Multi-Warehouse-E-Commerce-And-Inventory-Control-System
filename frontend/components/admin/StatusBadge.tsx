import React from 'react';
import type { AlertLevel, OrderStatus } from '../../shared/types/admin';

const ORDER_CONFIG: Record<
  OrderStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  PENDING_PAYMENT: {
    label: 'Chờ thanh toán',
    bg: '#fef3c7',
    text: '#92400e',
    dot: '#d97706',
  },
  CONFIRMED: {
    label: 'Đã xác nhận',
    bg: '#ccfbf1',
    text: '#115e59',
    dot: '#0f766e',
  },
  SHIPPING: {
    label: 'Đang giao',
    bg: '#e0f2fe',
    text: '#075985',
    dot: '#0284c7',
  },
  DELIVERED: {
    label: 'Đã giao',
    bg: '#dcfce7',
    text: '#166534',
    dot: '#16a34a',
  },
  CANCELLED: {
    label: 'Đã hủy',
    bg: '#ffe4e6',
    text: '#9f1239',
    dot: '#e11d48',
  },
};

export const OrderBadge = ({ status }: { status: OrderStatus }) => {
  const conf = ORDER_CONFIG[status] || {
    label: status,
    bg: '#f3f4f6',
    text: '#374151',
    dot: '#6b7280',
  };

  return (
    <span
      className="badge-status"
      style={{ backgroundColor: conf.bg, color: conf.text }}
    >
      <span className="status-dot" style={{ backgroundColor: conf.dot }} />
      {conf.label}
    </span>
  );
};

export const AlertBadge = ({ level }: { level: AlertLevel }) => {
  const isCritical = level === 'CRITICAL';
  return (
    <span
      className="badge-status"
      style={{
        backgroundColor: isCritical ? '#ffe4e6' : '#fef3c7',
        color: isCritical ? '#9f1239' : '#92400e',
      }}
    >
      <span
        className="status-dot"
        style={{ backgroundColor: isCritical ? '#e11d48' : '#d97706' }}
      />
      {isCritical ? 'Hết hàng' : 'Sắp hết'}
    </span>
  );
};
