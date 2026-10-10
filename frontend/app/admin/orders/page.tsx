'use client';
import { useState } from 'react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import { OrderDrawer } from '../../../components/admin/OrderDrawer';
import { OrderBadge } from '../../../components/admin/StatusBadge';
import { useAdminOrders } from '../../../hooks/useAdminOrders';
import { STATUS_LABEL, formatTime, formatVnd } from '../../../shared/lib/format';
import type { OrderStatus } from '../../../shared/types/admin';

export default function AdminOrdersPage() {
  const { orders, loading, error, advanceStatus } = useAdminOrders();
  const { warehouses, warehouseId } = useAdminCtx();
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const whCode = warehouses.find(w => w.id === warehouseId)?.code;
  const list = orders.filter(o =>
    (status === 'ALL' || o.status === status) &&
    (!whCode || o.warehouseCodes.includes(whCode)) &&
    (!q || (o.orderCode + o.customerName).toLowerCase().includes(q.toLowerCase())));
  const selected = orders.find(o => o.id === selectedId) ?? null; // luôn lấy bản mới nhất sau khi cập nhật

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-4 text-xl font-bold">Đơn hàng</h1>
      <div className="mb-3 flex flex-wrap gap-3">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo mã đơn hoặc tên khách" aria-label="Tìm đơn hàng"
          className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" />
        <select value={status} onChange={e => setStatus(e.target.value as OrderStatus | 'ALL')} aria-label="Lọc theo trạng thái"
          className="min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <option value="ALL">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABEL) as OrderStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {error ? <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">Không tải được đơn hàng. Kiểm tra kết nối rồi tải lại trang.</p>
        : loading ? <p className="text-sm text-slate-500">Đang tải đơn hàng…</p>
        : list.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Không có đơn hàng khớp bộ lọc. Thử đổi trạng thái hoặc kho.</p>
        : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr><th className="px-3 py-2">Mã đơn</th><th className="px-3 py-2">Khách hàng</th><th className="px-3 py-2">Kho xuất</th><th className="px-3 py-2 text-right">Tổng tiền</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Tạo lúc</th><th className="px-3 py-2"><span className="sr-only">Chi tiết</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map(o => (
                <tr key={o.id}>
                  <td className="px-3 py-2.5 font-medium">{o.orderCode}</td><td className="px-3 py-2.5">{o.customerName}</td>
                  <td className="px-3 py-2.5">{o.warehouseCodes.join(', ')}</td><td className="px-3 py-2.5 text-right">{formatVnd(o.grandTotal)}</td>
                  <td className="px-3 py-2.5"><OrderBadge status={o.status} /></td><td className="px-3 py-2.5">{formatTime(o.createdAt)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setSelectedId(o.id)} aria-label={`Xem chi tiết ${o.orderCode}`} className="min-h-11 rounded-md px-3 text-teal-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Chi tiết</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <OrderDrawer order={selected} onClose={() => setSelectedId(null)} onAdvance={advanceStatus} />
    </div>
  );
}
