"use client";

import { Banknote, QrCode } from "lucide-react";
import type { CheckoutMethod, OrderPaymentMethod } from "@/shared/lib/liveOrders";
import { useShopCopy } from "./ShopUi";

export function PaymentName({ method }: { method: OrderPaymentMethod }) {
  const tx = useShopCopy();
  if (method === "COD") return tx("Thanh toán khi nhận hàng (COD)", "Cash on delivery (COD)");
  if (method === "BANK_TRANSFER") return tx("Chuyển khoản VietQR", "VietQR bank transfer");
  return tx("Phương thức trước đây", "Legacy payment method");
}

export function PaymentOptions({ method, bankTransfer, disabled, onChange }: {
  method: CheckoutMethod; bankTransfer: boolean; disabled: boolean; onChange: (method: CheckoutMethod) => void;
}) {
  const tx = useShopCopy();
  const options = [
    { value: "COD", Icon: Banknote, detail: tx("Trả cho nhân viên giao hàng khi nhận đơn.", "Pay the delivery driver when your order arrives.") },
    { value: "BANK_TRANSFER", Icon: QrCode, detail: tx("Quét mã theo đơn trong ứng dụng ngân hàng để chuyển đến Vietcombank.", "Scan the order QR in your banking app to pay Vietcombank.") },
  ] as const;
  return <fieldset className="mm-payment-methods" disabled={disabled}>
    <legend className="sr-only">{tx("Chọn phương thức thanh toán", "Choose a payment method")}</legend>
    {options.filter(({ value }) => bankTransfer || value === "COD").map(({ value, Icon, detail }) =>
      <label key={value} className={"mm-payment-option" + (method === value ? " selected" : "")}>
        <span className="mm-payment-icon"><Icon size={22} aria-hidden="true" /></span>
        <span><strong><PaymentName method={value} /></strong><small>{detail}</small></span>
        <input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => onChange(value)} />
      </label>)}
  </fieldset>;
}
