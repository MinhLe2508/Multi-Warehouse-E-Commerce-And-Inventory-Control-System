import type { Metadata } from "next";
import ConfirmationView from "@/components/storefront/ConfirmationView";
import LiveReceipt from "@/components/storefront/LiveReceipt";
import { MOCK_CATALOG } from "@/shared/lib/catalogApi";

export const metadata: Metadata = { title: "Xác nhận đơn hàng" };

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ id?: string; method?: string }> }) {
  if (MOCK_CATALOG) return <ConfirmationView />;
  const { id, method } = await searchParams;
  return <LiveReceipt id={typeof id === "string" ? id : ""} method={method === "MOCK_EWALLET" || method === "MOCK_CARD" ? method : undefined} fromCheckout />;
}
