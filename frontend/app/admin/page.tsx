'use client';
import Link from 'next/link';
import { KpiCards } from '../../components/admin/KpiCards';
import { RevenueChart } from '../../components/admin/RevenueChart';
import { AlertBadge, OrderBadge } from '../../components/admin/StatusBadge';
import { useAdminOrders } from '../../hooks/useAdminOrders';
import { useAlerts, useDashboard } from '../../hooks/useAdminAnalytics';
import { NEXT_STATUS, formatTime, formatVnd } from '../../shared/lib/format';

export default function AdminDashboardPage() {
  const { kpi, series } = useDashboard();
  const { alerts } = useAlerts();
  const { orders } = useAdminOrders();
  const openAlerts = alerts.filter(a => a.status === 'OPEN').slice(0, 4);
  const needAction = orders.filter(o => NEXT_STATUS[o.status]).slice(0, 5);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <h1 className="text-xl font-bold">Tổng quan</h1>
      <KpiCards kpi={kpi} />
      <RevenueChart data={series} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Cảnh báo tồn kho</h2><Link href="/admin/alerts" className="text-sm text-teal-800 underline">Xem tất cả</Link></div>
          {openAlerts.length === 0 ? <p className="text-sm text-slate-500">Không có cảnh báo nào đang mở.</p> : (
            <ul className="divide-y divide-slate-100">
              {openAlerts.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span><b>{a.sku}</b> tại {a.warehouseCode}<br /><span className="text-slate-500">Còn {a.availableAtTrigger} / ngưỡng {a.thresholdAtTrigger}</span></span>
                  <AlertBadge level={a.alertLevel} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-base font-semibold">Đơn cần xử lý</h2><Link href="/admin/orders" className="text-sm text-teal-800 underline">Xem tất cả</Link></div>
          {needAction.length === 0 ? <p className="text-sm text-slate-500">Không có đơn nào cần xử lý.</p> : (
            <ul className="divide-y divide-slate-100">
              {needAction.map(o => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span><b>{o.orderCode}</b> · {formatVnd(o.grandTotal)}<br /><span className="text-slate-500">{o.customerName} · {formatTime(o.createdAt)}</span></span>
                  <OrderBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
