import type { Metadata } from "next";
import ConfirmationView from "@/components/storefront/ConfirmationView";

import { MOCK_CATALOG } from "@/shared/lib/catalogApi";
import LiveReceipt from "@/components/storefront/LiveReceipt";

export const metadata: Metadata = {
  title: "Xác nhận đơn hàng",
};

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ id?: string; method?: string }> }) {
  if (!MOCK_CATALOG) {
    const { id, method } = await searchParams;
    return <LiveReceipt id={id ?? ""} method={method === "MOCK_EWALLET" ? method : "MOCK_CARD"} />;
  }
  return <ConfirmationView />;
}
