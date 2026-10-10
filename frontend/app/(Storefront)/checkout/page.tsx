import type { Metadata } from "next";
import CheckoutView from "@/components/storefront/CheckoutView";

export const metadata: Metadata = {
  title: "Thanh toán",
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
