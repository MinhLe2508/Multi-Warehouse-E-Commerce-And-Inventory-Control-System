import type { Order, OrderItem, PaymentMethod, ShippingInfo } from "@/shared/types/order";

/** localStorage là dữ liệu không tin cậy: kiểm tra trước khi merge vào store. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isShippingInfo(value: unknown): value is ShippingInfo {
  return isRecord(value) && ["fullName", "phone", "email", "address", "city", "note"]
    .every((key) => typeof value[key] === "string");
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "COD" || value === "MOCK_CARD" || value === "MOCK_EWALLET";
}

export function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isOrderItem(value: unknown): value is OrderItem {
  return isRecord(value) && typeof value.productId === "string" &&
    typeof value.name === "string" && typeof value.image === "string" &&
    isMoney(value.price) && typeof value.quantity === "number" &&
    Number.isSafeInteger(value.quantity) && value.quantity > 0;
}

export function isOrder(value: unknown): value is Order {
  if (!isRecord(value) || typeof value.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(value.id) || typeof value.orderCode !== "string" || !Array.isArray(value.items) ||
    value.items.length === 0 || !value.items.every(isOrderItem) ||
    !isShippingInfo(value.shipping) || !isPaymentMethod(value.payment) ||
    !isMoney(value.subtotal) || !isMoney(value.shippingFee) || !isMoney(value.total) ||
    typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (!value.items.every((item) => isRecord(item) && typeof item.warehouseId === "string") ||
    typeof value.reservationExpiresAt !== "string" || !Number.isFinite(Date.parse(value.reservationExpiresAt)) ||
    !(value.transactionRef === null || typeof value.transactionRef === "string")) return false;
  const validState =
    (value.status === "PENDING_PAYMENT" && value.paymentStatus === "PENDING" && value.reservationStatus === "HOLDING" && value.cancelledReason === null) ||
    (["CONFIRMED", "SHIPPING", "DELIVERED"].includes(String(value.status)) && value.paymentStatus === "SUCCESS" && value.reservationStatus === "COMMITTED" && value.cancelledReason === null) ||
    (value.status === "CANCELLED" && value.paymentStatus === "FAILED" && value.reservationStatus === "RELEASED" && value.cancelledReason === "PAYMENT_FAILED") ||
    (value.status === "CANCELLED" && value.paymentStatus === "PENDING" && value.reservationStatus === "EXPIRED" && value.cancelledReason === "EXPIRED");
  return validState && value.subtotal === value.items.reduce((sum, item) => sum + item.price * item.quantity, 0) &&
    value.total === value.subtotal + value.shippingFee;
}
