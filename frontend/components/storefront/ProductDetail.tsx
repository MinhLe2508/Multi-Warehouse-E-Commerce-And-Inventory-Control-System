"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useTemporaryFeedback } from "@/hooks/useTemporaryFeedback";
import { useTranslation } from "@/hooks/useTranslation";
import { useHydrated } from "@/hooks/useHydrated";
import { useCartStore } from "@/store/useCartStore";
import ProductCard from "@/components/storefront/ProductCard";
import WarehouseStockList from "@/components/storefront/WarehouseStockList";
import { getCategories, getProductById, getRelatedProducts } from "@/shared/lib/mockData";
import { formatVND, getTotalStock, isOutOfStock } from "@/shared/lib/utils";
import type { Product } from "@/shared/types/product";

function NotFoundView() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
      <p className="text-xl font-semibold text-slate-900">{t.product.notFoundTitle}</p>
      <p className="mt-2 text-sm text-slate-500">{t.product.notFoundDesc}</p>
      <Link
        href="/products"
        className="mt-8 inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-soft hover:bg-brand-700"
      >
        {t.product.backToProducts}
      </Link>
    </div>
  );
}

function DetailView({ product }: { product: Product }) {
  const { t, language, format } = useTranslation();
  const hydrated = useHydrated();
  const addItem = useCartStore((s) => s.addItem);
  const inCartRaw = useCartStore(
    (s) => s.items.find((i) => i.productId === product.id)?.quantity ?? 0,
  );
  const [quantity, setQuantity] = useState(1);
  const { active: justAdded, trigger: showAdded } = useTemporaryFeedback(2500);

  const totalStock = getTotalStock(product);
  const outOfStock = isOutOfStock(product);
  const categoryName = getCategories().find((c) => c.id === product.category)?.name[language];

  // Số đã có trong giỏ chỉ tính sau khi hydrate (tránh lệch HTML server/client)
  const inCart = hydrated ? inCartRaw : 0;
  // Số lượng còn có thể thêm = tổng tồn kho - số đã có trong giỏ
  const remaining = Math.max(0, totalStock - inCart);
  const canAdd = !outOfStock && remaining > 0;
  // Luôn kẹp số lượng trong khoảng 1..remaining
  const qty = canAdd ? Math.min(Math.max(1, quantity), remaining) : 1;
  const atMax = canAdd && qty >= remaining;

  const related = getRelatedProducts(product);

  function handleAdd() {
    if (!canAdd) return;
    const added = addItem(product, qty);
    if (added > 0) {
      setQuantity(1);
      showAdded();
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500" aria-label={t.common.breadcrumb}>
        <Link href="/" className="transition hover:text-brand-600">
          {t.header.home}
        </Link>
        <span>/</span>
        <Link href="/products" className="transition hover:text-brand-600">
          {t.product.breadcrumbProducts}
        </Link>
        <span>/</span>
        <span className="text-slate-800">{product.name}</span>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        {/* Ảnh */}
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-brand-50 shadow-soft ring-1 ring-slate-100">
          <Image
            src={product.image}
            alt={product.name}
            fill
            unoptimized
            priority
            sizes="(min-width: 1024px) 560px, 100vw"
            className={`object-cover ${outOfStock ? "opacity-50 grayscale" : ""}`}
          />
          {outOfStock && (
            <span className="absolute left-4 top-4 rounded-full bg-slate-900/85 px-4 py-1.5 text-sm font-semibold text-white">
              {t.common.outOfStock}
            </span>
          )}
        </div>

        {/* Thông tin */}
        <div>
          {categoryName && (
            <span className="text-sm font-medium text-accent-600">{categoryName}</span>
          )}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {product.name}
          </h1>
          <p className="mt-4 whitespace-nowrap text-3xl font-semibold text-brand-700">
            {formatVND(product.price)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {outOfStock ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {t.common.outOfStock}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                {t.common.inStock}
              </span>
            )}
            <span className="text-sm text-slate-500">
              {format(t.product.totalStock, { count: totalStock })}
            </span>
          </div>

          {/* Chọn số lượng + thêm vào giỏ */}
          <div className="mt-8 border-t border-slate-100 pt-8">
            <p className="text-sm font-medium text-slate-800">{t.product.quantity}</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex h-12 items-center rounded-xl border border-slate-200 bg-white focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
                <button
                  type="button"
                  aria-label={t.product.decrease}
                  onClick={() => setQuantity(qty - 1)}
                  disabled={!canAdd || qty <= 1}
                  className="h-full w-12 text-lg text-slate-600 transition hover:text-brand-600 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.max(1, remaining)}
                  value={qty}
                  disabled={!canAdd}
                  aria-label={t.product.quantity}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    setQuantity(Number.isFinite(n) && n >= 1 ? n : 1);
                  }}
                  className="h-full w-14 border-x border-slate-200 bg-transparent text-center text-base font-medium text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:text-slate-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label={t.product.increase}
                  onClick={() => setQuantity(qty + 1)}
                  disabled={!canAdd || atMax}
                  className="h-full w-12 text-lg text-slate-600 transition hover:text-brand-600 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!canAdd}
                className={`h-12 flex-1 rounded-xl px-6 text-base font-medium transition sm:flex-none sm:min-w-56 ${
                  canAdd
                    ? "bg-brand-600 text-white shadow-soft hover:bg-brand-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {outOfStock ? t.common.outOfStock : !canAdd ? t.product.cartLimitReached : t.product.addToCart}
              </button>
            </div>

            {/* Thông báo */}
            <div className="mt-4 space-y-2 text-sm" aria-live="polite">
              {atMax && (
                <p className="text-amber-700">
                  {format(t.product.maxReached, { count: totalStock })}
                </p>
              )}
              {inCart > 0 && (
                <p className="text-slate-500">{format(t.product.inCartHint, { count: inCart })}</p>
              )}
              {justAdded && (
                <p className="font-medium text-emerald-700">
                  ✓ {t.product.addedToCart}{" "}
                  <Link href="/cart" className="underline underline-offset-2 hover:text-emerald-800">
                    {t.header.cart} →
                  </Link>
                </p>
              )}
            </div>
          </div>

          {/* Tồn kho theo kho */}
          <div className="mt-8">
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              {t.product.stockByWarehouse}
            </h2>
            <WarehouseStockList stock={product.stockByWarehouse} />
          </div>
        </div>
      </div>

      {/* Mô tả */}
      <section className="mt-12 max-w-3xl">
        <h2 className="text-lg font-semibold text-slate-900">{t.product.description}</h2>
        <p className="mt-3 leading-7 text-slate-600">{product.description}</p>
      </section>

      {/* Sản phẩm liên quan */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            {t.product.relatedTitle}
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 sm:gap-5">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ProductDetail({ id }: { id: string }) {
  const product = getProductById(id);
  if (!product) return <NotFoundView />;
  // key theo id: chuyển sang sản phẩm khác thì reset số lượng đang chọn
  return <DetailView key={product.id} product={product} />;
}
