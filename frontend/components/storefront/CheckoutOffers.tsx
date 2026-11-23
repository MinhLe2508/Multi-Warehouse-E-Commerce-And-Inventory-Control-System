"use client";

import Link from "next/link";
import { Tag } from "lucide-react";
import type { BuyerPromotion } from "@/shared/types/checkout";
import { orderDate } from "./OrderStatus";
import { useShopCopy } from "./ShopUi";

export default function CheckoutOffers({ promotions, selected, disabled, onChange }: {
  promotions: BuyerPromotion[];
  selected: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const tx = useShopCopy();
  return <section className="mm-panel mm-checkout-panel">
    <div className="mm-block-heading"><span><Tag size={21} /></span><div>
      <h2>{tx("Khuyến mãi", "Promotions")}</h2>
      <p>{tx("Chọn một mã đã nhận để giảm giá sản phẩm phù hợp.", "Choose a claimed offer for eligible products.")}</p>
    </div></div>
    {promotions.length ? <fieldset className="mm-offer-options" disabled={disabled}>
      <legend className="sr-only">{tx("Mã khuyến mãi", "Promotion code")}</legend>
      <label className="mm-offer-option">
        <input type="radio" name="promotion" checked={!selected} onChange={() => onChange("")} />
        <strong>{tx("Không áp dụng mã", "No promotion")}</strong>
      </label>
      {promotions.map((entry) => <label className="mm-offer-option" key={entry.id}>
        <input type="radio" name="promotion" value={entry.id} checked={selected === entry.id} onChange={() => onChange(entry.id)} />
        <span><strong>{entry.name} · {entry.code}</strong>
          <small>{entry.allCategories ? tx("Tất cả mặt hàng", "All products") : entry.categories.map(({ name }) => name).join(", ")}
            {" · "}{tx("Hạn", "Until")} {orderDate(entry.expiresAt)}</small></span>
        <b className="mm-offer-percent">−{entry.percent}%</b>
      </label>)}
    </fieldset> : <p className="mm-summary-note">{tx("Bạn chưa có mã đã nhận.", "You have no claimed offers.")}{" "}
      <Link className="mm-link" href="/notifications">{tx("Mở thông báo", "Open notifications")}</Link></p>}
  </section>;
}
