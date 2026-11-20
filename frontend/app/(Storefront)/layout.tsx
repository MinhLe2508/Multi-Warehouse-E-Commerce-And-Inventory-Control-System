import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./storefront.css";
import Header from "@/components/storefront/Header";
import Footer from "@/components/storefront/Footer";
import ChatWidget from "@/components/storefront/ChatWidget";

const font = Inter({ subsets: ["latin", "vietnamese"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "MultiMart — Multi-Warehouse Store",
    template: "%s | MultiMart",
  },
  description: "MultiMart: hệ thống bán hàng đa kho / multi-warehouse e-commerce storefront.",
};

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`mm ${font.className}`}>
      <Header />
      <main>{children}</main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
