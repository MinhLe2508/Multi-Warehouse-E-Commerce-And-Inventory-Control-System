"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, ChevronDown, Headphones, PackageCheck, Search, ShoppingBag, Truck, UserRound } from "lucide-react";
import ProductImage from "@/components/products/ProductImage";
import { useProducts } from "@/hooks/useCatalog";
import { useShopResource, SHOP_NOTIFICATIONS_CHANGED } from "@/hooks/useShopResource";
import { useHydrated } from "@/hooks/useHydrated";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/useAuthStore";
import { selectTotalItems, useCartStore } from "@/store/useCartStore";
import { formatVND } from "@/shared/lib/utils";
import { StoreBrand, SupportButton, useShopCopy } from "./ShopUi";

export default function Header() {
  const tx = useShopCopy();
  const { language, setLanguage } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const cartCount = useCartStore(selectTotalItems);
  const user = useAuthStore((state) => state.session?.user);
  const signOut = useAuthStore((state) => state.logout);
  const customer = user?.role === "CUSTOMER" && !user.mustChangePassword ? user : undefined;
  const unread = useShopResource<{ count: number }>(customer ? "/notifications/unread-count" : null,
    { identity: customer?.id, interval: 30_000, event: SHOP_NOTIFICATIONS_CHANGED });
  const [query, setQuery] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [focus, setFocus] = useState(false);
  const account = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSuggestion(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const showSuggestions = focus && suggestion.length >= 2 && suggestion === query.trim();
  const matches = useProducts({ search: suggestion, pageSize: 4 }, showSuggestions);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFocus(false);
    const value = query.trim();
    router.push(value ? "/products?search=" + encodeURIComponent(value) : "/products");
  }

  function link(href: string, text: string, active = false) {
    return <Link href={href} aria-current={active ? "page" : undefined}>{text}</Link>;
  }

  return <>
    <div className="mm-announcement">
      <div className="mm-container mm-announcement-inner">
        <span><Truck size={15} aria-hidden="true" />{tx("Giao hàng từ hệ thống nhiều kho", "Delivery from our warehouse network")}</span>
        <SupportButton><Headphones size={15} aria-hidden="true" />{tx("Hỗ trợ", "Support")}</SupportButton>
      </div>
    </div>
    <header className="mm-header">
      <div className="mm-container">
        <div className="mm-header-main">
          <StoreBrand />
          <form className="mm-search" role="search" onSubmit={search}
            onFocus={() => setFocus(true)} onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocus(false);
            }}
            onKeyDown={(event) => { if (event.key === "Escape") setFocus(false); }}>
            <Search size={19} aria-hidden="true" />
            <input type="search" aria-label={tx("Tìm sản phẩm", "Search products")}
              placeholder={tx("Tìm tên sản phẩm hoặc SKU…", "Search for a product or SKU…")}
              value={query} onChange={(event) => setQuery(event.target.value)} maxLength={160} />
            <button type="submit">{tx("Tìm", "Search")}</button>
            {showSuggestions && matches.data && matches.data.items.length > 0 && <ul className="mm-suggestions">
              {matches.data.items.map((item) => <li key={item.id}>
                <Link href={"/products/" + item.id} onClick={() => setFocus(false)}>
                  <span className="mm-suggest-image"><ProductImage src={item.image} alt="" fill sizes="40px" /></span>
                  <span>{item.name}<small>{formatVND(item.salePrice ?? item.basePrice ?? item.price)}</small></span>
                </Link>
              </li>)}
            </ul>}
          </form>
          <div className="mm-header-actions">
            {customer && <Link className="mm-icon-button mm-counter" href="/notifications"
              aria-label={tx("Thông báo", "Notifications") + (unread.data?.count ? " · " + unread.data.count : "")}>
              <Bell size={20} />
              {Boolean(unread.data?.count) && <sup>{Math.min(unread.data?.count ?? 0, 99)}</sup>}
            </Link>}
            {customer ? <details className="mm-account" ref={account}>
              <summary className="mm-icon-button" aria-label={tx("Tài khoản", "Account")}><UserRound size={20} /><ChevronDown size={13} className="mm-account-chevron" /></summary>
              <div className="mm-account-menu">
                <strong>{customer.username}</strong>
                <Link href="/account" onClick={() => account.current?.removeAttribute("open")}>{tx("Hồ sơ cá nhân", "Profile")}</Link>
                <Link href="/orders" onClick={() => account.current?.removeAttribute("open")}>{tx("Đơn hàng của tôi", "My orders")}</Link>
                <button type="button" onClick={() => { account.current?.removeAttribute("open"); void signOut().finally(() => router.replace("/")); }}>{tx("Đăng xuất", "Sign out")}</button>
              </div>
            </details> : <Link href="/login" className="mm-icon-button" aria-label={tx("Đăng nhập", "Sign in")}><UserRound size={20} /></Link>}
            <Link className="mm-icon-button mm-cart-link mm-counter" href="/cart" aria-label={tx("Giỏ hàng", "Cart") + (hydrated && cartCount ? " · " + cartCount : "")}>
              <ShoppingBag size={20} />{hydrated && cartCount > 0 && <sup>{Math.min(cartCount, 99)}</sup>}
            </Link>
          </div>
        </div>
        <nav className="mm-nav" aria-label={tx("Điều hướng mua sắm", "Shop navigation")}>
          <div className="mm-nav-links">
            {link("/", tx("Trang chủ", "Home"), pathname === "/")}
            {link("/products", tx("Sản phẩm", "Products"), pathname === "/products" || pathname.startsWith("/products/"))}
            {link("/#categories", tx("Danh mục", "Categories"))}
            <Link href="/orders" aria-current={pathname.startsWith("/orders") ? "page" : undefined}><PackageCheck size={16} />{tx("Đơn hàng của tôi", "My orders")}</Link>
          </div>
          <div className="mm-language" role="group" aria-label={tx("Ngôn ngữ", "Language")}>
            {(["vi", "en"] as const).map((value) => <button type="button" key={value}
              aria-pressed={language === value} onClick={() => setLanguage(value)}>{value.toUpperCase()}</button>)}
          </div>
        </nav>
      </div>
    </header>
  </>;
}
