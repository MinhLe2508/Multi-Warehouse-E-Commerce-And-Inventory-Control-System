'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from '@/hooks/useTranslation';
import { AuthError } from '@/shared/lib/authApi';
import {
  readOrder,
  payOrder,
  type Method,
  type Receipt,
} from '@/shared/lib/liveOrders';

const box =
  'mx-auto my-10 max-w-xl space-y-4 rounded-2xl border border-slate-200 p-6 shadow-soft';
const orderIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export default function LiveReceipt({
  id,
  method,
}: {
  id: string;
  method: Method;
}) {
  const vi = useTranslation().language === 'vi';
  const user = useAuthStore((state) => state.session?.user);
  const ready = useAuthStore((state) => state.ready);
  if (!ready) return <p className={box}>…</p>;
  if (!user) {
    return (
      <section className={box}>
        <Link href="/login">
          {vi ? 'Đăng nhập để xem đơn' : 'Sign in to view order'}
        </Link>
      </section>
    );
  }
  if (!orderIdPattern.test(id)) {
    return (
      <section className={box}>
        <p>{vi ? 'Thiếu mã đơn hợp lệ.' : 'Invalid order ID.'}</p>
        <Link href="/cart">{vi ? 'Về giỏ hàng' : 'Return to cart'}</Link>
      </section>
    );
  }
  return (
    <ReceiptView key={`${user.id}:${id}`} id={id} method={method} vi={vi} />
  );
}

function ReceiptView({
  id,
  method,
  vi,
}: {
  id: string;
  method: Method;
  vi: boolean;
}) {
  const [order, setOrder] = useState<Receipt | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverExpired, setServerExpired] = useState(false);
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false);
  const pending = order?.status === 'PENDING_PAYMENT';
  const expiry = order?.reservationExpiresAt
    ? Date.parse(order.reservationExpiresAt)
    : Number.NaN;
  const hasDeadline = Number.isFinite(expiry);
  const remaining = hasDeadline
    ? Math.max(0, Math.ceil((expiry - now) / 1000))
    : null;
  const expired = pending && (serverExpired || remaining === 0);
  const checking = pending && expired;

  useEffect(() => {
    let active = true;
    void readOrder(id).then(
      (data) => {
        if (!active) return;
        setOrder(data);
        setNow(Date.now());
        setError('');
      },
      (failure: unknown) => {
        if (!active) return;
        setError(
          failure instanceof Error
            ? failure.message
            : vi
              ? 'Không tải được đơn.'
              : 'Could not load the order.',
        );
      },
    );
    return () => {
      active = false;
    };
  }, [id, reload, vi]);

  useEffect(() => {
    if (!pending || !hasDeadline || expired) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expired, hasDeadline, pending]);

  useEffect(() => {
    if (!checking) return;
    // The scheduled backend cleanup owns the transition to CANCELLED.
    const interval = setInterval(() => setReload((value) => value + 1), 5000);
    return () => clearInterval(interval);
  }, [checking]);

  async function pay(approved: boolean) {
    if (
      lock.current ||
      !pending ||
      expired ||
      (hasDeadline && Date.now() >= expiry)
    ) {
      setNow(Date.now());
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const result = await payOrder(id, method, approved);
      setNotice(
        result.status === 'SUCCESS'
          ? vi
            ? 'Thanh toán thành công.'
            : 'Payment succeeded.'
          : vi
            ? 'Giao dịch bị từ chối. Bạn có thể thử lại trước khi hết giờ giữ hàng.'
            : 'Payment declined. You can retry while the reservation is active.',
      );
      if (result.orderStatus !== 'PENDING_PAYMENT') {
        setOrder((current) =>
          current ? { ...current, status: result.orderStatus } : null,
        );
      }
    } catch (failure: unknown) {
      if (
        failure instanceof AuthError &&
        failure.code === 'RESERVATION_EXPIRED'
      ) {
        setServerExpired(true);
      } else {
        setNotice(
          failure instanceof Error
            ? failure.message
            : vi
              ? 'Chưa xác nhận được giao dịch.'
              : 'Payment status is unknown.',
        );
      }
    } finally {
      setReload((value) => value + 1);
      lock.current = false;
      setBusy(false);
    }
  }

  const date = (time: string) =>
    new Date(time).toLocaleString(vi ? 'vi-VN' : 'en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  const money = (amount: string) =>
    new Intl.NumberFormat(vi ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 2,
    }).format(Number(amount));
  const timeLeft =
    remaining === null
      ? ''
      : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <section className={box}>
      <h1 className="text-2xl font-semibold">
        {vi ? 'Xác nhận đơn hàng' : 'Order confirmation'}
      </h1>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}{' '}
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="underline"
          >
            {vi ? 'Tải lại' : 'Reload'}
          </button>
        </p>
      )}
      {!order && !error && (
        <p role="status">{vi ? 'Đang tải đơn…' : 'Loading order…'}</p>
      )}
      {order && (
        <>
          <p className="font-medium">
            {order.orderCode} · {order.status}
          </p>
          <ul className="divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-2">
                <span>
                  {item.productName} × {item.quantity}
                </span>
                <span>{money(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <p className="font-semibold">
            {vi ? 'Tổng tiền' : 'Total'} {money(order.grandTotal)}
          </p>
          {order.cancelledReason === 'EXPIRED' && (
            <p className="text-red-700" role="status">
              {vi
                ? 'Đơn đã hủy vì hết thời gian giữ hàng.'
                : 'The order was cancelled because the reservation expired.'}
            </p>
          )}
          {expired && (
            <p className="text-red-700" role="status">
              {vi
                ? 'Đã hết giờ giữ hàng. Đang cập nhật trạng thái đơn.'
                : 'The reservation expired. Checking the order status.'}
            </p>
          )}
          {pending && !expired && (
            <fieldset disabled={busy} className="space-y-3">
              <legend>
                {vi ? 'Thanh toán mô phỏng' : 'Demo payment'} ·{' '}
                {method === 'MOCK_CARD'
                  ? vi
                    ? 'Thẻ'
                    : 'Card'
                  : vi
                    ? 'Ví điện tử'
                    : 'Wallet'}
              </legend>
              {order.reservationExpiresAt && hasDeadline && (
                <p>
                  {vi ? 'Giữ hàng đến' : 'Reserved until'}{' '}
                  {date(order.reservationExpiresAt)} · {timeLeft}
                </p>
              )}
              <button
                type="button"
                onClick={() => void pay(true)}
                className="rounded-xl bg-brand-600 px-4 py-2 text-white"
              >
                {vi ? 'Xác nhận thanh toán' : 'Approve payment'}
              </button>
              <button
                type="button"
                onClick={() => void pay(false)}
                className="ml-3 underline"
              >
                {vi ? 'Thử giao dịch bị từ chối' : 'Simulate decline'}
              </button>
            </fieldset>
          )}
          <details>
            <summary>{vi ? 'Lịch sử đơn' : 'Order history'}</summary>
            <ol>
              {order.statusHistory.map((item) => (
                <li key={item.id}>
                  {item.toStatus} · {date(item.createdAt)}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      <Link className="block text-brand-700 underline" href="/products">
        {vi ? 'Tiếp tục mua sắm' : 'Continue shopping'}
      </Link>
    </section>
  );
}
