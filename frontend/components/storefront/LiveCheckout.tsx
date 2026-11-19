"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useCartSync } from "@/hooks/useCartSync";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuthStore } from "@/store/useAuthStore";
import { useCartStore } from "@/store/useCartStore";
import { cartHasProblem } from "@/shared/lib/cartModel";
import { AuthError } from "@/shared/lib/authApi";
import { createOrder, type Destination, type Method } from "@/shared/lib/liveOrders";

const panel = "mx-auto my-10 max-w-xl space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft";
const button = "rounded-xl bg-brand-600 px-5 py-2.5 text-white disabled:opacity-50";

export default function LiveCheckout() {
  const vi = useTranslation().language === "vi";
  const user = useAuthStore(s => s.session?.user);
  const ready = useAuthStore(s => s.ready);
  if (!ready) return <p role="status" className={panel}>…</p>;
  if (user?.role !== "CUSTOMER") return <section className={panel}><p>{vi ? "Vui lòng đăng nhập bằng tài khoản khách hàng để đặt đơn." : "Sign in with a customer account to order."}</p><Link className="text-brand-700 underline" href="/login">{vi ? "Đăng nhập" : "Sign in"}</Link></section>;
  return <Form key={user.id} vi={vi} name={user.fullName} />;
}

function Form({vi, name}: {vi: boolean; name: string}) {
  const [step, setStep] = useState(1);
  const [ship, setShip] = useState<Destination>({shippingRecipient:name,shippingPhone:"",shippingAddress:"",shippingRegion:""});
  const [method,setMethod] = useState<Method>("MOCK_CARD");
  const [error,setError] = useState("");
  const [uncertain,setUncertain] = useState(false);
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const router = useRouter();
  const refresh = useCartSync();
  const items = useCartStore(s => s.items);
  const sync = useCartStore(s => s.syncStatus);
  const canOrder = items.length > 0 && items.length <= 50 && items.every(i=>i.quantity <= 100) && sync === "ready" && !cartHasProblem(items);
  const labels = vi ? ["Giao hàng","Thanh toán","Kiểm tra đơn"] : ["Delivery","Payment","Review"];
  const fields = [
    ["shippingRecipient",vi?"Người nhận":"Recipient",150],
    ["shippingPhone",vi?"Số điện thoại":"Phone",16],
    ["shippingAddress",vi?"Địa chỉ":"Address",500],
    ["shippingRegion",vi?"Khu vực (tùy chọn)":"Region (optional)",100],
  ] as const;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || uncertain) return;
    if (step < 3) { setStep(step+1); return; }
    if (!canOrder) return;
    lock.current=true; setBusy(true); setError("");
    try {
      const order=await createOrder(items,ship);
      if (!order?.id) throw new Error("Missing order ID");
      const cart=useCartStore.getState();
      for (const line of items) {
        const current=cart.items.find(i=>i.productId===line.productId);
        if (!current) continue;
        if (current.quantity<=line.quantity) cart.removeItem(line.productId);
        else cart.setQuantity(line.productId,current.quantity-line.quantity);
      }
      router.replace("/checkout/confirmation?id="+encodeURIComponent(order.id)+"&method="+method);
    } catch (cause) {
      if (cause instanceof AuthError && cause.status===409) {
        setError(vi?"Hàng vừa hết. Giỏ vẫn được giữ; hãy quay lại giỏ để điều chỉnh số lượng.":"Stock changed. Your cart is saved; review the quantities.");
        refresh();
      } else if (!(cause instanceof AuthError) || !cause.status || cause.status>=500) {
        setUncertain(true);
        setError(vi?"Chưa xác định được đơn đã tạo hay chưa. Hãy kiểm tra với cửa hàng trước khi đặt lại.":"Order status is unknown. Check with the store before placing another order.");
      } else setError(cause.message);
      lock.current=false; setBusy(false);
    }
  }
  return <form onSubmit={submit} className={panel}>
    <h1 className="text-2xl font-semibold">{vi?"Đặt hàng":"Checkout"}</h1>
    <p className="font-medium text-brand-700">{step}/3 · {labels[step-1]}</p>
    {step===1 && fields.map(([key,label,max])=><label className="block text-sm" key={key}>{label}<input className="mt-1 w-full rounded-xl border p-3" required={key!=="shippingRegion"} maxLength={max} type={key==="shippingPhone"?"tel":"text"} pattern={key==="shippingPhone"?"[+]?[0-9]{9,15}":key!=="shippingRegion"?".*\\S.*":undefined} value={ship[key]} onChange={e=>setShip({...ship,[key]:e.target.value})}/></label>)}
    {step===2 && <fieldset><legend>{vi?"Cách thanh toán mô phỏng":"Demo payment method"}</legend>{(["MOCK_CARD","MOCK_EWALLET"] as const).map(m=><label className="mt-3 block" key={m}><input type="radio" checked={method===m} onChange={()=>setMethod(m)}/> {m==="MOCK_CARD"?(vi?"Thẻ":"Card"):(vi?"Ví điện tử":"E-wallet")}</label>)}</fieldset>}
    {step===3 && <><p>{ship.shippingRecipient} · {ship.shippingPhone}<br/>{[ship.shippingAddress, ship.shippingRegion].filter(Boolean).join(", ")}</p><p>{method==="MOCK_CARD"?(vi?"Thanh toán bằng thẻ mô phỏng":"Demo card"):(vi?"Ví điện tử mô phỏng":"Demo wallet")}</p><ul>{items.map(i=><li key={i.productId}>{i.name} × {i.quantity}</li>)}</ul><p>{vi?"Cửa hàng sẽ xác nhận tổng tiền trước khi bạn thanh toán.":"The order total will be confirmed before payment."}</p>
    {!canOrder && !busy && <p role="status">{vi?"Giỏ phải có 1–50 sản phẩm còn hàng, tối đa 100 đơn vị mỗi loại. Vui lòng kiểm tra giỏ hàng.":"Review cart availability and limits (50 products, 100 units each)."}</p>}</>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="flex flex-wrap items-center gap-4"><Link href="/cart" className="underline">{vi?"Giỏ hàng":"Cart"}</Link>{step>1 && <button type="button" disabled={busy} onClick={()=>setStep(step-1)}>{vi?"Quay lại":"Back"}</button>}
    <button className={button} disabled={busy||uncertain||(step===3&&!canOrder)}>{busy?"…":step<3?(vi?"Tiếp tục":"Continue"):(vi?"Đặt đơn":"Place order")}</button></div>
  </form>;
}
