"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import ProductCard from "@/components/storefront/ProductCard";
import { getCategories, queryProducts } from "@/shared/lib/mockData";
import type { ProductSort } from "@/shared/types/product";

const SORTS: ProductSort[] = ["default", "price-asc", "price-desc"];

/** Ô tìm kiếm: chỉ gửi khi nhấn Enter / nút tìm (key theo từ khóa để đồng bộ với URL) */
function SearchBox({
  initial,
  placeholder,
  onSearch,
}: {
  initial: string;
  placeholder: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
      className="relative w-full sm:max-w-sm"
    >
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
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
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </form>
  );
}

export default function ProductList() {
  const { t, language, format } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Đọc bộ lọc từ URL: /products?category=&search=&sort=&page=
  const category = params.get("category") ?? "all";
  const search = params.get("search") ?? "";
  const sortParam = params.get("sort");
  const sort: ProductSort = SORTS.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : "default";
  const pageNumber = Number(params.get("page"));
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const result = queryProducts({ category, search, sort, page });
  const categories = getCategories();
  const hasFilters = category !== "all" || search !== "" || sort !== "default";

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      const isDefault =
        value === "" ||
        (key === "category" && value === "all") ||
        (key === "sort" && value === "default") ||
        (key === "page" && value === "1");
      if (isDefault) next.delete(key);
      else next.set(key, value);
    }
    // Đổi bộ lọc thì quay về trang 1
    if (!("page" in changes)) next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const categoryOptions = [
    { id: "all", label: t.products.allCategories },
    ...categories.map((c) => ({ id: c.id, label: `${c.icon} ${c.name[language]}` })),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {t.products.title}
      </h1>

      {/* Thanh công cụ: tìm kiếm + sắp xếp */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBox
          key={search}
          initial={search}
          placeholder={t.products.searchPlaceholder}
          onSearch={(value) => update({ search: value })}
        />
        <div className="flex items-center gap-3">
          <label htmlFor="sort" className="text-sm text-slate-500">
            {t.products.sortBy}
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          >
            <option value="default">{t.products.sortDefault}</option>
            <option value="price-asc">{t.products.sortPriceAsc}</option>
            <option value="price-desc">{t.products.sortPriceDesc}</option>
          </select>
        </div>
      </div>

      {/* Danh mục dạng chip (màn hình nhỏ) */}
      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {categoryOptions.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => update({ category: c.id })}
            aria-pressed={category === c.id}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${
              category === c.id
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-8 flex gap-8">
        {/* Danh mục dạng sidebar (máy tính) */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t.products.category}</h2>
          <ul className="space-y-1">
            {categoryOptions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => update({ category: c.id })}
                  aria-pressed={category === c.id}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    category === c.id
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Lưới sản phẩm */}
        <section className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {format(t.products.results, { count: result.total })}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={() => router.push(pathname)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {t.products.clearFilters}
              </button>
            )}
          </div>

          {result.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-20 text-center">
              <p className="text-lg font-medium text-slate-800">{t.products.noResults}</p>
              <p className="mt-2 text-sm text-slate-500">{t.products.noResultsHint}</p>
              <button
                type="button"
                onClick={() => router.push(pathname)}
                className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-soft hover:bg-brand-700"
              >
                {t.products.clearFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 sm:gap-5">
              {result.items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Phân trang */}
          {result.totalPages > 1 && (
            <nav
              className="mt-10 flex flex-wrap items-center justify-center gap-2"
              aria-label={t.common.pagination}
            >
              <button
                type="button"
                disabled={result.page <= 1}
                onClick={() => update({ page: String(result.page - 1) })}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 transition hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.products.previous}
              </button>
              {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => update({ page: String(n) })}
                  aria-current={n === result.page ? "page" : undefined}
                  className={`h-10 w-10 rounded-xl text-sm transition ${
                    n === result.page
                      ? "bg-brand-600 font-medium text-white shadow-soft"
                      : "border border-slate-200 text-slate-600 hover:border-brand-300"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={result.page >= result.totalPages}
                onClick={() => update({ page: String(result.page + 1) })}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 transition hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t.products.nextPage}
              </button>
            </nav>
          )}
          {result.totalPages > 1 && (
            <p className="mt-3 text-center text-xs text-slate-400">
              {format(t.products.pageOf, { page: result.page, total: result.totalPages })}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
