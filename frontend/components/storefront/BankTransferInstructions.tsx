"use client";

import Image from "next/image";
import { Check, Copy, QrCode } from "lucide-react";
import { useState } from "react";
import { useShopResource } from "@/hooks/useShopResource";
import type { VietQrInstructions } from "@/shared/lib/liveOrders";
import { formatVND } from "@/shared/lib/utils";
import { ShopError, ShopLoading, useShopCopy } from "./ShopUi";

export default function BankTransferInstructions({ orderId, identity }: { orderId: string; identity?: string }) {
  const tx = useShopCopy();
  const qr = useShopResource<VietQrInstructions>("/payments/bank-transfer/" + encodeURIComponent(orderId), { identity });
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);

  async function copy(value: string) {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setCopied("");
      setCopyError(true);
    }
  }

  if (qr.loading) return <ShopLoading />;
  if (!qr.data) return <ShopError message={tx("Chưa tải được mã VietQR.", "Could not load your VietQR code.")} retry={qr.refresh} />;
  const { bankName, accountName, accountNumber, amount, transferCode, qrImage } = qr.data;

  function copyButton(value: string, label: string) {
    const done = copied === value;
    const Icon = done ? Check : Copy;
    return <button type="button" className="mm-vietqr-copy" aria-label={label} title={label} onClick={() => void copy(value)}>
      <Icon size={16} aria-hidden="true" />
    </button>;
  }

  return <div className="mm-vietqr">
    <div className="mm-vietqr-details">
      <h3><QrCode size={19} aria-hidden="true" /> {tx("Chuyển khoản VietQR", "VietQR bank transfer")}</h3>
      <dl>
        <div><dt>{tx("Ngân hàng", "Bank")}</dt><dd>{bankName}</dd></div>
        <div><dt>{tx("Chủ tài khoản", "Account holder")}</dt><dd>{accountName}</dd></div>
        <div><dt>{tx("Số tài khoản", "Account number")}</dt>
          <dd>{accountNumber}{copyButton(accountNumber, tx("Sao chép số tài khoản", "Copy account number"))}</dd></div>
        <div><dt>{tx("Số tiền cần chuyển", "Amount to transfer")}</dt>
          <dd className="mm-vietqr-amount">{formatVND(amount)}{copyButton(amount, tx("Sao chép số tiền", "Copy amount"))}</dd></div>
        <div><dt>{tx("Nội dung chuyển khoản", "Transfer memo")}</dt>
          <dd className="mm-vietqr-memo">{transferCode}{copyButton(transferCode, tx("Sao chép nội dung", "Copy transfer memo"))}</dd></div>
      </dl>
      {copied && <span role="status" className="mm-vietqr-copy-note">{tx("Đã sao chép.", "Copied.")}</span>}
      {copyError && <span role="status" className="mm-vietqr-copy-note">{tx("Hãy chọn và sao chép thông tin cần dùng.", "Select the text to copy it manually.")}</span>}
    </div>
    <figure>
      <Image src={qrImage} width={208} height={208} unoptimized alt={tx("Mã QR chuyển khoản cho đơn này", "Bank transfer QR for this order")} />
      <figcaption>{tx("Quét bằng ứng dụng ngân hàng", "Scan in your banking app")}</figcaption>
    </figure>
    <p>{tx("Giữ đúng số tiền và nội dung khi chuyển. Trang này tự cập nhật khi hệ thống xác nhận đã nhận tiền.",
      "Keep the exact amount and memo. This page updates when your transfer is verified.")}</p>
  </div>;
}
