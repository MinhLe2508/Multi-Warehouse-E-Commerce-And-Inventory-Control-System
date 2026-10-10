'use client';
import { useMemo, useState } from 'react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import { useInventory } from '../../../hooks/useAdminAnalytics';

export default function AdminInventoryPage() {
  const { rows, warehouses, loading, error } = useInventory();
  const { warehouseId, setWarehouseId } = useAdminCtx();
  const [q, setQ] = useState('');

  const products = useMemo(() => {
    const map = new Map<string, { sku: string; name: string; category: string; stock: number; reserved: number; available: number; low: boolean; perWh: { code: string; available: number; low: boolean }[] }>();
    for (const r of rows) {
      if (warehouseId !== 'ALL' && r.warehouseId !== warehouseId) continue;
      if (q && !(r.sku + r.name).toLowerCase().includes(q.toLowerCase())) continue;
      const p = map.get(r.sku) ?? { sku: r.sku, name: r.name, category: r.categoryName, stock: 0, reserved: 0, available: 0, low: false, perWh: [] };
      const low = r.availableStock <= r.threshold; // TODO: nhóm chốt so với stock hay available_stock
      p.stock += r.stock; p.reserved += r.reservedStock; p.available += r.availableStock; p.low ||= low;
      p.perWh.push({ code: warehouses.find(w => w.id === r.warehouseId)?.code ?? '?', available: r.availableStock, low });
      map.set(r.sku, p);
    }
    return [...map.values()];
  }, [rows, warehouses, warehouseId, q]);

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="mb-4 text-xl font-bold">Tồn kho theo kho</h1>
      <div className="mb-3 flex flex-wrap gap-3">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm theo SKU hoặc tên sản phẩm" aria-label="Tìm sản phẩm"
          className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm sm:w-72 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" />
        <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)} aria-label="Lọc theo kho"
          className="min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <option value="ALL">Tất cả kho</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      {error ? <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">Không tải được tồn kho. Kiểm tra kết nối rồi tải lại trang.</p>
        : loading ? <p className="text-sm text-slate-500">Đang tải tồn kho…</p>
        : products.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Không tìm thấy sản phẩm. Thử từ khóa khác hoặc chọn “Tất cả kho”.</p>
        : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Sản phẩm</th><th className="px-3 py-2 text-right">Tổng tồn kho</th><th className="px-3 py-2 text-right">Đang giữ chỗ</th><th className="px-3 py-2 text-right">Khả dụng</th><th className="px-3 py-2">Khả dụng theo kho</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map(p => (
                <tr key={p.sku}>
                  <td className="px-3 py-2.5 font-medium">{p.sku}</td>
                  <td className="px-3 py-2.5">{p.name}<div className="text-xs text-slate-500">{p.category}</div></td>
                  <td className="px-3 py-2.5 text-right">{p.stock}</td><td className="px-3 py-2.5 text-right">{p.reserved}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${p.low ? 'text-rose-800' : ''}`}>{p.available}</td>
                  <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1.5">
                    {p.perWh.map(w => <span key={w.code} className={`rounded px-2 py-0.5 text-xs ${w.low ? 'bg-rose-100 text-rose-900' : 'bg-slate-100 text-slate-800'}`}>{w.code}: {w.available}{w.low ? ' (thấp)' : ''}</span>)}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
