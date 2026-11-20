import type { Metadata } from "next";
import LiveCheckout from "@/components/storefront/LiveCheckout";

export const metadata: Metadata = { title: "Đặt hàng" };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ items?: string; product?: string; quantity?: string }> }) {
  const { items, product, quantity } = await searchParams;
  const selected = typeof items === "string" ? items.split(",").filter((id) => uuid.test(id)).slice(0, 51) : undefined;
  const amount = typeof quantity === "string" ? Number(quantity) : 1;
  const direct = typeof product === "string" && uuid.test(product) ? { id: product, quantity: Number.isInteger(amount) && amount >= 1 && amount <= 100 ? amount : 1 } : undefined;
  return <LiveCheckout selected={selected} direct={direct} />;
}
