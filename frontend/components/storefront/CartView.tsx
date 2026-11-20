"use client";

import Link from "next/link";
import { useState } from "react";
import { RefreshCw, ShoppingBag, Trash2 } from "lucide-react";
import ProductImage from "@/components/products/ProductImage";
import { useCartSync } from "@/hooks/useCartSync";
import { useHydrated } from "@/hooks/useHydrated";
import { useCartStore } from "@/store/useCartStore";
import { cartAmount, cartHasProblem, cartTotals } from "@/shared/lib/cartModel";
import { formatVND } from "@/shared/lib/utils";
import OrderSummary from "./OrderSummary";
import { QuantityControl, ShopEmpty, ShopHeading, ShopLoading, useShopCopy } from "./ShopUi";

export default function CartView() {
  const tx = useShopCopy();
  const hydrated = useHydrated();
  const items = useCartStore((state) => state.items);
  const sync = useCartStore((state) => state.syncStatus);
  const storageError = useCartStore((state) => state.storageError);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const remove = useCartStore((state) => state.removeItem);
  const refresh = useCartSync();
  const [excluded, setExcluded] = useState<string[]>([]);
  const chosen = items.filter((item) => !excluded.includes(item.productId));
  const totals = cartTotals(chosen);
  const canOrder = chosen.length > 0 && chosen.length <= 50 && sync === "ready" &&
    !cartHasProblem(chosen) && chosen.every((item) => item.quantity <= 100);
  const destination = "/checkout?items=" + encodeURIComponent(chosen.map((item) => item.productId).join(","));

  return <div className="mm-container mm-page">
    <ShopHeading title={tx("Giỏ hàng", "Shopping bag")} back={{ href: "/products", label: tx("Tiếp tục mua sắm", "Continue shopping") }}
      subtitle={items.length > 0 && hydrated ? tx(items.length + " loại sản phẩm trong giỏ", items.length + " product types in your bag") : undefined} />
    {!hydrated ? <ShopLoading /> : !items.length ? <ShopEmpty icon={ShoppingBag} title={tx("Giỏ hàng đang trống", "Your bag is empty")}
      action={<Link href="/products" className="mm-button primary">{tx("Khám phá sản phẩm", "Explore products")}</Link>} /> : <>
      {storageError && <p role="status" className="mm-feedback warning">{tx("Giỏ hiện được lưu trong phiên này.", "The bag is available for this session only.")}</p>}
      <div className="mm-commerce-grid">
        <section className="mm-panel mm-cart-panel">
          <div className="mm-cart-toolbar">
            <label><input type="checkbox" checked={chosen.length === items.length} onChange={(event) => setExcluded(event.target.checked ? [] : items.map((item) => item.productId))} />
              {tx("Chọn tất cả", "Select all")} <small>({chosen.length}/{items.length})</small></label>
            <button type="button" className="mm-text-button" onClick={refresh} disabled={sync === "loading"}>
              <RefreshCw size={15} />{sync === "loading" ? tx("Đang kiểm tra…", "Checking…") : tx("Cập nhật giỏ", "Refresh bag")}
            </button>
          </div>
          <ul className="mm-cart-items">{items.map((item) => {
            const ready = item.catalogStatus === "available";
            const bad = item.catalogStatus === "unavailable" || (ready && item.quantity > item.maxStock);
            return <li key={item.productId}>
              <input type="checkbox" checked={!excluded.includes(item.productId)}
                aria-label={tx("Chọn", "Select") + " " + item.name}
                onChange={(event) => setExcluded((list) => event.target.checked ? list.filter((id) => id !== item.productId) : [...list, item.productId])} />
              <Link className="mm-cart-product" href={"/products/" + item.productId}>
                <span className="mm-mini-image"><ProductImage src={item.image} alt="" fill sizes="76px" /></span>
                <span><strong>{item.name}</strong>{item.sku && <small>{item.sku}</small>}
                  <span className="mm-cart-price">{formatVND(item.unitPrice ?? item.price)} {item.baseUnitPrice && <s>{formatVND(item.baseUnitPrice)}</s>}</span>
                  {bad && <small className="mm-alert-text">{item.maxStock > 0 ? tx("Hiện chỉ còn ", "Available now ") + item.maxStock : tx("Tạm hết hàng", "Out of stock")}</small>}
                  {item.priceChanged && <small>{tx("Giá vừa được cập nhật", "Price updated")}</small>}
                </span>
              </Link>
              <QuantityControl label={item.name} value={item.quantity} max={ready ? Math.min(100, item.maxStock) : item.quantity}
                onChange={(value) => setQuantity(item.productId, value)} />
              <strong className="mm-money">{formatVND(cartAmount([item]))}</strong>
              <button className="mm-icon-button mm-remove" aria-label={tx("Xóa", "Remove") + " " + item.name}
                type="button" onClick={() => remove(item.productId)}><Trash2 size={17} /></button>
            </li>;
          })}</ul>
        </section>
        <OrderSummary subtotal={totals.subtotal} total={totals.total} discount={totals.discount} estimated>
          {canOrder ? <Link className="mm-button primary full" href={destination}>{tx("Tiến hành đặt hàng", "Go to checkout")} ({chosen.length})</Link>
            : <button type="button" className="mm-button primary full" disabled>{tx("Tiến hành đặt hàng", "Go to checkout")}</button>}
          <p className="mm-summary-note">{sync === "error"
            ? tx("Chưa kiểm tra được giá và tồn kho. Hãy cập nhật giỏ.", "Could not check prices and stock. Refresh the bag.")
            : chosen.length === 0 ? tx("Chọn sản phẩm bạn muốn mua.", "Select the items to purchase.")
              : !canOrder && sync === "ready" ? tx("Kiểm tra số lượng và tình trạng của các sản phẩm đã chọn.", "Check quantities and availability for selected items.")
                : tx("Giá và phí giao hàng được tính lại khi tạo đơn.", "Prices and delivery fees are recalculated on order creation.")}</p>
        </OrderSummary>
      </div>
    </>}
  </div>;
}
