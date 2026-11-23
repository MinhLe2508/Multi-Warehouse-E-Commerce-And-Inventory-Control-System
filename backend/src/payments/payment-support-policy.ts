export const PAYMENT_SUPPORT_WAIT_MS = 30_000;

// Dùng mốc giữ hàng do PostgreSQL tạo, kể cả với đơn cũ từ phiên DB khác múi giờ.
export const paymentReservationStart = {
  select: { createdAt: true },
  orderBy: { id: 'asc' },
  take: 1,
} as const;

export function paymentWindowStartsAt(order: {
  createdAt: Date;
  reservations: Array<{ createdAt: Date }>;
}): Date {
  return order.reservations[0]?.createdAt ?? order.createdAt;
}

export const paymentSupportSelect = {
  status: true,
  bankReference: true,
  createdAt: true,
  resolvedAt: true,
  resolutionNote: true,
} as const;
