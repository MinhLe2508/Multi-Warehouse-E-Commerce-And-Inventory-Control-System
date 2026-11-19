import type { Metadata } from "next";
import LiveCheckout from "@/components/storefront/LiveCheckout";
import { MOCK_CATALOG } from "@/shared/lib/catalogApi";
import CheckoutView from "@/components/storefront/CheckoutView";

export const metadata: Metadata = {
  title: "Thanh toán",
};

export default function CheckoutPage() {
  if (!MOCK_CATALOG) return <LiveCheckout />;
  return <CheckoutView />;
}
