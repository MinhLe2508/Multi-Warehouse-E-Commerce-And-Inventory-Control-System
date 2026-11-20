"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { useCategories, useProducts } from "@/hooks/useCatalog";
import { useTranslation } from "@/hooks/useTranslation";
import { productQueryString } from "@/shared/lib/catalogApi";
import type { ProductQuery, ProductSort } from "@/shared/types/product";
import { ShopEmpty, ShopError, ShopHeading, ShopLoading, ShopPager, useShopCopy } from "./ShopUi";
import ProductCard from "./ProductCard";

const sortOrder: ProductSort[] = ["default", "price-asc", "price-desc", "name-asc"];
function price(value: string | null) {
  if (!value || !/^\d{1,12}(\.\d{1,2})?$/.test(value)) return undefined;
  return Number(value);
}

export default function ProductList() {
  const tx = useShopCopy();
  const { language } = useTranslation();
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const search = (params.get("search") ?? "").trim().slice(0, 160);
  const category = (params.get("category") ?? "").slice(0, 160);
  const sort = sortOrder.find((item) => item === params.get("sort")) ?? "default";
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1;
  const query: ProductQuery = {
    search, category, sort, page, pageSize: 12,
    minPrice: price(params.get("minPrice")),
    maxPrice: price(params.get("maxPrice")),
    inStock: params.get("inStock") === "true", onSale: params.get("onSale") === "true",
  };
  const products = useProducts(query);
  const categories = useCategories();
  const categoryName = categories.data?.find((item) => item.id === category || item.slug === category)?.name[language];
  const labels = [tx("Mới nhất", "Newest"), tx("Giá thấp đến cao", "Price low to high"), tx("Giá cao đến thấp", "Price high to low"), tx("Tên A–Z", "Name A–Z")];

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  function navigate(next: ProductQuery) {
    const value = productQueryString({ ...query, pageSize: undefined, ...next });
    router.push("/products" + (value ? "?" + value : ""));
  }
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    navigate({
      page: 1,
      category: String(form.get("category") ?? ""),
      minPrice: price(String(form.get("minPrice") ?? "")), maxPrice: price(String(form.get("maxPrice") ?? "")),
      inStock: form.has("inStock"), onSale: form.has("onSale"),
    });
    setOpen(false);
  }

  return <div className="mm-container mm-page">
    <ShopHeading title={categoryName || tx("Khám phá sản phẩm", "Explore products")}
      subtitle={search ? tx("Kết quả cho “" + search + "”", "Results for “" + search + "”") : undefined} />
    <div className="mm-catalog">
      {open && <button className="mm-filter-scrim" onClick={() => setOpen(false)} aria-label={tx("Đóng bộ lọc", "Close filters")} />}
      <aside className={"mm-panel mm-filters" + (open ? " open" : "")} id="catalog-filters">
        <div className="mm-filter-heading"><h2><SlidersHorizontal size={19} /> {tx("Bộ lọc", "Filters")}</h2>
          <button type="button" className="mm-icon-button mm-filter-close" onClick={() => setOpen(false)} aria-label={tx("Đóng", "Close")}><X size={18} /></button>
        </div>
        <form onSubmit={filter} key={params.toString()} className="mm-form">
          <fieldset>
            <legend>{tx("Danh mục", "Category")}</legend>
            {Boolean(categories.error) && <ShopError retry={categories.retry} />}
            <label className="mm-filter-choice"><input type="radio" name="category" value="" defaultChecked={!category || category === "all"} />{tx("Tất cả sản phẩm", "All products")}</label>
            {categories.data?.map((item) => <label className={"mm-filter-choice" + (item.parentId ? " child" : "")} key={item.id}>
              <input type="radio" name="category" value={item.slug ?? item.id} defaultChecked={category === item.id || category === item.slug} />{item.name[language]}
            </label>)}
          </fieldset>
          <fieldset>
            <legend>{tx("Khoảng giá", "Price range")}</legend>
            <div className="mm-price-range">
              <label>{tx("Từ", "From")}<input className="mm-input" name="minPrice" type="number" min="0" max="999999999999" step="1" defaultValue={query.minPrice} /></label>
              <label>{tx("Đến", "To")}<input className="mm-input" name="maxPrice" type="number" min="0" max="999999999999" step="1" defaultValue={query.maxPrice} /></label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{tx("Tình trạng", "Availability")}</legend>
            <label className="mm-filter-choice"><input type="checkbox" name="inStock" defaultChecked={query.inStock} />{tx("Còn hàng", "In stock")}</label>
            <label className="mm-filter-choice"><input type="checkbox" name="onSale" defaultChecked={query.onSale} />{tx("Đang giảm giá", "On sale")}</label>
          </fieldset>
          <div className="mm-filter-actions"><button className="mm-button primary" type="submit">{tx("Áp dụng", "Apply")}</button>
            <Link href="/products" className="mm-link" onClick={() => setOpen(false)}>{tx("Xóa lọc", "Clear")}</Link></div>
        </form>
      </aside>
      <section className="mm-results" aria-label={tx("Danh sách sản phẩm", "Product results")}>
        <div className="mm-result-bar">
          <button type="button" className="mm-button mm-filter-toggle" onClick={() => setOpen(true)}
            aria-expanded={open} aria-controls="catalog-filters"><SlidersHorizontal size={17} />{tx("Bộ lọc", "Filters")}</button>
          <span role="status">{products.data ? products.data.total + tx(" sản phẩm", " products") : tx("Sản phẩm", "Products")}</span>
          <label>{tx("Sắp xếp", "Sort by")}
            <select className="mm-input" value={sort} onChange={(event) => navigate({ sort: event.target.value as ProductSort, page: 1 })}>
              {sortOrder.map((value, index) => <option key={value} value={value}>{labels[index]}</option>)}
            </select>
          </label>
        </div>
        {products.loading && <ShopLoading cards={6} />}
        {Boolean(products.error) && <ShopError message={query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice
          ? tx("Giá tối thiểu phải nhỏ hơn hoặc bằng giá tối đa.", "The minimum price must be no more than the maximum.") : undefined} retry={products.retry} />}
        {products.data && (products.data.items.length
          ? <div className="mm-product-grid">{products.data.items.map((item) => <ProductCard key={item.id} product={item} />)}</div>
          : <ShopEmpty title={tx("Chưa tìm thấy sản phẩm", "No products found")}
            action={<Link href="/products" className="mm-button">{tx("Xem tất cả sản phẩm", "View all products")}</Link>} />)}
        {products.data && <ShopPager page={page} pages={products.data.totalPages} onPage={(value) => navigate({ page: value })} />}
      </section>
    </div>
  </div>;
}
