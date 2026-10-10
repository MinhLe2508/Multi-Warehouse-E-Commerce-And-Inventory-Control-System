'use client';
import { useEffect } from 'react';
import { NEXT_STATUS, STATUS_LABEL, formatTime, formatVnd } from '../../shared/lib/format';
import type { AdminOrder } from '../../shared/types/admin';
import { OrderBadge } from './StatusBadge';

interface Props { order: AdminOrder | null; onClose: () => void; onAdvance: (id: string) => void }

export function OrderDrawer({ order, onClose, onAdvance }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  if (!order) return null;
  const next = NEXT_STATUS[order.status];
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`Chi tiết đơn ${order.orderCode}`}
        onClick={e => e.stopPropagation()} className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{order.orderCode}</h2><div className="mt-1"><OrderBadge status={order.status} /></div></div>
          <button onClick={onClose} aria-label="Đóng" className="min-h-11 min-w-11 rounded-md text-xl hover:bg-slate-100">×</button>
        </div>

        <h3 className="mt-5 text-sm font-semibold">Giao đến</h3>
        <p className="text-sm text-slate-700">{order.shipping.recipient} · {order.shipping.phone}<br />{order.shipping.address}</p>

        <h3 className="mt-5 text-sm font-semibold">Sản phẩm</h3>
        <ul className="divide-y divide-slate-100 text-sm">
          {order.items.map(i => (
            <li key={i.sku} className="flex justify-between gap-3 py-2">
              <span>{i.productName} × {i.quantity}<br /><span className="text-slate-500">{i.sku} · xuất từ {i.warehouseCode}</span></span>
              <span>{formatVnd(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold"><span>Tổng cộng</span><span>{formatVnd(order.grandTotal)}</span></div>

        <h3 className="mt-5 text-sm font-semibold">Lịch sử trạng thái</h3>
        <ol className="mt-1 space-y-1 text-sm text-slate-700">
          {order.history.map((h, i) => (
            <li key={i}>{h.fromStatus ? STATUS_LABEL[h.fromStatus] : 'Tạo đơn'} → {STATUS_LABEL[h.toStatus]} <span className="text-slate-500">({h.actor}, {formatTime(h.createdAt)})</span></li>
          ))}
        </ol>

        <div className="mt-6">
          {next ? (
            <button onClick={() => onAdvance(order.id)} className="min-h-11 w-full rounded-md bg-teal-700 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
              Chuyển sang “{STATUS_LABEL[next]}”
            </button>
          ) : (
            <p className="text-sm text-slate-500">Đơn ở trạng thái “{STATUS_LABEL[order.status]}” không thể chuyển tiếp.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
