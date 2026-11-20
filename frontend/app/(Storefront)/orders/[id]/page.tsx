import type { Metadata } from "next";
import LiveReceipt from "@/components/storefront/LiveReceipt";
export const metadata: Metadata = { title: "Chi tiết đơn hàng" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveReceipt id={id} />;
}
