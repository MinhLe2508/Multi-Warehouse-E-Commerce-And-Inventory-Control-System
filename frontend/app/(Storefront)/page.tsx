"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Boxes, HandCoins, Truck } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCategories, useProducts } from "@/hooks/useCatalog";
import ProductCard from "@/components/storefront/ProductCard";
import { CategoryMark, ShopEmpty, ShopError, ShopLoading, useShopCopy } from "@/components/storefront/ShopUi";

export default function HomePage() {
  const tx = useShopCopy();
  const { language } = useTranslation();
  const products = useProducts({ pageSize: 8, inStock: true });
  const categories = useCategories();
  const featured = products.data?.items ?? [];
  const roots = categories.data?.filter((item) => !item.parentId) ?? [];

  return <div className="mm-container mm-home">
    <section className="mm-hero">
      <div className="mm-hero-art">
        <Image src="/storefront/technology-hero.webp" alt="" fill preload sizes="(max-width: 700px) 100vw, 70vw" />
      </div>
      <div className="mm-hero-content">
        <h1>{tx("Công nghệ cho mỗi ngày", "Technology for every day")}</h1>
        <p>{tx("Từ điện thoại, tai nghe đến thiết bị thông minh cho ngôi nhà của bạn.", "From phones and headphones to smart devices for your home.")}</p>
        <div className="mm-cta-group">
          <Link href="/products" className="mm-button hero-primary">{tx("Khám phá sản phẩm", "Explore products")}</Link>
          <a href="#categories" className="mm-button hero-secondary">{tx("Xem danh mục", "Browse categories")}</a>
        </div>
      </div>
    </section>
    <section className="mm-perks" aria-label={tx("Thông tin mua hàng", "Shopping information")}>
      <div><Truck size={22} /><span><strong>{tx("Giao hàng đa kho", "Warehouse network")}</strong><small>{tx("Phân bổ hàng theo khu vực và tồn kho", "Allocation by region and availability")}</small></span></div>
      <div><Boxes size={22} /><span><strong>{tx("Cập nhật tình trạng hàng", "Stock availability")}</strong><small>{tx("Kiểm tra lại khi đặt đơn", "Verified when you place an order")}</small></span></div>
      <div><HandCoins size={22} /><span><strong>{tx("Thanh toán khi nhận hàng", "Cash on delivery")}</strong><small>{tx("Xem số tiền cần trả trước khi xác nhận", "See your total before placing an order")}</small></span></div>
    </section>
    <section className="mm-home-section" id="categories">
      <div className="mm-section-heading"><h2>{tx("Mua theo danh mục", "Shop by category")}</h2></div>
      {categories.loading && <ShopLoading />}
      {Boolean(categories.error) && <ShopError retry={categories.retry} />}
      {roots.length > 0 && <div className="mm-category-grid">{roots.map((item) =>
        <Link key={item.id} href={"/products?category=" + encodeURIComponent(item.slug ?? item.id)}>
          <CategoryMark name={item.name.vi} /><strong>{item.name[language]}</strong>
        </Link>)}</div>}
    </section>
    <section className="mm-home-section">
      <div className="mm-section-heading">
        <h2>{tx("Sản phẩm mới", "New arrivals")}</h2>
        <Link className="mm-link" href="/products">{tx("Xem tất cả", "View all")} <ArrowUpRight size={17} /></Link>
      </div>
      {products.loading && <ShopLoading cards={4} />}
      {Boolean(products.error) && <ShopError retry={products.retry} />}
      {products.data && (featured.length ? <div className="mm-product-grid">{featured.map((item) => <ProductCard key={item.id} product={item} />)}</div>
        : <ShopEmpty title={tx("Chưa có sản phẩm còn hàng", "No products in stock yet")} />)}
    </section>
  </div>;
}
