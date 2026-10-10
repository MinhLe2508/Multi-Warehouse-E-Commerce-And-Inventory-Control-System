"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useHydrated } from "@/hooks/useHydrated";
import { selectTotalItems, useCartStore } from "@/store/useCartStore";
import type { Language } from "@/shared/lib/dictionary";

function CartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2.5 3.5h2.7l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1l1.6-6.6H6.2" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

const LANGUAGE_OPTIONS: { code: Language; label: string }[] = [
  { code: "vi", label: "VI" },
  { code: "en", label: "EN" },
];

export default function Header() {
  const { t, language, setLanguage } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const totalItems = useCartStore(selectTotalItems);
  const [query, setQuery] = useState("");

  // Số trên icon giỏ hàng chỉ hiện sau khi hydrate (tránh lệch HTML server/client)
  const cartCount = hydrated ? totalItems : 0;

  // Cập nhật thuộc tính lang của thẻ <html> theo ngôn ngữ đang chọn
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const keyword = query.trim();
    router.push(keyword ? `/products?search=${encodeURIComponent(keyword)}` : "/products");
  }

  const navItems = [
    { href: "/", label: t.header.home },
    { href: "/products", label: t.header.products },
  ];

  function isActive(href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  const searchForm = (
    <form onSubmit={handleSearch} role="search" className="relative w-full">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.header.searchPlaceholder}
        aria-label={t.header.searchPlaceholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
      />
    </form>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-base font-bold text-white shadow-soft">
            M
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            {t.common.siteName}
          </span>
        </Link>

        {/* Điều hướng (máy tính) */}
        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label={t.common.mainNavigation}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Tìm kiếm (máy tính) */}
        <div className="mx-auto hidden max-w-md flex-1 lg:block">{searchForm}</div>

        {/* Bên phải: đổi ngôn ngữ + giỏ hàng */}
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <div
            role="group"
            aria-label={t.header.language}
            className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => setLanguage(opt.code)}
                aria-pressed={language === opt.code}
                className={`rounded-md px-2.5 py-1.5 transition ${
                  language === opt.code
                    ? "bg-brand-600 text-white shadow-soft"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Link
            href="/cart"
            aria-label={t.header.cart}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          >
            <CartIcon className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white ring-2 ring-white">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Điều hướng + tìm kiếm cho màn hình nhỏ */}
      <div className="border-t border-slate-100 px-4 py-2 lg:hidden">
        <div className="mb-2 flex gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive(item.href) ? "bg-brand-50 text-brand-700" : "text-slate-600"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        {searchForm}
      </div>
    </header>
  );
}
