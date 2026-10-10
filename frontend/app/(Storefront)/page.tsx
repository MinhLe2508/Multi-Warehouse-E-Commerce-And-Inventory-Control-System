"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import ProductCard from "@/components/storefront/ProductCard";
import {
  getCategoryCount,
  getWarehouseName,
  WAREHOUSES,
  getCategories,
  getFeaturedProducts,
  getProductById,
} from "@/shared/lib/mockData";

function PerkIcon({ path }: { path: string }) {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export default function HomePage() {
  const { t, language } = useTranslation();
  const categories = getCategories();
  const featured = getFeaturedProducts();
  const sample = getProductById("p-001");

  const perks = [
    {
      title: t.home.perkDeliveryTitle,
      desc: t.home.perkDeliveryDesc,
      icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01",
    },
    {
      title: t.home.perkStockTitle,
      desc: t.home.perkStockDesc,
      icon: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10",
    },
    {
      title: t.home.perkPaymentTitle,
      desc: t.home.perkPaymentDesc,
      icon: "M3 6h18v12H3zM3 10h18M7 15h3",
    },
  ];

  return (
    <div>
      {/* Banner */}
      <section className="bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-brand-700 shadow-soft ring-1 ring-brand-100">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              {t.home.heroBadge}
            </span>
            <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              {t.home.heroTitle}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600">
              {t.home.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
              >
                {t.home.heroCta}
              </Link>
              <a
                href="#categories"
                className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
              >
                {t.home.heroSecondary}
              </a>
            </div>
          </div>

          {/* Minh họa tồn kho theo kho */}
          {sample && (
            <div className="mx-auto w-full max-w-md rounded-3xl bg-white p-6 shadow-lifted ring-1 ring-slate-100">
              <p className="text-xs font-medium uppercase tracking-wide text-accent-600">
                {t.product.stockByWarehouse}
              </p>
              <p className="mt-2 text-base font-semibold text-slate-900">{sample.name}</p>
              <ul className="mt-5 space-y-4">
                {sample.stockByWarehouse.map((s) => (
                  <li key={s.warehouseId}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="text-slate-600">{getWarehouseName(s.warehouseId, language, s.warehouseName)}</span>
                      <span className="font-medium text-slate-900">{s.quantity}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-500"
                        style={{ width: `${Math.min(100, (s.quantity / 150) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs text-slate-400">
                {WAREHOUSES.map((w) => getWarehouseName(w.id, language)).join(" · ")}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Ưu điểm */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {perks.map((p) => (
            <div
              key={p.title}
              className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-soft"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <PerkIcon path={p.icon} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Danh mục nổi bật */}
      <section id="categories" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-16 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t.home.categoriesTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t.home.categoriesSubtitle}</p>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {categories.map((c) => {
            const count = getCategoryCount(c.id);
            return (
              <Link
                key={c.id}
                href={`/products?category=${c.id}`}
                className="group flex flex-col items-center rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lifted"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-3xl transition group-hover:bg-accent-50">
                  {c.icon}
                </span>
                <span className="mt-4 text-sm font-medium text-slate-800">
                  {c.name[language]}
                </span>
                <span className="mt-1 text-xs text-slate-400">
                  {count} {t.common.units}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Sản phẩm nổi bật */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {t.home.featuredTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t.home.featuredSubtitle}</p>
          </div>
          <Link
            href="/products"
            className="text-sm font-medium text-brand-600 transition hover:text-brand-700"
          >
            {t.common.viewAll} →
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 sm:gap-5">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
