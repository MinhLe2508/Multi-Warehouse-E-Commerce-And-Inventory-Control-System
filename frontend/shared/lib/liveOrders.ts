import { authenticatedRequest } from "@/store/useAuthStore";
import type { PaymentSupportRequest } from "@/shared/types/paymentSupport";

export type CheckoutMethod = "COD" | "BANK_TRANSFER";
export type OrderPaymentMethod = CheckoutMethod | "MOCK_CARD" | "MOCK_EWALLET";
export type VietQrInstructions = {
  bankName: string; accountName: string; accountNumber: string; amount: string; transferCode: string; transferMemo?: string; canSimulate: boolean; qrImage: string;
};
export type OrderState = "PENDING_PAYMENT" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "CANCELLED";
export type Line = { productId: string; quantity: number };
export type Destination = {
  shippingRecipient: string; shippingPhone: string; shippingAddress: string;
  shippingRegion?: string; shippingWarehouseId?: string | null;
};
export type CustomerProfile = {
  id: string; fullName: string; username: string; email: string; phone: string | null; address: string | null;
  avatarUrl: string | null; emailVerifiedAt: string | null; isActive: boolean; createdAt: string;
};
export type OrderLine = {
  id: string; productId: string; sku: string; productName: string; quantity: number; unitPrice: string;
  discountAmount: string; lineTotal: string; imageUrl: string | null;
};
export interface CustomerOrder {
  id: string; orderCode: string; createdAt: string; subtotal: string; discountTotal: string;
  shippingFee: string; grandTotal: string; status: OrderState; canCancel: boolean;
  shippingRecipient: string; shippingPhone: string; shippingAddress: string; shippingRegion: string | null;
  shippingWarehouse?: { id: string; name: string; code: string } | null;
  promotionCode?: string | null;
  promotionDiscountTotal?: string;
  reservationExpiresAt: string | null;
  cancelledReason: string | null;
  items: OrderLine[];
  payment: { method: OrderPaymentMethod; status: "PENDING" | "SUCCESS" | "FAILED"; amount: string;
    transactionRef: string; processedAt: string | null; reviewRequired: boolean; simulated: boolean;
    supportAvailableAt: string | null; supportRequest: PaymentSupportRequest | null } | null;
}
export interface Receipt extends CustomerOrder {
  statusHistory: { id: string; fromStatus: OrderState | null; toStatus: OrderState; reason: string | null; createdAt: string }[];
}

export function createOrder(items: Line[], shipping: Destination, checkout?: {
  method: CheckoutMethod; id: string; promotionId?: string; expectedTotal?: string;
}) {
  return authenticatedRequest<{ id: string }>("/orders", {
    items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    shippingRecipient: shipping.shippingRecipient.trim(), shippingAddress: shipping.shippingAddress.trim(),
    shippingPhone: shipping.shippingPhone.trim(),
    ...(shipping.shippingRegion?.trim() && { shippingRegion: shipping.shippingRegion.trim() }),
    ...(shipping.shippingWarehouseId && { shippingWarehouseId: shipping.shippingWarehouseId }),
    ...(checkout && {
      paymentMethod: checkout.method, checkoutId: checkout.id,
      ...(checkout.promotionId && { promotionId: checkout.promotionId }),
      ...(checkout.expectedTotal && { expectedTotal: checkout.expectedTotal }),
    }),
  });
}

export const readOrder = (id: string) => authenticatedRequest<Receipt>("/orders/" + encodeURIComponent(id));

export function UUIDForCheckout() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
