"use client";

import { useRef, useState } from "react";
import { BookmarkPlus, MapPin } from "lucide-react";
import type { Destination } from "@/shared/lib/liveOrders";
import type { DeliveryOptions } from "@/shared/types/checkout";
import { AuthError } from "@/shared/lib/authApi";
import { authenticatedRequest } from "@/store/useAuthStore";
import DeliveryFields from "./DeliveryFields";
import { ShopError, useShopCopy } from "./ShopUi";

export default function CheckoutDelivery({ shipping, data, selected, disabled, onSelect, onChange, onSaved }: {
  shipping: Destination;
  data?: DeliveryOptions;
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onChange: (field: keyof Destination, value: string) => void;
  onSaved: () => void;
}) {
  const tx = useShopCopy();
  const [editor, setEditor] = useState(false);
  const [label, setLabel] = useState("");
  const [isDefault, setDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const addresses = data?.addresses ?? [];

  async function save() {
    if (savingRef.current) return;
    if (!label.trim() || !shipping.shippingRecipient.trim() || !shipping.shippingAddress.trim() ||
      !/^\+?\d{9,15}$/.test(shipping.shippingPhone.trim())) {
      setError(tx("Kiểm tra tên địa chỉ, người nhận, số điện thoại và địa chỉ.", "Check the label, recipient, phone and address."));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await authenticatedRequest("/customer/addresses", {
        ...shipping, shippingWarehouseId: shipping.shippingWarehouseId || null, label: label.trim(), isDefault,
      });
      setNotice(tx("Đã lưu địa chỉ yêu thích.", "Favorite address saved."));
      setEditor(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : tx("Chưa lưu được địa chỉ.", "Could not save the address."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <section className="mm-panel mm-checkout-panel">
    <div className="mm-block-heading"><span><MapPin size={21} /></span><div>
      <h2>{tx("Thông tin giao hàng", "Delivery details")}</h2>
      <p>{tx("Kiểm tra người nhận và địa chỉ cho đơn này.", "Review the recipient and address for this order.")}</p>
    </div></div>
    {!!addresses.length && <div className="mm-form mm-saved-address-select">
      <label>{tx("Địa chỉ yêu thích", "Favorite addresses")}
        <select className="mm-input" value={selected} disabled={disabled || saving} onChange={(event) => onSelect(event.target.value)}>
          <option value="">{tx("Dùng thông tin giao hàng khác", "Use other delivery details")}</option>
          {addresses.map((address) => <option key={address.id} value={address.id}>
            {address.label}{address.isDefault ? tx(" · Mặc định", " · Default") : ""}
          </option>)}
        </select>
      </label>
    </div>}
    <DeliveryFields shipping={shipping} warehouses={data?.warehouses ?? []} disabled={disabled || saving} onChange={onChange} />
    {!editor ? <button type="button" className="mm-link mm-save-address-button" disabled={disabled} onClick={() => {
      setNotice(""); setError(""); setLabel(""); setDefault(false); setEditor(true);
    }}><BookmarkPlus size={17} /> {tx("Lưu địa chỉ yêu thích", "Save as a favorite address")}</button>
      : <div className="mm-form mm-address-save">
        <label>{tx("Tên địa chỉ", "Address label")}
          <input className="mm-input" maxLength={80} value={label} placeholder={tx("Nhà, Văn phòng…", "Home, Office…")}
            disabled={saving || disabled} onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }} />
        </label>
        <label className="mm-address-default">
          <input type="checkbox" checked={isDefault} disabled={saving || disabled} onChange={(event) => setDefault(event.target.checked)} />
          {tx("Đặt làm địa chỉ mặc định", "Set as default address")}
        </label>
        <div className="mm-address-actions">
          <button className="mm-button" type="button" disabled={disabled || saving} onClick={() => void save()}>
            {saving ? tx("Đang lưu…", "Saving…") : tx("Lưu địa chỉ", "Save address")}
          </button>
          <button type="button" className="mm-link" disabled={saving} onClick={() => { setEditor(false); setError(""); }}>
            {tx("Hủy", "Cancel")}
          </button>
        </div>
      </div>}
    {notice && <p className="mm-feedback success" role="status">{notice}</p>}
    {error && <ShopError message={error} />}
  </section>;
}
