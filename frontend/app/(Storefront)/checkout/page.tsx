import type { Metadata } from "next";
import Link from "next/link";
import { MOCK_CATALOG } from "@/shared/lib/catalogApi";
import CheckoutView from "@/components/storefront/CheckoutView";

export const metadata: Metadata = {
  title: "Thanh toán",
};

export default function CheckoutPage() {
  if (!MOCK_CATALOG) return <div className="mx-auto max-w-3xl px-6 py-20">
    <h1 className="text-2xl font-semibold">Chức năng đặt hàng đang được hoàn thiện</h1>
    <p className="mt-4">Sản phẩm đã được lưu trong giỏ. Vui lòng quay lại sau để đặt hàng.</p>
    <Link href="/cart" className="mt-6 inline-block text-brand-600">Quay lại giỏ hàng</Link>
  </div>;
  return <CheckoutView />;
}
