"use client";

import { Headset } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PaymentSupportRequest } from "@/shared/types/paymentSupport";
import { orderDate } from "./OrderStatus";
import { useShopCopy } from "./ShopUi";

export default function PaymentSupport({ request, wait, busy, onSend }: {
  request: PaymentSupportRequest | null | undefined;
  wait: number;
  busy: boolean;
  onSend: (bankReference: string) => void;
}) {
  const tx = useShopCopy();
  const [editing, setEditing] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = new FormData(event.currentTarget).get("bankReference");
    onSend(typeof reference === "string" ? reference.trim() : "");
  }

  return <section className="mm-payment-support" aria-label={tx("Hỗ trợ thanh toán", "Payment support")}>
    <h3><Headset size={18} aria-hidden="true" />
      {request ? tx("Yêu cầu đối soát VietQR", "VietQR review request")
        : tx("Đã thanh toán nhưng chưa cập nhật?", "Already transferred the money?")}
    </h3>
    {request?.status === "OPEN" ? <div role="status">
      <p><strong>{tx("Đã gửi yêu cầu", "Request sent")}</strong> · {orderDate(request.createdAt)}</p>
      <p>{tx("CSKH sẽ kiểm tra sao kê. Vui lòng giữ biên lai và chờ kết quả tại đây trước khi chuyển thêm tiền.",
        "Support will check the bank statement. Please keep your receipt and wait for an update here before sending more money.")}</p>
    </div> : request?.status === "CLOSED" ? <div role="status">
      <p><strong>{tx("CSKH đã phản hồi", "Support has responded")}</strong></p>
      {request.resolutionNote && <p>{request.resolutionNote}</p>}
    </div> : !request ? <>
      <p>{tx("Nếu đã chuyển khoản và trạng thái chưa đổi sau khoảng 3 phút, hãy gửi yêu cầu để CSKH kiểm tra.",
        "If the status stays the same for about 3 minutes after the transfer, ask support to check it.")}</p>
      {wait > 0 ? <small>{tx("Có thể gửi yêu cầu sau", "Request available in")} {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}</small>
        : editing ? <form onSubmit={submit}>
          <label>
            {tx("Mã giao dịch trên biên lai (không bắt buộc)", "Bank reference on your receipt (optional)")}
            <input name="bankReference" className="mm-input" autoComplete="off" maxLength={100} disabled={busy} />
          </label>
          <div className="mm-receipt-tools">
            <button type="submit" className="mm-button primary" disabled={busy}>{busy
              ? tx("Đang gửi…", "Sending…") : tx("Gửi yêu cầu", "Send request")}</button>
            <button type="button" className="mm-link" disabled={busy} onClick={() => setEditing(false)}>{tx("Quay lại", "Back")}</button>
          </div>
        </form> : <button className="mm-button" type="button" disabled={busy} onClick={() => setEditing(true)}>
          {tx("Yêu cầu CSKH xử lý", "Ask support to check")}
        </button>}
    </> : null}
  </section>;
}
