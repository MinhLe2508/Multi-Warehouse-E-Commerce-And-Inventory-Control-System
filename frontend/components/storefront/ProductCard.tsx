"use client";

import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import ProductImage from "@/components/products/ProductImage";
import { useCartStore } from "@/store/useCartStore";
import type { Product } from "@/shared/types/product";
import { formatVND, getTotalStock } from "@/shared/lib/utils";
import { CategoryMark, StockPill, useShopCopy } from "./ShopUi";

export function ProductPrice({ product }: { product: Product }) {
  const base = product.basePrice ?? product.price;
  const sale = product.salePrice ?? base;
  return <span className="mm-price"><strong>{formatVND(sale)}</strong>
    {Number(sale) < Number(base) && <s>{formatVND(base)}</s>}
  </span>;
}

export default function ProductCard({ product }: { product: Product }) {
  const tx = useShopCopy();
  const add = useCartStore((state) => state.addItem);
  const quantity = useCartStore((state) => state.items.find((row) => row.productId === product.id)?.quantity ?? 0);
  const [added, setAdded] = useState(false);
  const stock = getTotalStock(product);
  const discount = Number(product.discountPercent) || 0;
  const full = quantity >= Math.min(100, stock);
  return <article className="mm-product-card">
    <Link className="mm-product-link" href={"/products/" + product.id}>
      <div className="mm-product-image">
        {product.image && product.image !== "/product-placeholder.svg"
          ? <ProductImage src={product.image} alt="" fill sizes="(max-width: 580px) 48vw, (max-width: 950px) 32vw, 280px" />
          : <div className="mm-product-category-art" aria-hidden="true"><CategoryMark name={product.categoryName ?? ""} /></div>}
        {discount > 0 && <span className="mm-discount">−{discount}%</span>}
      </div>
      <div className="mm-product-text">
        <small>{product.categoryName || tx("Sản phẩm", "Product")}</small>
        <h3>{product.name}</h3>
        <ProductPrice product={product} />
      </div>
    </Link>
    <div className="mm-product-footer">
      <StockPill total={stock} />
      <button className="mm-product-add" type="button" disabled={full} aria-label={tx("Thêm vào giỏ", "Add to cart") + " · " + product.name}
        title={tx("Thêm vào giỏ", "Add to cart")} onClick={() => setAdded(add(product, 1) > 0)}>
        {added && quantity > 0 ? <Check size={18} /> : <Plus size={18} />}
      </button>
      <span role="status" className="sr-only">{added ? tx("Đã thêm vào giỏ hàng", "Added to cart") : ""}</span>
    </div>
  </article>;
}
