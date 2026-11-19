/** Enum theo tài liệu CSDL, trang 7. */
export type PaymentMethod = "MOCK_CARD" | "MOCK_EWALLET" | "COD";
export type OrderStatus = "PENDING_PAYMENT" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "CANCELLED";
export type ReservationStatus = "HOLDING" | "COMMITTED" | "RELEASED" | "EXPIRED";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";
export interface ShippingInfo {
  fullName: string; phone: string; email: string; address: string; city: string; note: string;
}
/** View model frontend; giá nguyên VND của dữ liệu mock, không phải DTO HTTP. */
export interface OrderItem {
  productId: string; name: string; price: number; image: string; quantity: number;
}
export interface AllocatedOrderItem extends OrderItem { warehouseId: string }
export interface Order {
  id: string;
  orderCode: string;
  items: AllocatedOrderItem[];
  shipping: ShippingInfo;
  payment: PaymentMethod;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  reservationStatus: ReservationStatus;
  reservationExpiresAt: string;
  cancelledReason: "PAYMENT_FAILED" | "EXPIRED" | null;
  transactionRef: string | null;
  subtotal: number; shippingFee: number; total: number; createdAt: string;
}
export interface PlaceOrderInput {
  items: OrderItem[]; shipping: ShippingInfo; payment: PaymentMethod;
}
