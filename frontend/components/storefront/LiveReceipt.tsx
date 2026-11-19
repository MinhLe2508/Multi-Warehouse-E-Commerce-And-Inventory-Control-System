"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { useTranslation } from "@/hooks/useTranslation";
import { readOrder, payOrder, type Method, type Receipt } from "@/shared/lib/liveOrders";

const box="mx-auto my-10 max-w-xl space-y-4 rounded-2xl border border-slate-200 p-6 shadow-soft";
export default function LiveReceipt({id,method}:{id:string;method:Method}) {
  const vi=useTranslation().language==="vi";
  const user=useAuthStore(s=>s.session?.user);
  const ready=useAuthStore(s=>s.ready);
  if (!ready) return <p className={box}>…</p>;
  if (!user) return <section className={box}><Link href="/login">{vi?"Đăng nhập để xem đơn":"Sign in to view order"}</Link></section>;
  if (typeof id!=="string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return <section className={box}><p>{vi?"Thiếu mã đơn hợp lệ.":"Invalid order ID."}</p><Link href="/cart">{vi?"Về giỏ hàng":"Return to cart"}</Link></section>;
  return <ReceiptView key={user.id+id} id={id} method={method} vi={vi}/>;
}
function ReceiptView({id,method,vi}:{id:string;method:Method;vi:boolean}) {
  const [order,setOrder]=useState<Receipt|null>(null);
  const [reload,setReload]=useState(0);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  useEffect(()=>{
    let active=true;
    readOrder(id).then(data=>{if(active)setOrder(data);}).catch(e=>{if(active)setError(e.message);});
    return ()=>{ active=false; };
  },[id,reload]);
  function recheck(){setOrder(null);setError("");setReload(n=>n+1);}
  async function pay(approved:boolean){
    if(lock.current || order?.status!=="PENDING_PAYMENT")return;
    lock.current=true;setBusy(true);setNotice("");setError("");
    try {
      const result=await payOrder(id,method,approved);
      setNotice(result.status==="SUCCESS"?(vi?"Thanh toán thành công.":"Payment succeeded."):(vi?"Giao dịch bị từ chối. Bạn có thể thử lại trên đơn này.":"Payment declined. You can retry this order."));
    } catch(e) {
      setNotice(e instanceof Error?e.message:(vi?"Chưa xác nhận được giao dịch.":"Payment status is unknown."));
    } finally {recheck();lock.current=false;setBusy(false);}
  }
  const money=(amount:string)=>new Intl.NumberFormat(vi?"vi-VN":"en-US",{style:"currency",currency:"VND",maximumFractionDigits:2}).format(Number(amount));
  return <section className={box}><h1 className="text-2xl font-semibold">{vi?"Xác nhận đơn hàng":"Order confirmation"}</h1>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error} <button onClick={recheck} className="underline">{vi?"Tải lại":"Reload"}</button></p>}
    {!order&&!error&&<p role="status">{vi?"Đang tải đơn…":"Loading order…"}</p>}
    {order&&<><p className="font-medium">{order.orderCode} · {order.status}</p><ul className="divide-y">{order.items.map(i=><li key={i.id} className="flex justify-between gap-3 py-2"><span>{i.productName} × {i.quantity}</span><span>{money(i.lineTotal)}</span></li>)}</ul>
      <p className="font-semibold">{vi?"Tổng tiền":"Total"}: {money(order.grandTotal)}</p>
      {order.status==="PENDING_PAYMENT"&&<fieldset disabled={busy} className="space-y-3"><legend>{vi?"Thanh toán mô phỏng":"Demo payment"} · {method==="MOCK_CARD"?(vi?"Thẻ":"Card"):(vi?"Ví":"Wallet")}</legend>
        <button onClick={()=>pay(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-white">{vi?"Xác nhận thanh toán":"Approve payment"}</button>{" "}
        <button onClick={()=>pay(false)} className="underline">{vi?"Thử giao dịch bị từ chối":"Simulate decline"}</button></fieldset>}
      <details><summary>{vi?"Lịch sử đơn":"Order history"}</summary><ol>{order.statusHistory.map(h=><li key={h.id}>{h.toStatus} · {new Date(h.createdAt).toLocaleString(vi?"vi-VN":"en-US")}</li>)}</ol></details></>}
    <Link className="block text-brand-700 underline" href="/products">{vi?"Tiếp tục mua sắm":"Continue shopping"}</Link>
  </section>;
}
