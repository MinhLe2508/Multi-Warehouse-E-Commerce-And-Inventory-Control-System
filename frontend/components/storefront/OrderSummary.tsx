"use client";

import type { ReactNode } from "react";
import ProductImage from "@/components/products/ProductImage";
import { formatVND } from "@/shared/lib/utils";
import { useShopCopy } from "./ShopUi";

type SummaryLine = { id: string; name: string; image?: string | null; quantity: number; total: string };

export default function OrderSummary({ lines, subtotal, discount, shipping, total, estimated, children }: {
  lines?: SummaryLine[]; subtotal: string; discount: string; shipping?: string;
  total: string; estimated?: boolean; children?: ReactNode;
}) {
  const tx = useShopCopy();
  return <aside className="mm-panel mm-summary">
    <h2>{tx("Tóm tắt đơn hàng", "Order summary")}</h2>
    {lines && lines.length > 0 && <ul className="mm-summary-lines">
      {lines.map((line) => <li key={line.id}>
        <span className="mm-mini-image"><ProductImage src={line.image} alt="" fill sizes="54px" /></span>
        <span><strong>{line.name}</strong><small>{tx("Số lượng", "Qty")} {line.quantity}</small></span>
        <span className="mm-money">{formatVND(line.total)}</span>
      </li>)}
    </ul>}
    <dl className="mm-totals">
      <div><dt>{tx("Tiền hàng", "Subtotal")}</dt><dd>{formatVND(subtotal)}</dd></div>
      {Number(discount) > 0 && <div><dt>{tx("Giảm giá", "Discount")}</dt><dd className="mm-savings">−{formatVND(discount)}</dd></div>}
      <div><dt>{tx("Phí giao hàng", "Delivery")}</dt><dd>{shipping === undefined
        ? tx("Xác nhận khi đặt đơn", "Confirmed on order") : formatVND(shipping)}</dd></div>
      <div className="mm-grand-total"><dt>{estimated ? tx("Tổng tạm tính", "Estimated total") : tx("Tổng đơn hàng", "Order total")}</dt>
        <dd>{formatVND(total)}</dd></div>
    </dl>
    {children}
  </aside>;
}
