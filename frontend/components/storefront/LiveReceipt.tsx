"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, Clock3, CreditCard, PackageCheck, XCircle } from "lucide-react";
import { useShopResource, SHOP_NOTIFICATIONS_CHANGED } from "@/hooks/useShopResource";
import { AuthError } from "@/shared/lib/authApi";
import type { Receipt } from "@/shared/lib/liveOrders";
import type { PaymentSupportRequest } from "@/shared/types/paymentSupport";
import { formatVND } from "@/shared/lib/utils";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";
import { orderDate, OrderStatus } from "./OrderStatus";
import { PaymentName } from "./PaymentOptions";
import BankTransferInstructions from "./BankTransferInstructions";
import OrderSummary from "./OrderSummary";
import PaymentSupport from "./PaymentSupport";
import { BuyerGate, ShopEmpty, ShopError, ShopHeading, ShopLoading, useShopCopy } from "./ShopUi";

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default function LiveReceipt({ id, fromCheckout = false }: {
  id: string; fromCheckout?: boolean;
}) {
  const tx = useShopCopy();
  if (!uuidPattern.test(id)) return <div className="mm-container mm-page"><ShopEmpty title={tx("Không tìm thấy đơn hàng", "Order not found")}
    action={<Link href="/orders" className="mm-button">{tx("Đơn hàng của tôi", "My orders")}</Link>} /></div>;
  const next = fromCheckout ? "/checkout/confirmation?" + new URLSearchParams({ id }) : "/orders/" + id;
  return <BuyerGate next={next}><ReceiptView key={id} id={id} fromCheckout={fromCheckout} /></BuyerGate>;
}

function ReceiptView({ id, fromCheckout }: { id: string; fromCheckout: boolean }) {
  const tx = useShopCopy();
  const identity = useAuthStore((state) => state.session?.user.id);
  const path = "/orders/" + encodeURIComponent(id);
  const resource = useShopResource<Receipt>(path, { identity, keepOnNetworkError: true });
  const reloadOrder = resource.refresh;
  const order = resource.data;
  const pending = order?.status === "PENDING_PAYMENT";
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [cancel, setCancel] = useState(false);
  const [submitted, setSubmitted] = useState<PaymentSupportRequest>();
  const lock = useRef(false);
  const defaultMethod = order?.payment?.method;
  const expiry = order?.reservationExpiresAt ? Date.parse(order.reservationExpiresAt) : null;
  const left = expiry === null ? null : Math.max(0, Math.ceil((expiry - now) / 1000));
  const expired = (pending && left === 0) || (order?.status === "CANCELLED" && order.cancelledReason === "EXPIRED");
  const isCod = defaultMethod === "COD";
  const codUnpaid = isCod && order?.payment?.status === "PENDING";
  const paid = order?.payment?.status === "SUCCESS";
  const isTransfer = defaultMethod === "BANK_TRANSFER";
  const free = !order?.payment && order?.grandTotal === "0.00" && !pending;
  const needsReview = isTransfer && !paid && order?.payment?.reviewRequired;
  const request = order?.payment?.supportRequest ?? submitted;
  const reviewing = !paid && request?.status === "OPEN";
  const supportTime = order?.payment?.supportAvailableAt;
  const supportWait = supportTime ? Math.max(0, Math.ceil((Date.parse(supportTime) - now) / 1000)) : 0;
  const tracking = pending || reviewing;
  const ticking = pending || supportWait > 0;

  useEffect(() => {
    if (!ticking) return;
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, [ticking]);

  useEffect(() => {
    if (!tracking) return;
    function check() {
      if (document.visibilityState === "visible") reloadOrder();
    }
    const poll = window.setInterval(check, pending ? 4_000 : 12_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [pending, reloadOrder, tracking]);

  const resolved = request?.resolvedAt;
  useEffect(() => {
    if (paid || resolved) window.dispatchEvent(new Event(SHOP_NOTIFICATIONS_CHANGED));
  }, [paid, resolved]);

  function refresh() {
    resource.refresh();
    window.dispatchEvent(new Event(SHOP_NOTIFICATIONS_CHANGED));
  }
  async function perform(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    try {
      await action();
      setCancel(false);
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.code === "RESERVATION_EXPIRED"
        ? tx("Thời gian giữ hàng đã hết.", "Your hold has expired.")
        : (cause.message || tx("Chưa thể cập nhật đơn.", "Could not update the order."))
        : tx("Kết nối gián đoạn. Hãy kiểm tra trạng thái rồi thử lại.", "Connection interrupted. Check the status and retry."));
    } finally {
      refresh(); setBusy(false); lock.current = false;
    }
  }
  if (!order) return <div className="mm-container mm-page">
    <ShopHeading title={tx("Chi tiết đơn hàng", "Order details")} back={{ href: "/orders", label: tx("Đơn hàng của tôi", "My orders") }} />
    {resource.loading ? <ShopLoading /> : <ShopError retry={resource.refresh} />}
  </div>;

  const title = expired ? tx("Đơn đã hết thời gian giữ hàng", "Your hold has expired")
    : order.status === "CANCELLED" ? tx("Đơn hàng đã hủy", "Order cancelled")
      : codUnpaid ? tx("Đã ghi nhận đơn COD", "COD order placed")
        : paid ? (isCod ? tx("Đã giao hàng và thu tiền", "Delivered and paid") : tx("Đã thanh toán", "Payment received"))
          : free ? tx("Đơn hàng miễn phí đã được ghi nhận", "Free order placed")
          : pending ? (reviewing ? tx("Đang đối soát thanh toán", "Payment under review") : tx("Đơn hàng đang chờ thanh toán", "Order awaiting payment"))
            : tx("Đơn hàng đã được ghi nhận", "Order received");
  const StateIcon = expired || order.status === "CANCELLED" ? XCircle : paid ? CircleCheck : isCod || free ? PackageCheck : Clock3;
  return <div className="mm-container mm-page">
    <ShopHeading title={fromCheckout ? tx("Xác nhận đơn hàng", "Order confirmation") : tx("Chi tiết đơn hàng", "Order details")}
      back={{ href: "/orders", label: tx("Đơn hàng của tôi", "My orders") }} />
    <section className={"mm-panel mm-receipt-banner " + (pending ? "pending" : "")}>
      <span className="mm-receipt-icon"><StateIcon size={28} /></span>
      <div><h2>{title}</h2><p>{order.orderCode} · {orderDate(order.createdAt)}</p></div>
      {reviewing && pending && !expired ? <span className="mm-pill warning"><span aria-hidden="true" />{tx("Đang đối soát", "Under review")}</span>
        : <OrderStatus status={order.status} />}
    </section>
    <div className="mm-commerce-grid mm-receipt-grid">
      <div className="mm-checkout-form">
        <section className="mm-panel mm-checkout-panel">
          <div className="mm-block-heading"><span><CreditCard size={21} /></span><div><h2>{tx("Thanh toán", "Payment")}</h2></div></div>
          {free && <p className="mm-feedback success">{tx("Đơn này không cần thanh toán.", "This order requires no payment.")}</p>}
          {isCod && <p className="mm-receipt-payment"><PaymentName method="COD" />
            {codUnpaid && <strong>{tx("Cần trả khi nhận hàng", "Due on delivery")} · {formatVND(order.grandTotal)}</strong>}</p>}
          {paid && <p className="mm-feedback success" role="status">{tx("Đã thanh toán", "Paid")} · {formatVND(order.grandTotal)}</p>}
          {paid && order.payment && <div className="mm-payment-ref"><PaymentName method={order.payment.method} /><small>{tx("Mã giao dịch", "Reference")} {order.payment.transactionRef}</small></div>}
          {pending && !expired && left !== null && <p className="mm-payment-hold"><Clock3 size={17} aria-hidden="true" />
            {tx("Giữ hàng còn", "Stock held for")} <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</strong></p>}
          {pending && !expired && !finishing && isTransfer && !needsReview && !reviewing && <BankTransferInstructions orderId={id} identity={identity} />}
          {needsReview && !reviewing && <p className="mm-feedback warning" role="status">
            {tx("Hệ thống đã ghi nhận khoản tiền cần kiểm tra thêm. Hãy giữ lại biên lai giao dịch.",
              "A received transfer needs review. Please keep your bank receipt.")}</p>}
          {isTransfer && !paid && (expired || order.status === "CANCELLED") && <p className="mm-feedback warning">
            {tx("Mã chuyển khoản của đơn đã hết hiệu lực.", "The payment code is no longer active.")}</p>}
          {isTransfer && !paid && (pending || order.status === "CANCELLED") &&
            <PaymentSupport request={request} wait={supportWait} busy={busy || finishing} onSend={(bankReference) => void perform(async () => {
              const ticket = await authenticatedRequest<PaymentSupportRequest>(`/payments/bank-transfer/${id}/support`, { bankReference });
              setSubmitted(ticket);
            })} />}
          {!isTransfer && expired && <p className="mm-feedback warning">{tx("Bạn có thể tạo đơn mới từ giỏ hàng.", "You can place a new order from your bag.")}</p>}
          {pending && !expired && !isTransfer && <p className="mm-feedback warning">
            {tx("Đơn này dùng phương thức thanh toán trước đây. Bạn có thể hủy đơn và đặt lại với phương thức đang mở.",
              "This order uses a legacy payment method. You can cancel and place a new order using an available method.")}</p>}
          {error && <ShopError message={error} />}
          {Boolean(resource.error) && <ShopError retry={resource.refresh} />}
          {tracking && <div className="mm-receipt-tools">
            <button className="mm-link" type="button" onClick={resource.refresh}>{tx("Cập nhật trạng thái", "Refresh status")}</button>
            {order.canCancel && !expired && !cancel && !finishing && !needsReview && !reviewing && <button className="mm-link danger" type="button" disabled={busy} onClick={() => setCancel(true)}>{tx("Hủy đơn", "Cancel order")}</button>}
          </div>}
          {cancel && pending && !expired && !reviewing && <div className="mm-feedback warning">
            <span>{tx("Hủy đơn sẽ trả lại sản phẩm đang giữ.", "Cancelling releases the held stock.")}</span>
            <button className="mm-button" type="button" disabled={busy} onClick={() => void perform(async () => {
              await authenticatedRequest(path + "/cancel", {}, "PATCH");
              setFinishing(true);
            })}>
              {tx("Xác nhận hủy", "Confirm cancellation")}</button>
            <button className="mm-link" type="button" onClick={() => setCancel(false)}>{tx("Giữ đơn", "Keep order")}</button>
          </div>}
        </section>
        <section className="mm-panel mm-checkout-panel">
          <h2>{tx("Thông tin nhận hàng", "Delivery information")}</h2>
          <p className="mm-recipient"><strong>{order.shippingRecipient}</strong><br />{order.shippingPhone}<br />
            {[order.shippingAddress, order.shippingRegion].filter(Boolean).join(", ")}</p>
          {order.shippingWarehouse && <p className="mm-muted">{tx("Kho giao hàng", "Fulfilment warehouse")} · {order.shippingWarehouse.name}</p>}
        </section>
        <section className="mm-panel mm-checkout-panel">
          <h2>{tx("Lịch sử đơn hàng", "Order timeline")}</h2>
          <ol className="mm-timeline">{order.statusHistory.map((row) => <li key={row.id}>
            <span className="mm-timeline-dot" aria-hidden="true" /><div><OrderStatus status={row.toStatus} />
              <time dateTime={row.createdAt}>{orderDate(row.createdAt)}</time>
              {row.reason && !row.reason.startsWith("Chuyển trạng thái") && <small>{row.reason === "Thanh toán mock thành công" ? tx("Đã ghi nhận giao dịch", "Transaction recorded") : row.reason}</small>}
            </div>
          </li>)}</ol>
        </section>
      </div>
      <OrderSummary subtotal={order.subtotal} discount={order.discountTotal} shipping={order.shippingFee} total={order.grandTotal}
        promotion={order.promotionCode && order.promotionDiscountTotal ? { code: order.promotionCode, amount: order.promotionDiscountTotal } : undefined}
        lines={order.items.map((item) => ({ id: item.id, name: item.productName, image: item.imageUrl, quantity: item.quantity, total: item.lineTotal }))}>
        <Link className="mm-button full" href="/products">{tx("Tiếp tục mua sắm", "Continue shopping")}</Link>
      </OrderSummary>
    </div>
  </div>;
}
