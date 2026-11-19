import type { Metadata } from "next";
import { Suspense } from "react";
import ProductList from "@/components/storefront/ProductList";

export const metadata: Metadata = {
  title: "Sản phẩm",
};

export default function ProductsPage() {
  // useSearchParams (trong ProductList) cần được bọc trong Suspense
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <ProductList />
    </Suspense>
  );
}
