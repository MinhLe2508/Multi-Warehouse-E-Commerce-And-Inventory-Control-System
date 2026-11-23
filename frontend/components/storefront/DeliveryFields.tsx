"use client";

import type { Destination } from "@/shared/lib/liveOrders";
import type { DeliveryWarehouse } from "@/shared/types/checkout";
import { useShopCopy } from "./ShopUi";

export default function DeliveryFields({ shipping, warehouses, disabled, onChange }: {
  shipping: Destination;
  warehouses: DeliveryWarehouse[];
  disabled?: boolean;
  onChange: (field: keyof Destination, value: string) => void;
}) {
  const tx = useShopCopy();
  return <fieldset className="mm-form mm-two-fields" disabled={disabled}>
    <label>{tx("Họ và tên người nhận", "Recipient name")}
      <input className="mm-input" required maxLength={150} autoComplete="shipping name"
        value={shipping.shippingRecipient} onChange={(event) => onChange("shippingRecipient", event.target.value)} />
    </label>
    <label>{tx("Số điện thoại", "Phone number")}
      <input className="mm-input" type="tel" inputMode="tel" required maxLength={16} pattern={String.raw`[+]?[0-9]{9,15}`}
        autoComplete="shipping tel" value={shipping.shippingPhone} onChange={(event) => onChange("shippingPhone", event.target.value)} />
    </label>
    <label className="mm-span-two">{tx("Địa chỉ nhận hàng", "Delivery address")}
      <textarea className="mm-input" required rows={2} maxLength={500} autoComplete="shipping street-address"
        placeholder={tx("Số nhà, đường, phường/xã, tỉnh/thành phố", "Street, ward and city or province")}
        value={shipping.shippingAddress} onChange={(event) => onChange("shippingAddress", event.target.value)} />
    </label>
    <label className="mm-span-two">{tx("Kho giao hàng (tùy chọn)", "Fulfilment warehouse (optional)")}
      <select className="mm-input" value={shipping.shippingWarehouseId ?? ""} onChange={(event) => onChange("shippingWarehouseId", event.target.value)}>
        <option value="">{tx("MultiMart tự chọn kho", "Let MultiMart choose")}</option>
        {warehouses.map(({ id, name, code }) => <option key={id} value={id}>{name} · {code}</option>)}
      </select>
    </label>
  </fieldset>;
}
