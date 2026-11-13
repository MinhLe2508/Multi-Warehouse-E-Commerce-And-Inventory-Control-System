import { formatVnd } from '../../shared/lib/format';

interface Kpi { revenueToday: number; revenueMonth: number; totalOrders: number; completionRate: number; lowStockCount: number }

export function KpiCards({ kpi }: { kpi: Kpi }) {
  const small = 'rounded-lg border border-slate-200 bg-white p-4';
  return (
    <section aria-label="Chỉ số chính" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 sm:col-span-2">
        <h2 className="text-sm text-teal-900">Doanh thu</h2>
        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div><div className="text-2xl font-bold">{formatVnd(kpi.revenueToday)}</div><div className="text-sm text-slate-600">Hôm nay</div></div>
          <div><div className="text-xl font-semibold">{formatVnd(kpi.revenueMonth)}</div><div className="text-sm text-slate-600">14 ngày gần nhất</div></div>
        </div>
      </div>
      <div className={small}><h2 className="text-sm text-slate-600">Tổng số đơn hàng</h2><div className="mt-2 text-2xl font-bold">{kpi.totalOrders}</div></div>
      <div className={small}><h2 className="text-sm text-slate-600">Tỉ lệ hoàn tất</h2><div className="mt-2 text-2xl font-bold">{kpi.completionRate}%</div></div>
      <div className={small}><h2 className="text-sm text-slate-600">Mặt hàng sắp hết</h2><div className="mt-2 text-2xl font-bold text-rose-800">{kpi.lowStockCount}</div></div>
    </section>
  );
}
