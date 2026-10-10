import type { Metadata } from "next";
import CartView from "@/components/storefront/CartView";

export const metadata: Metadata = {
  title: "Giỏ hàng",
};

export default function CartPage() {
  return <CartView />;
}
