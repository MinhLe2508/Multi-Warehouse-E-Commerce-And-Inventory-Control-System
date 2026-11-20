"use client";

import Link from "next/link";
import { useState } from "react";
import { ShoppingBag, Truck } from "lucide-react";
import ProductImage from "@/components/products/ProductImage";
import { useProduct, useProducts } from "@/hooks/useCatalog";
import type { Product } from "@/shared/types/product";
import { getTotalStock } from "@/shared/lib/utils";
import { MOCK_CATALOG } from "@/shared/lib/catalogApi";
import { useCartStore } from "@/store/useCartStore";
import ProductCard, { ProductPrice } from "./ProductCard";
import { QuantityControl, ShopEmpty, ShopError, ShopLoading, StockPill, useShopCopy } from "./ShopUi";

function ItemDetail({ product }: { product: Product }) {
  const tx = useShopCopy();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(0);
  const inCart = useCartStore((state) => state.items.find((row) => row.productId === product.id)?.quantity ?? 0);
  const add = useCartStore((state) => state.addItem);
  const total = getTotalStock(product);
  const limit = Math.min(100, total);
  const related = useProducts({ category: product.category, pageSize: 5, inStock: true }, Boolean(product.category));
  const suggestions = related.data?.items.filter((item) => item.id !== product.id).slice(0, 4) ?? [];

  return <>
    <nav className="mm-breadcrumb" aria-label={tx("Đường dẫn", "Breadcrumb")}>
      <Link href="/">{tx("Trang chủ", "Home")}</Link>
      <Link href="/products">{tx("Sản phẩm", "Products")}</Link>
      {product.category && product.categoryName && <Link href={"/products?category=" + encodeURIComponent(product.category)}>{product.categoryName}</Link>}
    </nav>
    <section className="mm-detail">
      <div className="mm-detail-image"><ProductImage src={product.image} alt={product.name} fill preload sizes="(max-width: 760px) 100vw, 46vw" /></div>
      <div className="mm-panel mm-detail-copy">
        <div className="mm-detail-meta">{product.sku && <small>SKU {product.sku}</small>}<StockPill total={total} /></div>
        <h1>{product.name}</h1>
        <ProductPrice product={product} />
        {Number(product.discountPercent) > 0 && <span className="mm-inline-discount">{tx("Giảm", "Save")} {Number(product.discountPercent)}%</span>}
        {product.description && <p className="mm-description">{product.description}</p>}
        {total > 0 && <div className="mm-detail-quantity">
          <label>{tx("Số lượng", "Quantity")}</label>
          <QuantityControl label={tx("Số lượng mua", "Purchase quantity")} value={quantity} max={limit} onChange={setQuantity} />
          {inCart > 0 && <small>{tx("Trong giỏ", "In bag")} {inCart}</small>}
        </div>}
        <div className="mm-cta-group">
          <button className="mm-button primary" type="button" disabled={total === 0 || inCart >= limit}
            onClick={() => setAdded(add(product, Math.min(quantity, limit - inCart)))}>
            <ShoppingBag size={18} />{tx("Thêm vào giỏ", "Add to bag")}
          </button>
          {total > 0 && <Link href={MOCK_CATALOG ? "/cart" : "/checkout?product=" + encodeURIComponent(product.id) + "&quantity=" + Math.min(quantity, limit)}
            onClick={MOCK_CATALOG ? () => add(product, Math.max(0, Math.min(quantity, limit - inCart))) : undefined} className="mm-button">
            {tx("Mua ngay", "Buy now")}
          </Link>}
        </div>
        {added > 0 && <p className="mm-feedback success" role="status">{tx("Đã thêm sản phẩm vào giỏ.", "Item added to your bag.")}
          <Link href="/cart" className="mm-link">{tx("Xem giỏ", "View bag")}</Link></p>}
        <div className="mm-detail-delivery"><Truck size={20} /><span>{tx("Tồn kho được kiểm tra lại khi đặt hàng.", "Stock is checked again when you place your order.")}</span></div>
      </div>
    </section>
    {suggestions.length > 0 && <section className="mm-home-section"><div className="mm-section-heading"><h2>{tx("Sản phẩm cùng danh mục", "More in this category")}</h2></div>
      <div className="mm-product-grid">{suggestions.map((item) => <ProductCard key={item.id} product={item} />)}</div>
    </section>}
  </>;
}

export default function ProductDetail({ id }: { id: string }) {
  const tx = useShopCopy();
  const product = useProduct(id);
  return <div className="mm-container mm-page">{product.loading ? <ShopLoading />
    : product.data ? <ItemDetail key={product.data.id} product={product.data} />
      : product.error && typeof product.error === "object" && "status" in product.error && product.error.status === 404
        ? <ShopEmpty title={tx("Sản phẩm hiện không có sẵn", "This product is unavailable")}
          action={<Link className="mm-button primary" href="/products">{tx("Xem sản phẩm khác", "Browse other products")}</Link>} />
        : <ShopError retry={product.retry} />}</div>;
}
