"use client";

import Link from "next/link";
import {
  AlertCircle, Archive, ArrowLeft, Baby, BrushCleaning, Camera, CarFront, ChevronLeft, ChevronRight,
  Coffee, CookingPot, Dumbbell, Gamepad2, HardDrive, Headphones, HousePlug, LampDesk, Laptop,
  Layers3, Luggage, Minus, Monitor, NotebookPen, PackageOpen, PawPrint, Plug, Plus, Router,
  Smartphone, Sparkles, Watch, Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/useAuthStore";
import { normalizeText } from "@/shared/lib/utils";
import { isBuyerRole } from "@/shared/lib/roleRedirect";

export function useShopCopy() {
  const { language } = useTranslation();
  return (vi: string, en: string) => language === "vi" ? vi : en;
}

export function StoreBrand() {
  return <Link className="mm-brand" href="/" aria-label="MultiMart">
    <span className="mm-brand-mark"><Layers3 size={22} aria-hidden="true" /></span>
    <span>Multi<span>Mart</span></span>
  </Link>;
}

export function SupportButton({ className, children }: { className?: string; children: ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("multimart:open-support"))}>{children}</button>;
}

export function ShopHeading({ title, subtitle, back, action }: {
  title: string; subtitle?: string; back?: { href: string; label: string }; action?: ReactNode;
}) {
  return <div className="mm-page-heading">
    {back && <Link href={back.href} className="mm-back"><ArrowLeft size={16} aria-hidden="true" /> {back.label}</Link>}
    <div className="mm-heading-row"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>
  </div>;
}

export function ShopEmpty({ title, detail, action, icon: Icon = PackageOpen }: {
  title: string; detail?: string; action?: ReactNode; icon?: LucideIcon;
}) {
  return <div className="mm-empty">
    <span className="mm-empty-icon"><Icon size={28} aria-hidden="true" /></span>
    <h2>{title}</h2>{detail && <p>{detail}</p>}{action}
  </div>;
}

export function ShopError({ message, retry }: { message?: string; retry?: () => void }) {
  const tx = useShopCopy();
  return <div className="mm-feedback error" role="alert">
    <AlertCircle size={19} aria-hidden="true" /><span>{message ?? tx("Chưa tải được dữ liệu. Vui lòng thử lại.", "Could not load data. Please try again.")}</span>
    {retry && <button type="button" className="mm-link" onClick={retry}>{tx("Thử lại", "Retry")}</button>}
  </div>;
}

export function ShopLoading({ cards = 0 }: { cards?: number }) {
  const tx = useShopCopy();
  const content = cards > 0 ? <div className="mm-product-grid" aria-hidden="true">
    {Array.from({ length: cards }, (_, index) => <div className="mm-skeleton mm-skeleton-card" key={index} />)}
  </div> : <div className="mm-skeleton mm-skeleton-panel" aria-hidden="true" />;
  return <div role="status" aria-label={tx("Đang tải", "Loading")}>{content}</div>;
}

export function BuyerGate({ children, next }: { children: ReactNode; next: string }) {
  const ready = useAuthStore((state) => state.ready);
  const user = useAuthStore((state) => state.session?.user);
  const tx = useShopCopy();
  if (!ready) return <div className="mm-container mm-page"><ShopLoading /></div>;
  if (user && isBuyerRole(user.role) && !user.mustChangePassword) return children;
  return <div className="mm-container mm-page"><ShopEmpty
    title={tx("Đăng nhập để tiếp tục", "Sign in to continue")}
    detail={tx("Dùng tài khoản MultiMart để mua sắm và xem đơn hàng của bạn.", "Use your MultiMart account to shop and view your orders.")}
    action={<Link className="mm-button primary" href={user?.mustChangePassword ? "/change-password" : "/login?next=" + encodeURIComponent(next)}>
      {user?.mustChangePassword ? tx("Đổi mật khẩu", "Change password") : tx("Đăng nhập", "Sign in")}
    </Link>}
  /></div>;
}

export function QuantityControl({ value, min = 1, max, onChange, label }: {
  value: number; min?: number; max: number; onChange: (value: number) => void; label: string;
}) {
  const tx = useShopCopy();
  return <div className="mm-quantity" role="group" aria-label={label}>
    <button type="button" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={tx("Giảm số lượng", "Decrease quantity")}><Minus size={16} /></button>
    <output aria-live="polite">{value}</output>
    <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={tx("Tăng số lượng", "Increase quantity")}><Plus size={16} /></button>
  </div>;
}

export function ShopPager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const tx = useShopCopy();
  if (pages < 2 && page === 1) return null;
  return <nav className="mm-pager" aria-label={tx("Phân trang", "Pagination")}>
    <button className="mm-icon-button" type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label={tx("Trang trước", "Previous page")}><ChevronLeft size={18} /></button>
    <span>{tx("Trang", "Page")} {page} / {Math.max(1, pages)}</span>
    <button className="mm-icon-button" type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label={tx("Trang sau", "Next page")}><ChevronRight size={18} /></button>
  </nav>;
}

const categoryIcons: Array<[string, LucideIcon]> = [
  ["dien gia dung", CookingPot], ["mang & wi-fi", Router], ["gaming", Gamepad2],
  ["chup anh", Camera], ["bep", CookingPot], ["nha cua & trang tri", LampDesk],
  ["van phong", NotebookPen], ["the thao", Dumbbell], ["du lich", Luggage],
  ["ca nhan", Sparkles], ["me & be", Baby], ["thu cung", PawPrint],
  ["xe & phu kien", CarFront], ["sua chua", Wrench], ["ve sinh", BrushCleaning],
  ["do uong", Coffee], ["phu kien", Plug],
  ["am thanh", Headphones], ["dien thoai", Smartphone], ["laptop", Laptop], ["may chieu", Monitor],
  ["man hinh", Monitor], ["gia dung", HousePlug], ["thiet bi deo", Watch], ["luu tru", HardDrive],
];

export function CategoryMark({ name }: { name: string }) {
  const Icon = categoryIcons.find(([term]) => normalizeText(name).includes(term))?.[1] ?? Archive;
  return <span className="mm-category-mark"><Icon size={23} aria-hidden="true" /></span>;
}

export function StockPill({ total }: { total: number }) {
  const tx = useShopCopy();
  const tone = total === 0 ? "neutral" : total <= 5 ? "warning" : "success";
  return <span className={"mm-pill " + tone}><span aria-hidden="true" />{total === 0 ? tx("Hết hàng", "Out of stock")
    : total <= 5 ? tx("Sắp hết", "Low stock") : tx("Còn hàng", "In stock")}</span>;
}
