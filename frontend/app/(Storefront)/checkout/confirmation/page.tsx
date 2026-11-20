import type { Metadata } from "next";
import LiveReceipt from "@/components/storefront/LiveReceipt";

export const metadata: Metadata = { title: "Xác nhận đơn hàng" };

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <LiveReceipt id={typeof id === "string" ? id : ""} fromCheckout />;
}
