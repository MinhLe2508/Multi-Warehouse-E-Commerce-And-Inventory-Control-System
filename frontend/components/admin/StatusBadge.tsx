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

export const StockBadge = ({
  status,
  size = 'md',
}: {
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';
  size?: 'sm' | 'md';
}) => {
  const configs = {
    OUT_OF_STOCK: {
      label: 'Hết hàng',
      bg: '#ffe4e6',
      text: '#9f1239',
      dot: '#e11d48',
    },
    LOW_STOCK: {
      label: 'Sắp hết',
      bg: '#fef3c7',
      text: '#92400e',
      dot: '#d97706',
    },
    IN_STOCK: {
      label: 'Đủ hàng',
      bg: '#dcfce7',
      text: '#166534',
      dot: '#16a34a',
    },
  };

  const conf = configs[status] || configs.IN_STOCK;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full ${
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
      style={{ backgroundColor: conf.bg, color: conf.text }}
    >
      <span
        className="rounded-full inline-block animate-pulse"
        style={{
          width: size === 'sm' ? 6 : 7,
          height: size === 'sm' ? 6 : 7,
          backgroundColor: conf.dot,
        }}
      />
      {conf.label}
    </span>
  );
};
