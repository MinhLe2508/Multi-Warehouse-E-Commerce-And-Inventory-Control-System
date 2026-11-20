import type { Metadata } from "next";
import { Inter } from "next/font/google";
const font = Inter({ subsets: ["latin", "vietnamese"], display: "swap" });
export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={font.className}>{children}</div>;
}
