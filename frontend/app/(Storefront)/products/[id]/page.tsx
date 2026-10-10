import type { Metadata } from "next";
import ProductDetail from "@/components/storefront/ProductDetail";
import { PRODUCTS, getProductById } from "@/shared/lib/mockData";

/** Tạo sẵn trang tĩnh cho từng sản phẩm mock. Khi có API thật, bỏ hàm này hoặc lấy id từ API. */
export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

// Next 16: params là một Promise
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);
  return { title: product?.name ?? "Sản phẩm" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetail id={id} />;
}
