'use client';
import Link from 'next/link';
import { useAdminCtx } from './AdminContext';
import { NAV, useIsActive } from './Sidebar';
import { ALERTS } from '../../shared/mock/adminMock';

export function Header() {
  const { warehouses, warehouseId, setWarehouseId } = useAdminCtx();
  const isActive = useIsActive();
  const open = ALERTS.filter(a => a.status === 'OPEN').length; // TODO(API): lấy từ WebSocket / GET /admin/analytics/low-stock
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Kho đang xem
          <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
            className="min-h-11 rounded-md border border-slate-300 bg-white px-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <option value="ALL">Tất cả kho</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-4">
          <Link href="/admin/alerts" aria-label={`Thông báo: ${open} cảnh báo đang mở`}
            className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
            {open > 0 && <span className="absolute right-1 top-1 rounded-full bg-rose-700 px-1.5 text-[11px] font-bold text-white">{open}</span>}
          </Link>
          <div className="text-right text-sm leading-tight">
            <div className="font-semibold">Admin</div>
            <div className="text-slate-500">admin@shop.vn</div>
          </div>
        </div>
      </div>
      <nav aria-label="Điều hướng (di động)" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 md:hidden">
        {NAV.map(n => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
            className={`whitespace-nowrap px-3 py-3 text-sm ${isActive(n.href) ? 'border-b-2 border-teal-700 font-semibold text-teal-800' : 'text-slate-600'}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
