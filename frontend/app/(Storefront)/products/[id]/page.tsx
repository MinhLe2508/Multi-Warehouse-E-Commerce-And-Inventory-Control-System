import type { Metadata } from "next";
import ProductDetail from "@/components/storefront/ProductDetail";
export const metadata: Metadata = { title: "Chi tiết sản phẩm" };
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetail id={id} />;
}
