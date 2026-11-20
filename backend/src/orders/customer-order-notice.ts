import { OrderStatus, Prisma } from '@prisma/client';

const text: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Đơn hàng đang chờ thanh toán',
  CONFIRMED: 'Đơn hàng đã được xác nhận',
  SHIPPING: 'Đơn hàng đang được giao',
  DELIVERED: 'Đơn hàng đã giao',
  CANCELLED: 'Đơn hàng đã hủy',
};

export function recordCustomerOrderNotice(
  tx: Prisma.TransactionClient,
  order: { id: string; userId: string; orderCode: string },
  status: OrderStatus,
) {
  return tx.notification.create({
    data: {
      userId: order.userId,
      type: 'ORDER_UPDATE',
      title: text[status],
      body: order.orderCode,
      referenceType: 'Order',
      referenceId: order.id,
    },
  });
}
