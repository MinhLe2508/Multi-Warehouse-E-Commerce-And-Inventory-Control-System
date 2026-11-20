"use client";

import Link from "next/link";
import { Headphones, ShoppingBag } from "lucide-react";
import { StoreBrand, SupportButton, useShopCopy } from "./ShopUi";

export default function Footer() {
  const tx = useShopCopy();
  return <footer className="mm-footer">
    <div className="mm-container mm-footer-grid">
      <section><StoreBrand /><p>{tx("Mua sắm điện thoại, máy tính và thiết bị thông minh.", "Shop phones, computers, and smart devices.")}</p></section>
      <section>
        <h2><ShoppingBag size={17} aria-hidden="true" /> {tx("Mua sắm", "Shopping")}</h2>
        <Link href="/products">{tx("Tất cả sản phẩm", "All products")}</Link>
        <Link href="/cart">{tx("Giỏ hàng", "Shopping bag")}</Link>
        <Link href="/orders">{tx("Theo dõi đơn hàng", "Track an order")}</Link>
      </section>
      <section>
        <h2><Headphones size={17} aria-hidden="true" /> {tx("Hỗ trợ", "Support")}</h2>
        <SupportButton>{tx("Hỏi về mua hàng, thanh toán và giao hàng", "Ask about ordering, payment, and delivery")}</SupportButton>
        <Link href="/account">{tx("Thông tin tài khoản", "Account information")}</Link>
      </section>
    </div>
    <div className="mm-container mm-footer-bottom">© {new Date().getFullYear()} MultiMart</div>
  </footer>;
}
