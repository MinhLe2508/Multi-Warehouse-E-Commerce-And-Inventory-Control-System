"use client";

import { useOrderExpiry } from "@/hooks/useOrderExpiry";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useHydrated } from "@/hooks/useHydrated";
import { selectSubtotal, useCartStore } from "@/store/useCartStore";
import { useCheckoutStore } from "@/store/useCheckoutStore";
import { OrderConflictError, SHIPPING_FEE, placeOrder } from "@/shared/lib/mockOrders";
import { formatVND } from "@/shared/lib/utils";
import type { PaymentMethod, ShippingInfo } from "@/shared/types/order";

import { PAYMENT_METHODS, PAYMENT_LABEL_KEYS, trimShipping, validateShipping } from "@/shared/lib/checkout";

type Step = 1 | 2 | 3;
const CITY_SUGGESTIONS = [
  "Hà Nội",
  "Đà Nẵng",
  "TP. Hồ Chí Minh",
  "Hải Phòng",
  "Cần Thơ",
  "Huế",
  "Nha Trang",
  "Đà Lạt",
];

const inputClass = (hasError: boolean) =>
  `h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${
    hasError
      ? "border-red-300 focus:border-red-400 focus:ring-red-100"
      : "border-slate-200 focus:border-brand-400 focus:ring-brand-100"
  }`;

function Field({
  id,
  label,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// Form chỉ mount sau hydration: state ban đầu lấy đúng dữ liệu đã lưu.
export default function CheckoutView() {
  const hydrated = useHydrated();
  const { t } = useTranslation();
  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-busy="true">
        <h1 className="text-2xl font-semibold text-slate-900">{t.checkout.title}</h1>
        <div className="min-h-[50vh]" />
      </div>
    );
  }
  return <CheckoutForm />;
}

function CheckoutForm() {
  useOrderExpiry();
  const { t, format } = useTranslation();
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore(selectSubtotal);
  const clearCart = useCartStore((s) => s.clearCart);

  const lastOrder = useCheckoutStore((s) => s.lastOrder);
  const savedShipping = useCheckoutStore((s) => s.shipping);
  const savedPayment = useCheckoutStore((s) => s.payment);
  const setSavedShipping = useCheckoutStore((s) => s.setShipping);
  const setSavedPayment = useCheckoutStore((s) => s.setPayment);
  const setLastOrder = useCheckoutStore((s) => s.setLastOrder);

  const [step, setStep] = useState<Step>(1);
  const [furthestStep, setFurthestStep] = useState<Step>(1);
  const [form, setForm] = useState<ShippingInfo>(savedShipping);
  const [payment, setPayment] = useState<PaymentMethod>(savedPayment);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof ShippingInfo, boolean>>>({});

  const [simulateConflict, setSimulateConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [conflictProduct, setConflictProduct] = useState<string | null>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittingRef = useRef(false);
  const [orderError, setOrderError] = useState(false);

  const errors = validateShipping(form);
  const total = subtotal + SHIPPING_FEE;

  // Khi có lỗi 409, cuộn tới thông báo để khách thấy ngay
  useEffect(() => {
    if (conflictProduct) {
      conflictRef.current?.focus({ preventScroll: true });
      conflictRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [conflictProduct]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const errorText = (key: keyof ShippingInfo): string | undefined => {
    const e = errors[key];
    if (!e || !(submitted || touched[key])) return undefined;
    if (e === "phone") return t.checkout.invalidPhone;
    if (e === "email") return t.checkout.invalidEmail;
    return t.checkout.required;
  };

  const bind = (key: keyof ShippingInfo) => ({
    id: key,
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: e.target.value })),
    onBlur: () => setTouched((current) => ({ ...current, [key]: true })),
    "aria-invalid": errorText(key) ? true : undefined,
    "aria-describedby": errorText(key) ? `${key}-error` : undefined,
  });

  function goTo(next: Step) {
    if (submittingRef.current) return;
    // Đã đi qua vẫn bấm được, nhưng không cho bỏ qua dữ liệu đang lỗi.
    if (next > 1 && Object.keys(errors).length > 0) {
      setSubmitted(true);
      setStep(1);
      focusFirstError();
      return;
    }
    if (next > 1) setSavedShipping(trimShipping(form));
    setSavedPayment(payment);
    setFurthestStep((current) => Math.max(current, next) as Step);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusFirstError() {
    const first = Object.keys(errors)[0];
    if (first) document.getElementById(first)?.focus();
  }

  function handleShippingSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      focusFirstError();
      return;
    }
    const shipping = trimShipping(form);
    setForm(shipping);
    setSavedShipping(shipping);
    goTo(2);
  }

  function handlePaymentNext() {
    setSavedPayment(payment);
    goTo(3);
  }

  async function handlePlaceOrder() {
    if (submittingRef.current) return;
    if (Object.keys(errors).length > 0) {
      setSubmitted(true);
      goTo(1);
      return;
    }
    submittingRef.current = true;
    setOrderError(false);
    setConflictProduct(null);
    setSubmitting(true);
    try {
      const order = await placeOrder(
        {
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            image: i.image,
            quantity: i.quantity,
          })),
          shipping: trimShipping(form),
          payment,
        },
        { simulateConflict },
      );
      // Thành công: lưu đơn, xóa giỏ, sang trang xác nhận
      setPlaced(true);
      setLastOrder(order);
      clearCart();
      router.push("/checkout/confirmation");
    } catch (err) {
      if (err instanceof OrderConflictError) {
        setConflictProduct(err.productName);
      } else {
        setOrderError(true);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const title = (
    <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
      {t.checkout.title}
    </h1>
  );

  // Dữ liệu giỏ hàng lấy từ localStorage nên chỉ hiển thị sau khi hydrate
  if (placed) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {title}
        <div className="min-h-[50vh]" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {title}
        <div className="mt-10 rounded-3xl border border-dashed border-slate-200 py-24 text-center">
          <p className="text-lg font-semibold text-slate-900">{t.checkout.emptyCart}</p>
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

  if (lastOrder?.status === "PENDING_PAYMENT") {
    return <div className="mx-auto max-w-3xl px-4 py-16">
      {title}
      <p className="mt-6">{t.confirmation.pendingExisting}</p>
      <Link href="/checkout/confirmation" className="mt-4 inline-block rounded-xl bg-brand-600 px-6 py-3 text-white">{t.confirmation.viewOrder}</Link>
    </div>;
  }

  const steps: { n: Step; label: string }[] = [
    { n: 1, label: t.checkout.stepShipping },
    { n: 2, label: t.checkout.stepPayment },
    { n: 3, label: t.checkout.stepReview },
  ];

  const paymentLabel = (m: PaymentMethod) => t.checkout[PAYMENT_LABEL_KEYS[m]];
  const paymentDesc = (m: PaymentMethod) =>
    ({ COD: t.checkout.codDesc, MOCK_CARD: t.checkout.cardDesc, MOCK_EWALLET: t.checkout.walletDesc })[m];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {title}

      {/* Thanh các bước */}
      <ol className="mt-8 flex items-center gap-2 sm:gap-4" aria-label={t.checkout.title}>
        {steps.map((s, i) => {
          const done = s.n < furthestStep && s.n !== step;
          const current = s.n === step;
          return (
            <li key={s.n} className={`flex items-center gap-2 sm:gap-4 ${i < steps.length - 1 ? "flex-1" : ""}`}>
              <button
                type="button"
                disabled={submitting || s.n > furthestStep}
                onClick={() => goTo(s.n)}
                aria-current={current ? "step" : undefined}
                aria-label={`${s.n}. ${s.label}`}
                className="flex items-center gap-2.5 disabled:cursor-default"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition ${
                    current
                      ? "bg-brand-600 text-white shadow-soft"
                      : done
                        ? "bg-brand-100 text-brand-700"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {done ? "✓" : s.n}
                </span>
                <span
                  className={`text-sm font-medium ${current ? "inline text-slate-900" : "hidden sm:inline"} ${
                    done ? "text-brand-700" : current ? "" : "text-slate-400"
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className={`h-px flex-1 ${done ? "bg-brand-300" : "bg-slate-200"}`} />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Nội dung từng bước */}
        <div className="lg:col-span-2">
          {/* BƯỚC 1: Thông tin giao hàng */}
          {step === 1 && (
            <form
              onSubmit={handleShippingSubmit}
              noValidate
              className="rounded-2xl border border-slate-100 bg-white p-6 shadow-soft sm:p-8"
            >
              <h2 className="text-lg font-semibold text-slate-900">{t.checkout.shippingTitle}</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field id="fullName" label={t.checkout.fullName} error={errorText("fullName")}>
                  <input type="text" autoComplete="name" className={inputClass(!!errorText("fullName"))} {...bind("fullName")} />
                </Field>
                <Field id="phone" label={t.checkout.phone} error={errorText("phone")}>
                  <input type="tel" autoComplete="tel" inputMode="tel" className={inputClass(!!errorText("phone"))} {...bind("phone")} />
                </Field>
                <Field id="email" label={t.checkout.email} error={errorText("email")}>
                  <input type="email" autoComplete="email" className={inputClass(!!errorText("email"))} {...bind("email")} />
                </Field>
                <Field id="city" label={t.checkout.city} error={errorText("city")}>
                  <input
                    type="text"
                    list="city-suggestions"
                    autoComplete="address-level1"
                    className={inputClass(!!errorText("city"))}
                    {...bind("city")}
                  />
                  <datalist id="city-suggestions">
                    {CITY_SUGGESTIONS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <Field id="address" label={t.checkout.address} error={errorText("address")} className="sm:col-span-2">
                  <input type="text" autoComplete="street-address" className={inputClass(!!errorText("address"))} {...bind("address")} />
                </Field>
                <Field id="note" label={t.checkout.note} className="sm:col-span-2">
                  <textarea
                    rows={3}
                    id="note"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <Link
                  href="/cart"
                  className="flex h-11 items-center rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 transition hover:border-brand-300"
                >
                  {t.common.back}
                </Link>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-brand-600 px-4 sm:px-8 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
                >
                  {t.common.next}
                </button>
              </div>
            </form>
          )}

          {/* BƯỚC 2: Thanh toán mô phỏng */}
          {step === 2 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
              <h2 className="text-lg font-semibold text-slate-900">{t.checkout.paymentTitle}</h2>
              <p className="mt-1 text-sm text-slate-500">{t.checkout.paymentNote}</p>
              <div role="radiogroup" aria-label={t.checkout.paymentTitle} className="mt-6 space-y-3">
                {PAYMENT_METHODS.map((m) => {
                  const selected = payment === m;
                  return (
                    <label
                      key={m}
                      className={`flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition ${
                        selected
                          ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500"
                          : "border-slate-200 hover:border-brand-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value={m}
                        checked={selected}
                        onChange={() => setPayment(m)}
                        className="mt-1 h-4 w-4 accent-brand-600"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">{paymentLabel(m)}</span>
                        <span className="mt-0.5 block text-sm text-slate-500">{paymentDesc(m)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-8 flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goTo(1)}
                  className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 transition hover:border-brand-300"
                >
                  {t.common.back}
                </button>
                <button
                  type="button"
                  onClick={handlePaymentNext}
                  className="h-11 rounded-xl bg-brand-600 px-4 sm:px-8 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700"
                >
                  {t.common.next}
                </button>
              </div>
            </div>
          )}

          {/* BƯỚC 3: Xác nhận đơn */}
          {step === 3 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
              <h2 className="text-lg font-semibold text-slate-900">{t.checkout.reviewTitle}</h2>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 break-words rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t.checkout.shippingTo}
                    </p>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => goTo(1)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      {t.checkout.edit}
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{form.fullName}</p>
                  <p className="text-sm text-slate-600">{form.phone}</p>
                  <p className="text-sm text-slate-600">{form.email}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {form.address}, {form.city}
                  </p>
                  {form.note.trim() && (
                    <p className="mt-2 text-xs italic text-slate-500">“{form.note.trim()}”</p>
                  )}
                </div>
                <div className="min-w-0 break-words rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {t.checkout.paymentMethod}
                    </p>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => goTo(2)}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700"
                    >
                      {t.checkout.edit}
                    </button>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-900">{paymentLabel(payment)}</p>
                  <p className="text-sm text-slate-600">{paymentDesc(payment)}</p>
                </div>
              </div>

              <h3 className="mt-8 text-sm font-semibold text-slate-900">{t.checkout.orderItems}</h3>
              <ul className="mt-3 divide-y divide-slate-100">
                {items.map((i) => (
                  <li key={i.productId} className="flex items-center gap-4 py-3">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50 ring-1 ring-slate-100">
                      <Image src={i.image} alt={i.name} fill unoptimized sizes="56px" className="object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-slate-800">{i.name}</p>
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

              {/* Lỗi 409: sản phẩm vừa hết hàng */}
              {conflictProduct && (
                <div
                  ref={conflictRef}
                  role="alert"
                  tabIndex={-1}
                  className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-base font-semibold text-red-800">{t.checkout.conflictTitle}</p>
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      {t.checkout.conflictCode}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-red-700">
                    {format(t.checkout.conflictMessage, { product: conflictProduct })}
                  </p>
                  <Link
                    href="/cart"
                    className="mt-4 inline-block rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-red-700"
                  >
                    {t.checkout.backToCart}
                  </Link>
                </div>
              )}

              {orderError && (
                <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {t.checkout.orderError}
                </p>
              )}

              {/* Cờ test mô phỏng lỗi 409 */}
              <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
                <input
                  type="checkbox"
                  checked={simulateConflict}
                  disabled={submitting}
                  onChange={(e) => setSimulateConflict(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-600"
                />
                <span>
                  <span className="block text-sm font-medium text-amber-900">{t.checkout.testConflict}</span>
                  <span className="mt-0.5 block text-xs text-amber-800/80">{t.checkout.testConflictHint}</span>
                </span>
              </label>

              <div className="mt-8 flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goTo(2)}
                  disabled={submitting}
                  className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-medium text-slate-600 transition hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t.common.back}
                </button>
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  className="h-11 min-w-40 rounded-xl bg-brand-600 px-4 sm:px-8 text-sm font-medium text-white shadow-soft transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
                >
                  {submitting ? t.checkout.placingOrder : t.checkout.placeOrder}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tóm tắt đơn hàng */}
        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-slate-100 bg-white p-6 shadow-soft">
            <h2 className="text-base font-semibold text-slate-900">{t.cart.summary}</h2>
            <ul className="mt-4 space-y-3">
              {items.map((i) => (
                <li key={i.productId} className="flex items-center gap-3 text-sm">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-brand-50 ring-1 ring-slate-100">
                    <Image src={i.image} alt="" fill unoptimized sizes="40px" className="object-cover" />
                  </span>
                  <span className="line-clamp-1 flex-1 text-slate-600">
                    {i.name} <span className="text-slate-400">× {i.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">{t.cart.subtotal}</dt>
                <dd className="font-medium text-slate-900">{formatVND(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">{t.cart.shippingFee}</dt>
                <dd className="font-medium text-slate-900">
                  {SHIPPING_FEE === 0 ? t.cart.shippingFree : formatVND(SHIPPING_FEE)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-100 pt-4">
                <dt className="text-base font-semibold text-slate-900">{t.cart.total}</dt>
                <dd className="text-xl font-semibold text-brand-700" data-testid="checkout-total">
                  {formatVND(total)}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
