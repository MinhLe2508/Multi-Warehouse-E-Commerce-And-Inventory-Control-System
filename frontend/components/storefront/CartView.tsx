"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useHydrated } from "@/hooks/useHydrated";
import { selectTotalItems, useCartStore } from "@/store/useCartStore";
import { useCartSync } from "@/hooks/useCartSync";
import { cartAmount, cartHasProblem } from "@/shared/lib/cartModel";
import { MOCK_CATALOG } from "@/shared/lib/catalogApi";
import { SHIPPING_FEE } from "@/shared/lib/mockOrders";
import { formatVND } from "@/shared/lib/utils";

export default function CartView() {
  const { t, format, language } = useTranslation();
  const refresh = useCartSync();
  const syncStatus = useCartStore((s) => s.syncStatus);
  const storageError = useCartStore((s) => s.storageError);
  const vi = language === "vi";
  const hydrated = useHydrated();
  const items = useCartStore((s) => s.items);
  const subtotal = cartAmount(items);
  const totalItems = useCartStore(selectTotalItems);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);

  // Giỏ hàng lấy từ localStorage nên chỉ hiển thị sau khi hydrate (tránh nháy "giỏ trống")
  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t.cart.title}
        </h1>
        <div className="min-h-[50vh]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t.cart.title}
        </h1>
        {storageError && <p role="alert" className="mt-4 text-sm text-amber-800">
          {vi ? "Không đọc được giỏ hàng đã lưu. Bạn có thể thêm lại sản phẩm; hãy kiểm tra quyền lưu dữ liệu của trình duyệt." : "Saved cart could not be read. You can add items again; please check browser storage permissions."}
        </p>}
        <div className="mt-10 rounded-3xl border border-dashed border-slate-200 py-24 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <svg
              className="h-8 w-8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="9" cy="20" r="1.4" />
              <circle cx="18" cy="20" r="1.4" />
              <path d="M2.5 3.5h2.7l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1l1.6-6.6H6.2" />
            </svg>
          </div>
          <p className="mt-6 text-lg font-semibold text-slate-900">{t.cart.emptyTitle}</p>
          <p className="mt-2 text-sm text-slate-500">{t.cart.emptyDesc}</p>
          <Link
            href="/products"
            className="mt-8 inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
          >
            {t.cart.continueShopping}
          </Link>
        </div>
      </div>
    );
  }

  const rows = items.map((item) => ({
    item, max: item.maxStock, soldOut: item.maxStock <= 0,
    overStock: item.maxStock > 0 && item.quantity > item.maxStock,
  }));
  const hasProblem = syncStatus !== "ready" || cartHasProblem(items);
  const total = cartAmount([...items, { productId: "shipping", name: "", image: "", price: SHIPPING_FEE, quantity: 1, maxStock: 1 }]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-3">
        {!MOCK_CATALOG && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          {vi ? "Giỏ hàng lưu trên trình duyệt này. Tạm tính theo giá niêm yết; giá cuối cùng và tồn kho được xác nhận khi đặt hàng. Thêm vào giỏ chưa giữ hàng." : "Cart is saved in this browser. Listed prices are estimates; final prices and stock are confirmed when ordering. Adding to cart does not reserve stock."}
        </p>}
        {storageError && <p role="alert" className="text-sm text-amber-800">
          {vi ? "Trình duyệt không đọc/lưu được giỏ hàng. Giỏ hiện tại vẫn dùng được nhưng có thể mất khi tải lại trang." : "Browser storage could not be read or saved. This cart may be lost on reload."}
        </p>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p role="status" aria-live="polite">
            {syncStatus === "loading" ? (vi ? "Đang kiểm tra giá và tồn kho…" : "Checking prices and stock…") :
              syncStatus === "error" ? (vi ? "Chưa kiểm tra được một số sản phẩm. Giỏ hàng vẫn được giữ lại." : "Some products could not be checked. Your cart is preserved.") :
              syncStatus === "ready" ? (vi ? "Đã cập nhật thông tin sản phẩm." : "Product details updated.") :
              (vi ? "Giỏ hàng chưa được kiểm tra." : "Cart has not been checked yet.")}
          </p>
          <button type="button" onClick={refresh} disabled={syncStatus === "loading"}
            className="rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">
            {vi ? "Kiểm tra lại" : "Refresh cart"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {t.cart.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {format(t.cart.itemsCount, { count: totalItems })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { if (window.confirm(vi ? "Xóa tất cả sản phẩm trong giỏ?" : "Clear all items from your cart?")) clearCart(); }}
          className="text-sm font-medium text-slate-500 transition hover:text-red-600"
        >
          {t.cart.clearCart}
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Danh sách sản phẩm */}
        <section className="lg:col-span-2" aria-label={t.cart.title}>
          {/* Tiêu đề cột (máy tính) */}
          <div className="hidden grid-cols-[1fr_8rem_9rem_8rem_2.5rem] items-center gap-4 border-b border-slate-100 px-2 pb-3 text-xs font-medium uppercase tracking-wide text-slate-400 xl:grid">
            <span>{t.cart.product}</span>
            <span className="text-right">{t.cart.unitPrice}</span>
            <span className="text-center">{t.cart.quantity}</span>
            <span className="text-right">{t.cart.lineTotal}</span>
            <span />
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map(({ item, max, soldOut, overStock }) => (
              <li
                key={item.productId}
                data-testid="cart-row"
                className="grid grid-cols-2 items-center gap-x-4 gap-y-3 px-2 py-5 xl:grid-cols-[1fr_8rem_9rem_8rem_2.5rem]"
              >
                {/* Ảnh + tên */}
                <div className="col-span-2 flex items-center gap-4 xl:col-span-1">
                  <Link
                    href={`/products/${item.productId}`}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50 ring-1 ring-slate-100"
                  >
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      unoptimized
                      sizes="80px"
                      className={`object-cover ${soldOut ? "opacity-50 grayscale" : ""}`}
                    />
                  </Link>
                  <div className="min-w-0">
                    <Link
                      href={`/products/${item.productId}`}
                      className="line-clamp-2 text-sm font-medium text-slate-800 transition hover:text-brand-600"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500 xl:hidden">{formatVND(item.unitPrice ?? item.price)}</p>
                    {item.catalogStatus === "unavailable" && <p className="mt-1 text-xs text-red-600">{vi ? "Sản phẩm không còn được bán. Vui lòng xóa khỏi giỏ." : "This product is no longer available. Please remove it."}</p>}
                    {item.catalogStatus === "error" && <p className="mt-1 text-xs text-amber-700">{vi ? "Không kiểm tra được sản phẩm; hãy thử lại." : "Could not check this product; please retry."}</p>}
                    {item.priceChanged && <p className="mt-1 text-xs text-amber-700">{vi ? "Giá đã thay đổi, tạm tính đã được cập nhật." : "Price changed; the estimate has been updated."}</p>}
                    {soldOut && item.catalogStatus !== "unavailable" && (
                      <p className="mt-1 text-xs font-medium text-red-600">
                        {t.cart.outOfStockItem}
                      </p>
                    )}
                    {overStock && (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        {format(t.cart.stockLimit, { count: max })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Đơn giá */}
                <p className="hidden text-right text-sm text-slate-600 xl:block">
                  {formatVND(item.unitPrice ?? item.price)}
                </p>

                {/* Số lượng */}
                <div className="xl:justify-self-center">
                  <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      aria-label={`${t.product.decrease}: ${item.name}`}
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="h-full w-10 text-lg text-slate-600 transition hover:text-brand-600 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      −
                    </button>
                    <span
                      data-testid="cart-qty"
                      className="w-10 text-center text-sm font-medium text-slate-900"
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`${t.product.increase}: ${item.name}`}
                      onClick={() => setQuantity(item.productId, item.quantity + 1)}
                      disabled={syncStatus !== "ready" || item.catalogStatus !== "available" || item.quantity >= max}
                      className="h-full w-10 text-lg text-slate-600 transition hover:text-brand-600 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      +
                    </button>
                  </div>
                  {item.quantity >= max && max > 0 && !overStock && (
                    <p className="mt-1 text-center text-[11px] text-amber-700">
                      {format(t.cart.stockLimit, { count: max })}
                    </p>
                  )}
                </div>

                {/* Thành tiền + Xóa (mobile: cùng một hàng, xl: hai ô riêng) */}
                <div className="flex items-center justify-end gap-3 xl:contents">
                  <p className="whitespace-nowrap text-right text-sm font-semibold text-slate-900">
                    {formatVND(cartAmount([item]))}
                  </p>

                  <button
                    type="button"
                    aria-label={`${t.cart.remove}: ${item.name}`}
                    onClick={() => removeItem(item.productId)}
                    className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <Link
            href="/products"
            className="mt-6 inline-block text-sm font-medium text-brand-600 transition hover:text-brand-700"
          >
            ← {t.cart.continueShopping}
          </Link>
        </section>

        {/* Tóm tắt đơn hàng */}
        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="text-base font-semibold text-slate-900">{MOCK_CATALOG ? t.cart.summary : (vi ? "Tạm tính giỏ hàng" : "Cart estimate")}</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t.cart.subtotal}</dt>
                <dd className="font-medium text-slate-900" data-testid="cart-subtotal">
                  {formatVND(subtotal)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t.cart.shippingFee}</dt>
                <dd className="font-medium text-slate-900">
                  {!MOCK_CATALOG ? (vi ? "Xác nhận khi đặt hàng" : "Confirmed at checkout") : SHIPPING_FEE === 0 ? t.cart.shippingFree : formatVND(SHIPPING_FEE)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-4">
                <dt className="text-base font-semibold text-slate-900">{t.cart.total}</dt>
                <dd className="text-xl font-semibold text-brand-700" data-testid="cart-total">
                  {formatVND(MOCK_CATALOG ? total : subtotal)}
                </dd>
              </div>
            </dl>

            {!MOCK_CATALOG && <p className="mt-4 text-sm text-slate-500">{vi ? "Đặt hàng sẽ được kết nối ở giai đoạn tiếp theo." : "Ordering will be connected in the next stage."}</p>}
            {(!MOCK_CATALOG || hasProblem) ? (
              <span
                aria-disabled="true"
                className="mt-6 block cursor-not-allowed rounded-xl bg-slate-100 px-6 py-3.5 text-center text-sm font-medium text-slate-400"
              >
                {t.cart.checkout}
              </span>
            ) : (
              <Link
                href="/checkout"
                className="mt-6 block rounded-xl bg-brand-600 px-6 py-3.5 text-center text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
              >
                {t.cart.checkout}
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
