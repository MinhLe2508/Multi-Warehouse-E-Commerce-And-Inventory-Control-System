"use client";

import { useRef, useState, type FormEvent } from "react";
import { MapPin, Plus } from "lucide-react";
import { useShopResource } from "@/hooks/useShopResource";
import { AuthError } from "@/shared/lib/authApi";
import type { Destination } from "@/shared/lib/liveOrders";
import type { DeliveryOptions, DeliveryWarehouse, FavoriteAddress } from "@/shared/types/checkout";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";
import DeliveryFields from "./DeliveryFields";
import { ShopEmpty, ShopError, ShopLoading, useShopCopy } from "./ShopUi";

function AddressEditor({ address, lastOrder, warehouses, onCancel, onSaved }: {
  address?: FavoriteAddress;
  lastOrder: Destination | null;
  warehouses: DeliveryWarehouse[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tx = useShopCopy();
  const user = useAuthStore((state) => state.session?.user);
  const starting = address ?? lastOrder;
  const [shipping, setShipping] = useState<Destination>({
    shippingRecipient: starting?.shippingRecipient ?? user?.fullName ?? "",
    shippingPhone: starting?.shippingPhone ?? "",
    shippingAddress: starting?.shippingAddress ?? "",
    shippingWarehouseId: starting?.shippingWarehouseId ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await authenticatedRequest(address ? "/customer/addresses/" + address.id : "/customer/addresses", {
        ...shipping,
        shippingWarehouseId: shipping.shippingWarehouseId || null,
        label: String(form.get("label")).trim(),
        isDefault: form.has("isDefault"),
      }, address ? "PATCH" : "POST");
      onSaved();
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : tx("Chưa lưu được địa chỉ.", "Could not save the address."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <form className="mm-panel mm-checkout-panel mm-form" onSubmit={(event) => void save(event)}>
    <h2>{address ? tx("Sửa địa chỉ", "Edit address") : tx("Thêm địa chỉ yêu thích", "Add a favorite address")}</h2>
    <label>{tx("Tên địa chỉ", "Address label")}
      <input className="mm-input" name="label" required maxLength={80} disabled={busy} defaultValue={address?.label ?? ""} />
    </label>
    <DeliveryFields shipping={shipping} warehouses={warehouses} disabled={busy}
      onChange={(field, value) => setShipping((data) => ({ ...data, [field]: value }))} />
    <label className="mm-address-default">
      <input type="checkbox" name="isDefault" disabled={busy} defaultChecked={address?.isDefault} />
      {tx("Đặt làm địa chỉ mặc định", "Set as default address")}
    </label>
    {error && <ShopError message={error} />}
    <div className="mm-address-actions">
      <button type="submit" className="mm-button primary" disabled={busy}>{busy ? tx("Đang lưu…", "Saving…") : tx("Lưu địa chỉ", "Save address")}</button>
      <button type="button" className="mm-button" disabled={busy} onClick={onCancel}>{tx("Hủy", "Cancel")}</button>
    </div>
  </form>;
}

export default function FavoriteAddressBook() {
  const tx = useShopCopy();
  const identity = useAuthStore((state) => state.session?.user.id);
  const options = useShopResource<DeliveryOptions>("/customer/delivery", { identity });
  const [editor, setEditor] = useState<FavoriteAddress | "new" | null>(null);
  const [deleting, setDeleting] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function remove(address: FavoriteAddress) {
    if (deleting || !window.confirm(tx("Xóa địa chỉ yêu thích này?", "Remove this favorite address?"))) return;
    setDeleting(address.id);
    setNotice("");
    setError("");
    try {
      await authenticatedRequest("/customer/addresses/" + address.id, undefined, "DELETE");
      options.refresh();
      setNotice(tx("Đã xóa địa chỉ.", "Address removed."));
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : tx("Chưa xóa được địa chỉ.", "Could not remove the address."));
    } finally {
      setDeleting("");
    }
  }

  if (!options.data) return options.loading ? <ShopLoading /> : <ShopError retry={options.refresh} />;
  const { addresses, warehouses, lastOrder } = options.data;
  return <div className="mm-account-content">
    <div className="mm-orders-toolbar">
      <p className="mm-muted">{tx("Địa chỉ mặc định sẽ được điền sẵn khi bạn đặt hàng.", "Your default address is filled in at checkout.")}</p>
      <button type="button" className="mm-button primary" disabled={editor !== null || Boolean(deleting)} onClick={() => setEditor("new")}>
        <Plus size={16} aria-hidden="true" /> {tx("Thêm địa chỉ", "Add address")}
      </button>
    </div>
    {notice && <p className="mm-feedback success" role="status">{notice}</p>}
    {error && <ShopError message={error} />}
    {editor && <AddressEditor key={editor === "new" ? "new" : editor.id} address={editor === "new" ? undefined : editor}
      warehouses={warehouses} lastOrder={lastOrder} onCancel={() => setEditor(null)} onSaved={() => {
        setEditor(null); setError(""); setNotice(tx("Đã lưu địa chỉ yêu thích.", "Favorite address saved.")); options.refresh();
      }} />}
    {addresses.length ? <ul className="mm-address-book">
      {addresses.map((address) => <li className="mm-panel mm-address-entry" key={address.id}>
        <div className="mm-address-entry-title"><MapPin size={17} aria-hidden="true" /><strong>{address.label}</strong>
          {address.isDefault && <span className="mm-pill blue">{tx("Mặc định", "Default")}</span>}
        </div>
        <p><strong>{address.shippingRecipient}</strong> · {address.shippingPhone}</p>
        <p className="mm-muted">{address.shippingAddress}</p>
        <small>{warehouses.find(({ id }) => id === address.shippingWarehouseId)?.name ?? tx("MultiMart tự chọn kho", "MultiMart chooses the warehouse")}</small>
        <div className="mm-address-actions">
          <button type="button" className="mm-link" disabled={editor !== null || Boolean(deleting)} onClick={() => setEditor(address)}>{tx("Sửa", "Edit")}</button>
          <button type="button" className="mm-link danger" disabled={editor !== null || Boolean(deleting)} onClick={() => void remove(address)}>{tx("Xóa", "Remove")}</button>
        </div>
      </li>)}
    </ul> : !editor && <ShopEmpty icon={MapPin} title={tx("Chưa lưu địa chỉ yêu thích", "No favorite addresses saved")} />}
  </div>;
}
