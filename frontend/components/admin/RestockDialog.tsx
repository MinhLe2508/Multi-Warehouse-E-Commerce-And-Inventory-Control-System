'use client';
import { useEffect, useState } from 'react';
import type { StockAlert } from '../../shared/types/admin';

interface Props { alert: StockAlert | null; onClose: () => void; onSubmit: (alert: StockAlert, qty: number) => void }

// Yêu cầu nhập kho (reason RESTOCK trong inventory_change_reason). TODO(API): endpoint do P4 định nghĩa.
export function RestockDialog({ alert, onClose, onSubmit }: Props) {
  const [qty, setQty] = useState(50);
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  if (!alert) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="restock-title" className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 id="restock-title" className="text-lg font-semibold">Tạo yêu cầu nhập kho</h2>
        <p className="mt-1 text-sm text-slate-600">{alert.sku} · {alert.productName} tại {alert.warehouseCode}</p>
        <label className="mt-4 block text-sm">Số lượng cần nhập
          <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))}
            className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm">Hủy</button>
          <button onClick={() => { onSubmit(alert, qty); onClose(); }} className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white">Tạo yêu cầu</button>
        </div>
      </div>
    </div>
  );
}
