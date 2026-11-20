import { authenticatedRequest } from "@/store/useAuthStore";

export type Method = "MOCK_CARD" | "MOCK_EWALLET";
export type CheckoutMethod = "COD" | Method;
export type OrderState = "PENDING_PAYMENT" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "CANCELLED";
export type Line = { productId: string; quantity: number };
export type Destination = { shippingRecipient: string; shippingPhone: string; shippingAddress: string; shippingRegion: string };
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
  reservationExpiresAt: string | null;
  cancelledReason: string | null;
  items: OrderLine[];
  payment: { method: CheckoutMethod; status: "PENDING" | "SUCCESS" | "FAILED"; amount: string;
    transactionRef: string; processedAt: string | null } | null;
}
export interface Receipt extends CustomerOrder {
  statusHistory: { id: string; fromStatus: OrderState | null; toStatus: OrderState; reason: string | null; createdAt: string }[];
}

export function createOrder(items: Line[], shipping: Destination, checkout?: { method: CheckoutMethod; id: string }) {
  return authenticatedRequest<{ id: string }>("/orders", {
    items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    shippingRecipient: shipping.shippingRecipient.trim(), shippingAddress: shipping.shippingAddress.trim(),
    shippingPhone: shipping.shippingPhone.trim(),
    ...(shipping.shippingRegion.trim() && { shippingRegion: shipping.shippingRegion.trim() }),
    ...(checkout && { paymentMethod: checkout.method, checkoutId: checkout.id }),
  });
}

export const readOrder = (id: string) => authenticatedRequest<Receipt>("/orders/" + encodeURIComponent(id));

export function payOrder(id: string, method: Method, approved: boolean, attempt?: string) {
  return authenticatedRequest<{ status: string; orderStatus: string }>(
    "/payments/mock/" + encodeURIComponent(id),
    { method, approved, transactionRef: attempt ?? (id + "-" + method + (approved ? "-ok" : "-no")) },
  );
}

export function UUIDForCheckout() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
