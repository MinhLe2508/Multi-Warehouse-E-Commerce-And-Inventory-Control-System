"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { PackageCheck, CreditCard } from "lucide-react";
import { useCartSync } from "@/hooks/useCartSync";
import { useProduct } from "@/hooks/useCatalog";
import { useHydrated } from "@/hooks/useHydrated";
import { useCheckoutQuote } from "@/hooks/useCheckoutQuote";
import type { BuyerPromotion, DeliveryOptions } from "@/shared/types/checkout";
import { SHOP_NOTIFICATIONS_CHANGED, useShopResource } from "@/hooks/useShopResource";
import { useAuthStore } from "@/store/useAuthStore";
import { useCartStore } from "@/store/useCartStore";
import { cartAmount, cartHasProblem, cartTotals, toCartItem } from "@/shared/lib/cartModel";
import { AuthError } from "@/shared/lib/authApi";
import { createOrder, UUIDForCheckout, type CheckoutMethod, type CustomerProfile, type Destination } from "@/shared/lib/liveOrders";
import OrderSummary from "./OrderSummary";
import CheckoutDelivery from "./CheckoutDelivery";
import CheckoutOffers from "./CheckoutOffers";
import { PaymentOptions } from "./PaymentOptions";
import { BuyerGate, ShopEmpty, ShopError, ShopHeading, ShopLoading, useShopCopy } from "./ShopUi";

export default function LiveCheckout({ selected, direct }: {
  selected?: string[]; direct?: { id: string; quantity: number };
}) {
  const userId = useAuthStore((state) => state.session?.user.id);
  const params = new URLSearchParams();
  if (selected) params.set("items", selected.join(","));
  if (direct) { params.set("product", direct.id); params.set("quantity", String(direct.quantity)); }
  return <BuyerGate next={"/checkout" + (params.size ? "?" + params.toString() : "")}>
    <CheckoutForm key={userId} selected={selected} direct={direct} />
  </BuyerGate>;
}

function CheckoutForm({ selected, direct }: { selected?: string[]; direct?: { id: string; quantity: number } }) {
  const tx = useShopCopy();
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuthStore((state) => state.session?.user);
  const profile = useShopResource<CustomerProfile>("/customer/profile", { identity: user?.id });
  const delivery = useShopResource<DeliveryOptions>("/customer/delivery", { identity: user?.id });
  const promotions = useShopResource<BuyerPromotion[]>("/promotions", { identity: user?.id });
  const modes = useShopResource<{ bankTransfer: boolean }>("/payments/methods", { publicRead: true });
  const cart = useCartStore((state) => state.items);
  const sync = useCartStore((state) => state.syncStatus);
  const refresh = useCartSync();
  const product = useProduct(direct?.id ?? "");
  const items = direct
    ? (product.data ? [toCartItem(product.data, direct.quantity)] : [])
    : cart.filter((item) => !selected || selected.includes(item.productId));
  const available = direct ? Boolean(product.data) : sync === "ready";
  const ok = available && items.length > 0 && items.length <= 50 && !cartHasProblem(items)
    && items.every((item) => item.quantity <= 100);
  const [draft, setDraft] = useState<Partial<Destination>>({});
  const [addressId, setAddressId] = useState<string | null>(null);
  const [promotionId, setPromotionId] = useState("");
  const [choice, setChoice] = useState<CheckoutMethod>("COD");
  const bankTransfer = Boolean(modes.data?.bankTransfer);
  const method = bankTransfer ? choice : "COD";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const submission = useRef<{ fingerprint: string; id: string } | null>(null);
  const favorite = addressId === null
    ? delivery.data?.addresses.find(({ isDefault }) => isDefault)
    : delivery.data?.addresses.find(({ id }) => id === addressId);
  const destination = favorite ?? delivery.data?.lastOrder;
  const shipping: Destination = {
    shippingRecipient: draft.shippingRecipient ?? destination?.shippingRecipient ?? profile.data?.fullName ?? user?.fullName ?? "",
    shippingPhone: draft.shippingPhone ?? destination?.shippingPhone ?? profile.data?.phone ?? "",
    shippingAddress: draft.shippingAddress ?? destination?.shippingAddress ?? profile.data?.address ?? "",
    shippingWarehouseId: draft.shippingWarehouseId ?? destination?.shippingWarehouseId ?? "",
  };
  const totals = cartTotals(items);
  const lines = items.map(({ productId, quantity }) => ({ productId, quantity }));
  const quote = useCheckoutQuote(lines, promotionId, ok);
  const appliedPromotionId = Number(quote.data?.promotionDiscountTotal) > 0 ? promotionId : "";
  const free = quote.data?.grandTotal === "0.00";
  const promo = promotions.data?.find(({ id }) => id === promotionId);
  const claimed = promotions.data?.filter(({ claimed }) => claimed) ?? [];
  const quotedLines = new Map(quote.data?.lines.map((line) => [line.productId, line]));

  function update(field: keyof Destination, value: string) {
    setDraft((values) => ({ ...values, [field]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ok || !quote.data || locked.current || delivery.loading) return;
    if (!shipping.shippingRecipient.trim() || !shipping.shippingAddress.trim() || !/^\+?\d{9,15}$/.test(shipping.shippingPhone.trim())) {
      setError(tx("Kiểm tra họ tên, địa chỉ và số điện thoại (9–15 chữ số).", "Check the recipient, address and phone number (9–15 digits)."));
      return;
    }
    const fingerprint = JSON.stringify([shipping, method, lines, appliedPromotionId, quote.data.grandTotal]);
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, id: UUIDForCheckout() };
    const key = submission.current.id;
    locked.current = true;
    setBusy(true); setError("");
    try {
      const order = await createOrder(lines, shipping, { id: key, method, promotionId: appliedPromotionId, expectedTotal: quote.data.grandTotal });
      if (!order?.id) throw new Error("Missing order ID");
      if (!direct) {
        const store = useCartStore.getState();
        for (const line of lines) {
          const current = store.items.find((item) => item.productId === line.productId);
          if (!current) continue;
          if (current.quantity <= line.quantity) store.removeItem(line.productId);
          else store.setQuantity(line.productId, current.quantity - line.quantity);
        }
      }
      window.dispatchEvent(new Event(SHOP_NOTIFICATIONS_CHANGED));
      router.replace("/checkout/confirmation?" + new URLSearchParams({ id: order.id }));
    } catch (cause) {
      if (cause instanceof AuthError && cause.code === "INSUFFICIENT_STOCK") {
        setError(tx("Tồn kho vừa thay đổi. Kiểm tra lại số lượng trước khi đặt.", "Stock has changed. Review quantities before placing the order."));
        if (direct) product.retry(); else refresh();
      } else if (cause instanceof AuthError && ["CHECKOUT_TOTAL_CHANGED", "PROMOTION_UNAVAILABLE", "PROMOTION_NOT_APPLICABLE"].includes(cause.code ?? "")) {
        setError(cause.message);
        quote.refresh();
        promotions.refresh();
      } else if (!(cause instanceof AuthError) || cause.status === 0 || cause.status >= 500) {
        setError(tx("Chưa nhận được xác nhận. Bạn có thể gửi lại yêu cầu này hoặc kiểm tra Đơn hàng của tôi.",
          "Confirmation did not arrive. Retry this request or check My orders."));
      } else {
        setError(cause.message);
      }
      locked.current = false; setBusy(false);
    }
  }

  return <div className="mm-container mm-page mm-checkout">
    <ShopHeading title={tx("Đặt hàng", "Checkout")} back={{ href: direct ? "/products/" + direct.id : "/cart", label: direct ? tx("Về sản phẩm", "Back to product") : tx("Về giỏ hàng", "Back to bag") }} />
    {!hydrated || (direct && product.loading) || (!direct && sync === "loading" && !items.length) ? <ShopLoading />
      : direct && product.error ? <ShopError retry={product.retry} />
        : !items.length && !busy ? <ShopEmpty title={tx("Chưa có sản phẩm để đặt", "No items to order")}
          action={<Link href={direct ? "/products" : "/cart"} className="mm-button primary">{tx("Chọn sản phẩm", "Choose products")}</Link>} /> :
          <div className="mm-commerce-grid">
            <form id="customer-checkout" onSubmit={(event) => void submit(event)} className="mm-checkout-form">
              <CheckoutDelivery shipping={shipping} data={delivery.data} selected={favorite?.id ?? ""} disabled={busy || delivery.loading}
                onChange={update} onSaved={delivery.refresh} onSelect={(id) => {
                  setAddressId(id); setDraft({}); setError("");
                }} />
              {Boolean(delivery.error) && <ShopError retry={delivery.refresh} />}
              <CheckoutOffers promotions={claimed} selected={promotionId} disabled={busy} onChange={(id) => {
                setPromotionId(id); setError("");
              }} />
              {Boolean(promotions.error) && <ShopError retry={promotions.refresh} />}
              <section className="mm-panel mm-checkout-panel">
                <div className="mm-block-heading"><span><CreditCard size={21} /></span><div><h2>{tx("Phương thức thanh toán", "Payment method")}</h2></div></div>
                {free ? <p className="mm-feedback success">{tx("Đơn này không cần thanh toán.", "This order requires no payment.")}</p>
                  : <PaymentOptions method={method} bankTransfer={bankTransfer} disabled={busy} onChange={setChoice} />}
                {!free && Boolean(modes.error) && <p className="mm-summary-note">{tx("Hiện chỉ tải được phương thức COD.", "Only cash on delivery is available right now.")}{" "}
                  <button type="button" className="mm-link" onClick={modes.refresh}>{tx("Cập nhật", "Refresh")}</button></p>}
              </section>
            </form>
            <OrderSummary subtotal={quote.data?.subtotal ?? totals.subtotal} discount={quote.data?.discountTotal ?? totals.discount}
              shipping={quote.data?.shippingFee} total={quote.data?.grandTotal ?? totals.total} estimated={!quote.data}
              promotion={promo && quote.data ? { code: promo.code, amount: quote.data.promotionDiscountTotal } : undefined}
              lines={items.map((item) => ({
                id: item.productId, name: item.name, quantity: item.quantity, image: item.image,
                total: quotedLines.get(item.productId)?.lineTotal ?? cartAmount([item]),
                promotionDiscount: quotedLines.get(item.productId)?.promotionDiscountAmount,
              }))}>
              {error && <ShopError message={error} />}
              {quote.loading && <p className="mm-summary-note" role="status">{tx("Đang tính tổng đơn hàng…", "Calculating the order total…")}</p>}
              {promotionId && quote.data && !appliedPromotionId && <p className="mm-feedback warning" role="status">
                {tx("Giỏ hàng hiện chưa có sản phẩm được giảm bằng mã này.", "The current bag has no items discounted by this offer.")}
              </p>}
              {Boolean(quote.error) && <ShopError
                message={quote.error instanceof AuthError ? quote.error.message : undefined}
                retry={promotionId ? undefined : quote.refresh} />}
              {promotionId && Boolean(quote.error) && <button type="button" className="mm-link" onClick={() => {
                setPromotionId(""); setError("");
              }}>{tx("Bỏ mã khuyến mãi", "Remove promotion")}</button>}
              {!direct && sync === "error" && <ShopError message={tx("Chưa kiểm tra được giá và tồn kho.", "Could not check prices and stock.")} retry={refresh} />}
              {!ok && !busy && sync !== "error" && <p className="mm-summary-note" role="status">{!available
                ? tx("Đang kiểm tra giá và tồn kho.", "Checking prices and stock.")
                : tx("Kiểm tra lại số lượng sản phẩm.", "Please review item quantities.")}</p>}
              <button className="mm-button primary full" type="submit" form="customer-checkout" disabled={busy || !ok || !quote.data || delivery.loading}>
                <PackageCheck size={18} /> {busy ? tx("Đang tạo đơn…", "Placing order…")
                  : free ? tx("Đặt đơn hàng", "Place order")
                    : method === "COD" ? tx("Đặt đơn COD", "Place COD order") : tx("Đặt đơn và lấy mã QR", "Place order and get QR")}
              </button>
              {!free && <p className="mm-summary-note">{method === "COD"
                ? tx("Bạn trả tổng tiền xác nhận khi nhận hàng.", "Pay the confirmed total when your order arrives.")
                : tx("Mã QR sẽ xuất hiện cùng số tiền chính xác sau khi đặt đơn.", "Your QR code and exact amount will appear after the order is placed.")}</p>}
            </OrderSummary>
          </div>}
  </div>;
}
