import type { Metadata } from "next";
import Header from "@/components/storefront/Header";
import Footer from "@/components/storefront/Footer";

export const metadata: Metadata = {
  title: {
    default: "MultiMart — Multi-Warehouse Store",
    template: "%s | MultiMart",
  },
  description: "MultiMart: hệ thống bán hàng đa kho / multi-warehouse e-commerce storefront.",
};

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
