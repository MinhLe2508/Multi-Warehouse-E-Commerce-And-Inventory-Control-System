"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Bell, KeyRound, Package, UserRound } from "lucide-react";
import ProductImage from "@/components/products/ProductImage";
import { useShopResource, SHOP_NOTIFICATIONS_CHANGED } from "@/hooks/useShopResource";
import { AuthError } from "@/shared/lib/authApi";
import type { CustomerOrder, CustomerProfile, OrderState } from "@/shared/lib/liveOrders";
import { formatVND } from "@/shared/lib/utils";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";
import { OrderStatus, orderDate, orderLabels } from "./OrderStatus";
import { PaymentName } from "./PaymentOptions";
import { BuyerGate, ShopEmpty, ShopError, ShopHeading, ShopLoading, ShopPager, useShopCopy } from "./ShopUi";

type OrderPage = { items: CustomerOrder[]; total: number; limit: number };
type Notification = {
  id: string; title: string; body: string; createdAt: string; isRead: boolean;
  type: "ORDER_UPDATE" | "SYSTEM"; referenceType: string | null; referenceId: string | null;
};
const states = Object.keys(orderLabels) as OrderState[];

function AccountFrame({ title, path, children }: { title: string; path: string; children: ReactNode }) {
  const tx = useShopCopy();
  const current = usePathname();
  return <BuyerGate next={path}>
    <div className="mm-container mm-page mm-account-page">
      <ShopHeading title={title} />
      <nav className="mm-account-tabs" aria-label={tx("Tài khoản khách hàng", "Customer account")}>
        <Link href="/orders" aria-current={current === "/orders" ? "page" : undefined}><Package size={17} /> {tx("Đơn hàng của tôi", "My orders")}</Link>
        <Link href="/notifications" aria-current={current === "/notifications" ? "page" : undefined}><Bell size={17} /> {tx("Thông báo", "Notifications")}</Link>
        <Link href="/account" aria-current={current === "/account" ? "page" : undefined}><UserRound size={17} /> {tx("Hồ sơ cá nhân", "Profile")}</Link>
      </nav>
      {children}
    </div>
  </BuyerGate>;
}

function OrderList() {
  const tx = useShopCopy();
  const identity = useAuthStore((state) => state.session?.user.id);
  const [status, setStatus] = useState<OrderState | "">("");
  const [page, setPage] = useState(1);
  const resource = useShopResource<OrderPage>("/orders?" + new URLSearchParams({ page: String(page), ...(status && { status }) }), { identity });
  const data = resource.data;
  return <div className="mm-account-content">
    <div className="mm-orders-toolbar"><label>{tx("Trạng thái đơn", "Order status")}
      <select className="mm-input" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as OrderState | ""); }}>
        <option value="">{tx("Tất cả", "All orders")}</option>
        {states.map((value) => <option key={value} value={value}>{tx(orderLabels[value][0], orderLabels[value][1])}</option>)}
      </select></label>
      <button className="mm-link" type="button" onClick={resource.refresh}>{tx("Cập nhật", "Refresh")}</button>
    </div>
    {resource.loading && <ShopLoading />}
    {Boolean(resource.error) && <ShopError retry={resource.refresh} />}
    {data && (data.items.length ? <div className="mm-order-list">{data.items.map((order) =>
      <article className="mm-panel mm-order-card" key={order.id}>
        <div className="mm-order-card-head">
          <span><strong>{order.orderCode}</strong><small>{orderDate(order.createdAt)}</small></span>
          <OrderStatus status={order.status} />
        </div>
        <ul className="mm-order-card-lines">{order.items.slice(0, 3).map((line) => <li key={line.id}>
          <span className="mm-mini-image"><ProductImage src={line.imageUrl} alt="" fill sizes="48px" /></span>
          <strong>{line.productName}</strong><span>× {line.quantity}</span>
          <span className="mm-money">{formatVND(line.lineTotal)}</span>
        </li>)}</ul>
        {order.items.length > 3 && <p className="mm-muted">+ {order.items.length - 3} {tx("dòng sản phẩm", "more items")}</p>}
        <div className="mm-order-card-foot">
          <span>{order.payment ? <><PaymentName method={order.payment.method} /> · {order.payment.status === "SUCCESS"
            ? tx("Đã thanh toán", "Paid") : order.payment.status === "FAILED"
              ? tx("Đã từ chối", "Declined") : tx("Chờ thu tiền", "Awaiting collection")}</> : tx("Tổng đơn hàng", "Order total")}
            <strong className="mm-money">{formatVND(order.grandTotal)}</strong></span>
          <Link className="mm-button" href={"/orders/" + order.id}>{tx("Xem chi tiết", "View details")}</Link>
        </div>
      </article>)}</div> : <ShopEmpty icon={Package}
        title={tx("Chưa có đơn hàng phù hợp", "No matching orders")}
        action={<Link href="/products" className="mm-button primary">{tx("Tiếp tục mua sắm", "Continue shopping")}</Link>} />)}
    {data && <ShopPager page={page} pages={Math.ceil(data.total / data.limit)} onPage={setPage} />}
  </div>;
}

export function CustomerOrders() {
  const tx = useShopCopy();
  return <AccountFrame title={tx("Đơn hàng của tôi", "My orders")} path="/orders"><OrderList /></AccountFrame>;
}

function CustomerNoticeList() {
  const tx = useShopCopy();
  const identity = useAuthStore((state) => state.session?.user.id);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const limit = 12;
  const resource = useShopResource<{ items: Notification[]; total: number }>("/notifications?" + new URLSearchParams({
    limit: String(limit), offset: String((page - 1) * limit), ...(unreadOnly && { unreadOnly: "true" }),
  }), { identity, interval: 30_000 });

  async function mark(id?: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      await authenticatedRequest(id ? "/notifications/" + id + "/read" : "/notifications/read-all", {}, "PATCH");
      setPage(1);
      resource.refresh();
      window.dispatchEvent(new Event(SHOP_NOTIFICATIONS_CHANGED));
    } catch (cause) {
      setMessage(cause instanceof AuthError ? cause.message : tx("Chưa cập nhật được thông báo.", "Could not update notifications."));
    } finally { setBusy(false); }
  }

  return <div className="mm-account-content">
    <div className="mm-orders-toolbar">
      <label><input type="checkbox" checked={unreadOnly} onChange={(event) => { setPage(1); setUnreadOnly(event.target.checked); }} />{tx("Chỉ chưa đọc", "Unread only")}</label>
      <button className="mm-button" type="button" disabled={busy} onClick={() => void mark()}>{tx("Đánh dấu tất cả đã đọc", "Mark all as read")}</button>
    </div>
    {message && <ShopError message={message} />}
    {resource.loading && <ShopLoading />}
    {Boolean(resource.error) && <ShopError retry={resource.refresh} />}
    {resource.data?.items.length ? <ul className="mm-panel mm-notice-list">
      {resource.data.items.map((notice) => <li className={notice.isRead ? "" : "unread"} key={notice.id}>
        <span className="mm-notice-icon">{notice.type === "ORDER_UPDATE" ? <Package size={20} /> : <Bell size={20} />}</span>
        <div><strong>{notice.title}</strong><p>{notice.body}</p><small>{orderDate(notice.createdAt)}</small></div>
        <div className="mm-notice-actions">
          {notice.referenceType?.toLowerCase() === "order" && notice.referenceId && <Link className="mm-link" href={"/orders/" + encodeURIComponent(notice.referenceId)}>{tx("Xem đơn", "View order")}</Link>}
          {!notice.isRead && <button type="button" className="mm-link" disabled={busy} onClick={() => void mark(notice.id)}>{tx("Đã đọc", "Mark read")}</button>}
        </div>
      </li>)}
    </ul> : resource.data && <ShopEmpty icon={Bell} title={tx("Chưa có thông báo phù hợp", "No matching notifications")} />}
    {resource.data && <ShopPager page={page} pages={Math.ceil(resource.data.total / limit)} onPage={setPage} />}
  </div>;
}

export function CustomerNotifications() {
  const tx = useShopCopy();
  return <AccountFrame title={tx("Thông báo", "Notifications")} path="/notifications"><CustomerNoticeList /></AccountFrame>;
}

function CustomerProfileForm({ profile }: { profile: CustomerProfile }) {
  const tx = useShopCopy();
  const [data, setData] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ error: "", saved: false });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setNotice({ error: "", saved: false });
    try {
      const saved = await authenticatedRequest<CustomerProfile>("/customer/profile", {
        fullName: String(form.get("fullName")).trim(),
        phone: String(form.get("phone")).trim(), address: String(form.get("address")).trim(),
      }, "PATCH");
      setData(saved); setNotice({ error: "", saved: true });
    } catch (cause) {
      setNotice({ error: cause instanceof AuthError ? cause.message : tx("Chưa lưu được hồ sơ.", "Could not save your profile."), saved: false });
    } finally { setBusy(false); }
  }
  return <div className="mm-profile-grid">
    <section className="mm-panel mm-checkout-panel">
      <div className="mm-profile-title">
        <span className="mm-profile-avatar">{data.avatarUrl
          ? <ProductImage src={data.avatarUrl} alt="" fill sizes="64px" />
          : (data.fullName.trim().split(/\s+/).at(-1)?.slice(0, 2) ?? "").toUpperCase()}</span>
        <div><h2>{data.fullName}</h2><p>@{data.username}</p></div>
      </div>
      <dl className="mm-profile-info">
        <div><dt>Email</dt><dd>{data.email}</dd></div>
        <div><dt>{tx("Xác thực email", "Email verification")}</dt><dd>{data.emailVerifiedAt ? tx("Đã xác thực", "Verified") : tx("Đang chờ", "Pending")}</dd></div>
        <div><dt>{tx("Tài khoản", "Account")}</dt><dd>{data.isActive ? tx("Đang hoạt động", "Active") : tx("Đã khóa", "Locked")}</dd></div>
        <div><dt>{tx("Ngày tham gia", "Member since")}</dt><dd>{orderDate(data.createdAt)}</dd></div>
      </dl>
      <Link className="mm-button full" href="/change-password"><KeyRound size={17} />{tx("Đổi mật khẩu", "Change password")}</Link>
    </section>
    <section className="mm-panel mm-checkout-panel">
      <h2>{tx("Thông tin liên hệ", "Contact details")}</h2>
      <form className="mm-form mm-profile-form" onSubmit={(event) => void save(event)}>
        <label>{tx("Họ và tên", "Full name")}<input className="mm-input" name="fullName" required minLength={2} maxLength={150} autoComplete="name" defaultValue={data.fullName} disabled={busy} /></label>
        <label>{tx("Số điện thoại", "Phone number")}<input className="mm-input" name="phone" type="tel" maxLength={16} pattern={String.raw`[+]?[0-9]{9,15}`} autoComplete="tel" defaultValue={data.phone ?? ""} disabled={busy} /></label>
        <label>{tx("Địa chỉ nhận hàng mặc định", "Default delivery address")}<textarea className="mm-input" name="address" rows={3} maxLength={500} autoComplete="street-address" defaultValue={data.address ?? ""} disabled={busy} /></label>
        {notice.error && <ShopError message={notice.error} />}
        {notice.saved && <p className="mm-feedback success" role="status">{tx("Đã lưu hồ sơ.", "Profile saved.")}</p>}
        <button className="mm-button primary" type="submit" disabled={busy}>{busy ? tx("Đang lưu…", "Saving…") : tx("Lưu thông tin", "Save profile")}</button>
      </form>
    </section>
  </div>;
}

function Profile() {
  const identity = useAuthStore((state) => state.session?.user.id);
  const resource = useShopResource<CustomerProfile>("/customer/profile", { identity });
  return resource.data ? <CustomerProfileForm profile={resource.data} key={resource.data.id} />
    : resource.loading ? <ShopLoading /> : <ShopError retry={resource.refresh} />;
}

export function CustomerProfilePage() {
  const tx = useShopCopy();
  return <AccountFrame title={tx("Hồ sơ cá nhân", "My profile")} path="/account"><Profile /></AccountFrame>;
}
