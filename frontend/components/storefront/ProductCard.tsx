"use client";

import Image from "next/image";
import Link from "next/link";
import { useHydrated } from "@/hooks/useHydrated";
import { useTemporaryFeedback } from "@/hooks/useTemporaryFeedback";
import { useTranslation } from "@/hooks/useTranslation";
import { useCartStore } from "@/store/useCartStore";
import { formatVND, getTotalStock, isOutOfStock, LOW_STOCK_THRESHOLD } from "@/shared/lib/utils";
import { getCategories } from "@/shared/lib/mockData";
import type { Product } from "@/shared/types/product";

export default function ProductCard({ product }: { product: Product }) {
  const { t, language } = useTranslation();
  const addItem = useCartStore((s) => s.addItem);
  const hydrated = useHydrated();
  const inCart = useCartStore((s) => s.items.find((i) => i.productId === product.id)?.quantity ?? 0);
  const { active: justAdded, trigger: showAdded } = useTemporaryFeedback();

  const outOfStock = isOutOfStock(product);
  const totalStock = getTotalStock(product);
  const atLimit = hydrated && inCart >= totalStock;
  const canAdd = !outOfStock && !atLimit;
  const lowStock = !outOfStock && totalStock <= LOW_STOCK_THRESHOLD;
  const categoryName = getCategories().find((c) => c.id === product.category)?.name[language];

  function handleAdd() {
    if (!canAdd) return;
    const added = addItem(product, 1);
    if (added > 0) {
      showAdded();
    }
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-soft transition hover:-translate-y-0.5 hover:shadow-lifted">
      <Link
        href={`/products/${product.id}`}
        className="relative block aspect-square overflow-hidden bg-brand-50"
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          unoptimized
          sizes="(min-width: 1280px) 280px, (min-width: 768px) 33vw, 50vw"
          className={`object-cover transition duration-300 group-hover:scale-105 ${
            outOfStock ? "opacity-50 grayscale" : ""
          }`}
        />
        {outOfStock && (
          <span className="absolute left-3 top-3 rounded-full bg-slate-900/85 px-3 py-1 text-xs font-semibold text-white">
            {t.common.outOfStock}
          </span>
        )}
        {lowStock && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            {t.common.lowStock}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <span role="status" className="sr-only">{justAdded ? t.product.addedToCart : ""}</span>
        {categoryName && (
          <span className="text-xs font-medium text-accent-600">{categoryName}</span>
        )}
        <Link
          href={`/products/${product.id}`}
          className="mt-1 line-clamp-2 min-h-10 text-sm font-medium leading-5 text-slate-800 transition hover:text-brand-600"
        >
          {product.name}
        </Link>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="whitespace-nowrap text-base font-semibold text-brand-700">
            {formatVND(product.price)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          aria-label={`${outOfStock ? t.common.outOfStock : atLimit ? t.product.cartLimitReached : t.product.addToCart}: ${product.name}`}
          className={`mt-4 h-10 w-full rounded-xl text-sm font-medium transition ${
            !canAdd
              ? "cursor-not-allowed bg-slate-100 text-slate-400"
              : justAdded
                ? "bg-emerald-50 text-emerald-700"
                : "bg-brand-600 text-white shadow-soft hover:bg-brand-700"
          }`}
        >
          {outOfStock
            ? t.common.outOfStock
            : atLimit
              ? t.product.cartLimitReached
              : justAdded
              ? t.product.addedToCart
              : t.product.addToCart}
        </button>
      </div>
    </div>
  );
}
