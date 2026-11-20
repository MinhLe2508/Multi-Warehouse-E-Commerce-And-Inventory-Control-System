"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, Clock3, CreditCard, PackageCheck, XCircle } from "lucide-react";
import { useShopResource, SHOP_NOTIFICATIONS_CHANGED } from "@/hooks/useShopResource";
import { AuthError } from "@/shared/lib/authApi";
import { payOrder, UUIDForCheckout, type Method, type Receipt } from "@/shared/lib/liveOrders";
import { formatVND } from "@/shared/lib/utils";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";
import { orderDate, OrderStatus } from "./OrderStatus";
import { PaymentName } from "./PaymentOptions";
import OrderSummary from "./OrderSummary";
import { BuyerGate, ShopEmpty, ShopError, ShopHeading, ShopLoading, useShopCopy } from "./ShopUi";

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default function LiveReceipt({ id, method, fromCheckout = false }: {
  id: string; method?: Method; fromCheckout?: boolean;
}) {
  const tx = useShopCopy();
  if (!uuidPattern.test(id)) return <div className="mm-container mm-page"><ShopEmpty title={tx("Không tìm thấy đơn hàng", "Order not found")}
    action={<Link href="/orders" className="mm-button">{tx("Đơn hàng của tôi", "My orders")}</Link>} /></div>;
  const next = fromCheckout ? "/checkout/confirmation?" + new URLSearchParams({ id, ...(method && { method }) }) : "/orders/" + id;
  return <BuyerGate next={next}><ReceiptView key={id} id={id} method={method} fromCheckout={fromCheckout} /></BuyerGate>;
}

function ReceiptView({ id, method, fromCheckout }: { id: string; method?: Method; fromCheckout: boolean }) {
  const tx = useShopCopy();
  const identity = useAuthStore((state) => state.session?.user.id);
  const path = "/orders/" + encodeURIComponent(id);
  const resource = useShopResource<Receipt>(path, { identity });
  const reloadOrder = resource.refresh;
  const modes = useShopResource<{ demo: boolean }>("/payments/methods", { publicRead: true });
  const order = resource.data;
  const pending = order?.status === "PENDING_PAYMENT";
  const [now, setNow] = useState(() => Date.now());
  const [choice, setChoice] = useState<Method | undefined>(method);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [cancel, setCancel] = useState(false);
  const lock = useRef(false);
  const lastAttempt = useRef<{ key: string; id: string } | null>(null);
  const defaultMethod = order?.payment?.method;
  const activeMethod = choice ?? (defaultMethod === "MOCK_EWALLET" ? defaultMethod : "MOCK_CARD");
  const expiry = order?.reservationExpiresAt ? Date.parse(order.reservationExpiresAt) : null;
  const left = expiry === null ? null : Math.max(0, Math.ceil((expiry - now) / 1000));
  const expired = (pending && left === 0) || (order?.status === "CANCELLED" && order.cancelledReason === "EXPIRED");
  const readyToPay = Boolean(pending && !expired && !finishing && modes.data?.demo);
  const isCod = defaultMethod === "COD";
  const codUnpaid = isCod && order?.payment?.status === "PENDING";
  const paid = order?.payment?.status === "SUCCESS";
  const declined = order?.payment?.status === "FAILED";

  useEffect(() => {
    if (!pending) return;
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") reloadOrder(); }, 8_000);
    return () => { window.clearInterval(clock); window.clearInterval(poll); };
  }, [pending, reloadOrder]);

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
  function pay(approved: boolean) {
    if (!readyToPay || lock.current) return;
    const key = activeMethod + ":" + approved;
    if (lastAttempt.current?.key !== key) lastAttempt.current = { key, id: UUIDForCheckout() };
    const reference = lastAttempt.current.id;
    void perform(async () => {
      const result = await payOrder(id, activeMethod, approved, reference);
      if (result.status === "SUCCESS") setFinishing(true);
      lastAttempt.current = null;
    });
  }

  if (!order) return <div className="mm-container mm-page">
    <ShopHeading title={tx("Chi tiết đơn hàng", "Order details")} back={{ href: "/orders", label: tx("Đơn hàng của tôi", "My orders") }} />
    {resource.loading ? <ShopLoading /> : <ShopError retry={resource.refresh} />}
  </div>;

  const title = expired ? tx("Đơn đã hết thời gian giữ hàng", "Your hold has expired")
    : order.status === "CANCELLED" ? tx("Đơn hàng đã hủy", "Order cancelled")
      : codUnpaid ? tx("Đã ghi nhận đơn COD", "COD order placed")
        : paid ? (isCod ? tx("Đã giao hàng và thu tiền", "Delivered and paid") : tx("Đã ghi nhận thanh toán thử nghiệm", "Test payment recorded"))
          : pending ? tx("Đơn hàng đang chờ thanh toán", "Order awaiting payment") : tx("Đơn hàng đã được ghi nhận", "Order received");
  const StateIcon = expired || order.status === "CANCELLED" ? XCircle : paid ? CircleCheck : isCod ? PackageCheck : Clock3;
  return <div className="mm-container mm-page">
    <ShopHeading title={fromCheckout ? tx("Xác nhận đơn hàng", "Order confirmation") : tx("Chi tiết đơn hàng", "Order details")}
      back={{ href: "/orders", label: tx("Đơn hàng của tôi", "My orders") }} />
    <section className={"mm-panel mm-receipt-banner " + (pending ? "pending" : "")}>
      <span className="mm-receipt-icon"><StateIcon size={28} /></span>
      <div><h2>{title}</h2><p>{order.orderCode} · {orderDate(order.createdAt)}</p></div>
      <OrderStatus status={order.status} />
    </section>
    <div className="mm-commerce-grid mm-receipt-grid">
      <div className="mm-checkout-form">
        <section className="mm-panel mm-checkout-panel">
          <div className="mm-block-heading"><span><CreditCard size={21} /></span><div><h2>{tx("Thanh toán", "Payment")}</h2></div></div>
          {isCod && <p className="mm-receipt-payment"><PaymentName method="COD" />
            {codUnpaid && <strong>{tx("Cần trả khi nhận hàng", "Due on delivery")} · {formatVND(order.grandTotal)}</strong>}</p>}
          {paid && <p className="mm-feedback success" role="status">{tx("Đã thanh toán", "Paid")} · {formatVND(order.grandTotal)}</p>}
          {paid && order.payment && <div className="mm-payment-ref"><PaymentName method={order.payment.method} /><small>{tx("Mã giao dịch", "Reference")} {order.payment.transactionRef}</small></div>}
          {declined && pending && <p className="mm-feedback warning" role="status">{tx("Giao dịch thử nghiệm bị từ chối. Bạn có thể thử lại khi còn thời gian.", "The test payment was declined. Retry before your hold expires.")}</p>}
          {pending && !expired && left !== null && <p className="mm-payment-hold"><Clock3 size={17} />
            {tx("Giữ hàng còn", "Stock held for")} <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</strong></p>}
          {expired && <p className="mm-feedback warning">{tx("Hãy chọn lại sản phẩm để tạo đơn mới.", "Select your items again to place a new order.")}</p>}
          {pending && !expired && !modes.loading && !modes.data?.demo && <p className="mm-feedback warning">
            {tx("Máy chủ hiện hỗ trợ đặt đơn mới bằng COD.", "The server currently supports new orders with cash on delivery.")}</p>}
          {readyToPay && <div className="mm-test-payment">
            <label>{tx("Phương thức thử nghiệm", "Test method")}
              <select className="mm-input" value={activeMethod} disabled={busy} onChange={(event) => setChoice(event.target.value as Method)}>
                <option value="MOCK_CARD">{tx("Thẻ thử nghiệm", "Test card")}</option>
                <option value="MOCK_EWALLET">{tx("Ví thử nghiệm", "Test wallet")}</option>
              </select></label>
            <p>{tx("Chế độ mô phỏng. Giao dịch chỉ được ghi nhận trên hệ thống thử nghiệm.", "Demo mode. The transaction is recorded in the test system only.")}</p>
            <div className="mm-cta-group">
              <button type="button" className="mm-button primary" disabled={busy} onClick={() => pay(true)}>
                {busy ? tx("Đang xử lý…", "Processing…") : tx("Chạy thanh toán thử nghiệm", "Run test payment")}</button>
              <button type="button" className="mm-button" disabled={busy} onClick={() => pay(false)}>{tx("Thử giao dịch bị từ chối", "Test a declined payment")}</button>
            </div>
          </div>}
          {error && <ShopError message={error} />}
          {Boolean(resource.error) && <ShopError retry={resource.refresh} />}
          {pending && <div className="mm-receipt-tools">
            <button className="mm-link" type="button" onClick={resource.refresh}>{tx("Cập nhật trạng thái", "Refresh status")}</button>
            {order.canCancel && !expired && !cancel && !finishing && <button className="mm-link danger" type="button" disabled={busy} onClick={() => setCancel(true)}>{tx("Hủy đơn", "Cancel order")}</button>}
          </div>}
          {cancel && pending && !expired && <div className="mm-feedback warning">
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
        </section>
        <section className="mm-panel mm-checkout-panel">
          <h2>{tx("Lịch sử đơn hàng", "Order timeline")}</h2>
          <ol className="mm-timeline">{order.statusHistory.map((row) => <li key={row.id}>
            <span className="mm-timeline-dot" aria-hidden="true" /><div><OrderStatus status={row.toStatus} />
              <time dateTime={row.createdAt}>{orderDate(row.createdAt)}</time>
              {row.reason && !row.reason.startsWith("Chuyển trạng thái") && <small>{row.reason}</small>}
            </div>
          </li>)}</ol>
        </section>
      </div>
      <OrderSummary subtotal={order.subtotal} discount={order.discountTotal} shipping={order.shippingFee} total={order.grandTotal}
        lines={order.items.map((item) => ({ id: item.id, name: item.productName, image: item.imageUrl, quantity: item.quantity, total: item.lineTotal }))}>
        <Link className="mm-button full" href="/products">{tx("Tiếp tục mua sắm", "Continue shopping")}</Link>
      </OrderSummary>
    </div>
  </div>;
}
