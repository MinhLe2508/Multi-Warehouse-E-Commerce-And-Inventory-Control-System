"use client";

import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { WAREHOUSES, getWarehouseName } from "@/shared/lib/mockData";

export default function Footer() {
  const { t, format, language } = useTranslation();

  return (
    <footer className="mt-16 border-t border-slate-100 bg-slate-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
        {/* Thương hiệu */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-base font-bold text-white shadow-soft">
              M
            </span>
            <span className="text-lg font-semibold tracking-tight text-slate-900">
              {t.common.siteName}
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">{t.footer.tagline}</p>
        </div>

        {/* Mua sắm */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t.footer.shop}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li>
              <Link href="/" className="transition hover:text-brand-600">
                {t.header.home}
              </Link>
            </li>
            <li>
              <Link href="/products" className="transition hover:text-brand-600">
                {t.header.products}
              </Link>
            </li>
            <li>
              <Link href="/cart" className="transition hover:text-brand-600">
                {t.header.cart}
              </Link>
            </li>
          </ul>

          <h3 className="mt-8 text-sm font-semibold text-slate-900">{t.footer.support}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li>{t.footer.shipping}</li>
            <li>{t.footer.returns}</li>
            <li>{t.footer.faq}</li>
          </ul>
        </div>

        {/* Kho */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t.footer.warehouses}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            {WAREHOUSES.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
                {getWarehouseName(w.id, language)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-slate-400 sm:px-6 lg:px-8">
          {format(t.footer.rights, { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
