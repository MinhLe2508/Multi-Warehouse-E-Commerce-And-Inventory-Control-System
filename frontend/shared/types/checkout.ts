import type { Destination } from "@/shared/lib/liveOrders";

export type DeliveryWarehouse = { id: string; code: string; name: string; region: string };
export type FavoriteAddress = Destination & { id: string; label: string; isDefault: boolean };
export type DeliveryOptions = {
  warehouses: DeliveryWarehouse[];
  addresses: FavoriteAddress[];
  lastOrder: Destination | null;
};

export type Promotion = {
  id: string; code: string; name: string; percent: number; allCategories: boolean;
  expiresAt: string; createdAt: string; status: "ACTIVE" | "EXPIRED";
  categories: { id: string; name: string }[];
};
export type BuyerPromotion = Promotion & { claimed: boolean };

export type CheckoutQuote = {
  subtotal: string; discountTotal: string; promotionDiscountTotal: string; shippingFee: string; grandTotal: string;
  lines: { productId: string; lineTotal: string; promotionDiscountAmount: string }[];
};
