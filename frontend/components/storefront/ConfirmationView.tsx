"use client";

import { useEffect, useRef, useState } from "react";
import { PAYMENT_LABEL_KEYS } from "@/shared/lib/checkout";
import { getWarehouseName } from "@/shared/lib/mockData";
import { useOrderExpiry } from "@/hooks/useOrderExpiry";
import Image from "next/image";
import Link from "next/link";
import { useTranslation } from "@/hooks/useTranslation";
import { useHydrated } from "@/hooks/useHydrated";
import { useCheckoutStore } from "@/store/useCheckoutStore";
import { formatVND } from "@/shared/lib/utils";

export default function ConfirmationView() {
  useOrderExpiry();
  const { t, language } = useTranslation();
  const hydrated = useHydrated();
  const order = useCheckoutStore((s) => s.lastOrder);

  const settlePayment = useCheckoutStore((s) => s.settlePayment);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);

  function simulate(result: "SUCCESS" | "FAILED") {
    if (!order || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    timer.current = setTimeout(() => {
      settlePayment(order.id, result);
      busyRef.current = false;
      setBusy(false);
    }, 600);
  }

  // Đơn hàng lấy từ localStorage nên chỉ hiển thị sau khi hydrate
  if (!hydrated) {
    return <div className="mx-auto min-h-[60vh] max-w-3xl px-4 py-16" />;
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <p className="text-xl font-semibold text-slate-900">{t.confirmation.noOrderTitle}</p>
        <p className="mt-2 text-sm text-slate-500">{t.confirmation.noOrderDesc}</p>
        <Link
          href="/products"
          className="mt-8 inline-block rounded-xl bg-brand-600 px-6 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
        >
          {t.confirmation.continueShopping}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {order.status === "CONFIRMED" ? <path d="m5 12.5 4.5 4.5L19 7.5" /> :
              order.status === "CANCELLED" ? <path d="m7 7 10 10M17 7 7 17" /> : <circle cx="12" cy="12" r="6" />}
          </svg>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t.confirmation.title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{t.confirmation.subtitle}</p>
      </div>

      {/* Mã đơn + trạng thái */}
      <div className="mt-10 grid gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t.confirmation.orderCode}
          </p>
          <p className="mt-1 text-lg font-semibold text-brand-700" data-testid="order-code">
            {order.orderCode}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t.confirmation.status}
          </p>
          <span className="mt-1.5 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            {t.confirmation.orderStatus[order.status]}
          </span>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 p-6" aria-label={t.confirmation.payment}>
        <div role="status" aria-live="polite" className="space-y-2 text-sm" data-testid="payment-state">
          <p>{t.confirmation.paymentState[order.paymentStatus]}</p>
          <p>{t.confirmation.reservationState[order.reservationStatus]}</p>
          {order.status === "PENDING_PAYMENT" && <p>{t.confirmation.expires}: {new Date(order.reservationExpiresAt).toLocaleString(language === "vi" ? "vi-VN" : "en-GB")}</p>}
          {order.cancelledReason === "PAYMENT_FAILED" && <p className="text-red-700">{t.confirmation.failedNote}</p>}
          {order.cancelledReason === "EXPIRED" && <p className="text-red-700">{t.confirmation.expiredNote}</p>}
        </div>
        {order.status === "PENDING_PAYMENT" && (order.payment === "COD" ?
          <p className="mt-4 text-sm text-amber-800">{t.confirmation.codNote}</p> :
          <div className="mt-5">
            <h2 className="font-semibold">{t.confirmation.mockTitle}</h2>
            <p className="mt-2 text-sm text-slate-600">{t.confirmation.mockNote}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={busy} onClick={() => simulate("SUCCESS")} className="rounded-xl bg-brand-600 px-4 py-3 text-sm text-white disabled:opacity-50">{busy ? t.confirmation.processing : t.confirmation.mockSuccess}</button>
              <button type="button" disabled={busy} onClick={() => simulate("FAILED")} className="rounded-xl border border-red-300 px-4 py-3 text-sm text-red-700 disabled:opacity-50">{t.confirmation.mockFailure}</button>
            </div>
          </div>)}
      </section>

      {/* Chi tiết đơn hàng */}
      <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
        <h2 className="text-base font-semibold text-slate-900">{t.confirmation.orderDetails}</h2>

        <ul className="mt-4 divide-y divide-slate-100">
          {order.items.map((i) => (
            <li key={`${i.productId}-${i.warehouseId}`} className="flex items-center gap-4 py-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50 ring-1 ring-slate-100">
                <Image src={i.image} alt={i.name} fill unoptimized sizes="56px" className="object-cover" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{i.name}</p>
                <p className="text-xs text-slate-500">{getWarehouseName(i.warehouseId, language)}</p>
                <p className="text-xs text-slate-500">
                  {i.quantity} × {formatVND(i.price)}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-slate-900">
                {formatVND(i.price * i.quantity)}
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">{t.cart.subtotal}</dt>
            <dd className="font-medium text-slate-900">{formatVND(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">{t.cart.shippingFee}</dt>
            <dd className="font-medium text-slate-900">
              {order.shippingFee === 0 ? t.cart.shippingFree : formatVND(order.shippingFee)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between pt-2">
            <dt className="text-base font-semibold text-slate-900">{t.confirmation.total}</dt>
            <dd className="text-xl font-semibold text-brand-700" data-testid="order-total">
              {formatVND(order.total)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 break-words rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t.confirmation.deliverTo}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">{order.shipping.fullName}</p>
            <p className="text-sm text-slate-600">{order.shipping.phone}</p>
            <p className="text-sm text-slate-600">{order.shipping.email}</p>
            <p className="mt-1 text-sm text-slate-600">
              {order.shipping.address}, {order.shipping.city}
            </p>
          </div>
          <div className="min-w-0 break-words rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t.confirmation.payment}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">{t.checkout[PAYMENT_LABEL_KEYS[order.payment]]}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/products"
          className="inline-block rounded-xl bg-brand-600 px-8 py-3 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
        >
          {t.confirmation.continueShopping}
        </Link>
      </div>
    </div>
  );
}
