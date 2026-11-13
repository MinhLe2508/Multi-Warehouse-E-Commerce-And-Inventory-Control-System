import { authenticatedRequest } from "@/store/useAuthStore";

export type Method = "MOCK_CARD" | "MOCK_EWALLET";
export type Line = { productId: string; quantity: number };
export type Destination = { shippingRecipient: string; shippingPhone: string; shippingAddress: string; shippingRegion: string };
export interface Receipt {
  id: string; orderCode: string; grandTotal: string; status: string;
  items: { id: string; productName: string; quantity: number; lineTotal: string }[];
  statusHistory: { id: string; toStatus: string; createdAt: string }[];
}

export function createOrder(items: Line[], shipping: Destination) {
  return authenticatedRequest<{ id: string }>("/orders", {
    items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    shippingRecipient: shipping.shippingRecipient.trim(), shippingAddress: shipping.shippingAddress.trim(),
    shippingPhone: shipping.shippingPhone.trim(),
    ...(shipping.shippingRegion.trim() && { shippingRegion: shipping.shippingRegion.trim() }),
  });
}
export const readOrder = (id: string) => authenticatedRequest<Receipt>("/orders/" + encodeURIComponent(id));

// Retrying the same simulated transaction must not decrement stock again.
export function payOrder(id: string, method: Method, approved: boolean) {
  return authenticatedRequest<{ status: string; orderStatus: string }>(
    "/payments/mock/" + encodeURIComponent(id),
    { method, approved, transactionRef: id + "-" + method + (approved ? "-ok" : "-no") },
  );
}
