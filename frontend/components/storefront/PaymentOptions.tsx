"use client";

import { Banknote, CreditCard, QrCode, Wallet } from "lucide-react";
import type { CheckoutMethod } from "@/shared/lib/liveOrders";
import { useShopCopy } from "./ShopUi";

export function PaymentName({ method }: { method: CheckoutMethod }) {
  const tx = useShopCopy();
  return method === "COD" ? tx("Thanh toán khi nhận hàng (COD)", "Cash on delivery (COD)")
    : method === "MOCK_CARD" ? tx("Thẻ thử nghiệm", "Test card") : tx("Ví thử nghiệm", "Test wallet");
}

export function PaymentOptions({ method, demo, onChange }: {
  method: CheckoutMethod; demo: boolean; onChange: (method: CheckoutMethod) => void;
}) {
  const tx = useShopCopy();
  const active = [
    { value: "COD", Icon: Banknote, detail: tx("Trả cho nhân viên giao hàng khi nhận đơn.", "Pay the delivery driver when your order arrives.") },
    { value: "MOCK_CARD", Icon: CreditCard, detail: tx("Kiểm thử theo tổng tiền do hệ thống xác nhận.", "Try a simulated charge using the confirmed total.") },
    { value: "MOCK_EWALLET", Icon: Wallet, detail: tx("Ví giả lập để kiểm thử đơn hàng.", "A simulated wallet for testing orders.") },
  ] as const;
  return <fieldset className="mm-payment-methods">
    <legend className="sr-only">{tx("Chọn phương thức thanh toán", "Choose a payment method")}</legend>
    {active.filter(({ value }) => demo || value === "COD").map(({ value, Icon, detail }) =>
      <label key={value} className={"mm-payment-option" + (method === value ? " selected" : "")}>
        <span className="mm-payment-icon"><Icon size={22} /></span>
        <span><strong><PaymentName method={value} /></strong><small>{detail}</small></span>
        {value !== "COD" && <span className="mm-pill demo">{tx("Mô phỏng", "Demo")}</span>}
        <input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => onChange(value)} />
      </label>)}
    <div className="mm-pay-unavailable">
      <p>{tx("Cổng thanh toán chờ kết nối", "Payment providers awaiting integration")}</p>
      <div>
        <span><QrCode size={19} /> {tx("QR ngân hàng / VietQR", "Bank QR / VietQR")}</span>
        <span><Wallet size={19} /> MoMo</span>
        <span><Wallet size={19} /> ZaloPay</span>
        {!demo && <span><CreditCard size={19} /> {tx("Thẻ", "Cards")}</span>}
      </div>
    </div>
  </fieldset>;
}
