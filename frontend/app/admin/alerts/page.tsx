'use client';
import { useState } from 'react';
import { RestockDialog } from '../../../components/admin/RestockDialog';
import { AlertBadge } from '../../../components/admin/StatusBadge';
import { useAlerts } from '../../../hooks/useAdminAnalytics';
import { formatTime } from '../../../shared/lib/format';
import type { AlertLevel, StockAlert } from '../../../shared/types/admin';

export default function AdminAlertsPage() {
  const { alerts, resolve } = useAlerts();
  const [level, setLevel] = useState<AlertLevel | 'ALL'>('ALL');
  const [restock, setRestock] = useState<StockAlert | null>(null);
  const [notice, setNotice] = useState('');
  const list = alerts.filter(a => a.status === 'OPEN' && (level === 'ALL' || a.alertLevel === level));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-bold">Cảnh báo tồn kho thấp</h1>
      <select value={level} onChange={e => setLevel(e.target.value as AlertLevel | 'ALL')} aria-label="Lọc theo mức cảnh báo"
        className="mb-3 min-h-11 rounded-md border border-slate-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
        <option value="ALL">Mọi mức</option><option value="CRITICAL">Nghiêm trọng</option><option value="WARNING">Sắp hết</option>
      </select>
      {notice && <p role="status" className="mb-3 rounded-md bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}

      {list.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Không có cảnh báo đang mở. Tồn kho đang trên ngưỡng.</p> : (
        <ul className="flex flex-col gap-3">
          {list.map(a => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm">
                <div className="flex items-center gap-2"><AlertBadge level={a.alertLevel} /><b>{a.sku}</b> · {a.productName}</div>
                <div className="mt-1 text-slate-600">{a.warehouseCode}: khả dụng {a.availableAtTrigger}, ngưỡng tối thiểu {a.thresholdAtTrigger} · {formatTime(a.triggeredAt)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setRestock(a)} className="min-h-11 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">Tạo yêu cầu nhập kho</button>
                <button disabled title="Điều chuyển kho chưa có trong đặc tả (SRS) — cần nhóm chốt trước khi làm" className="min-h-11 rounded-md border border-slate-300 px-3 text-sm text-slate-400">Điều chuyển kho</button>
                <button onClick={() => resolve(a.id)} className="min-h-11 rounded-md border border-slate-300 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">Đánh dấu đã xử lý</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <RestockDialog alert={restock} onClose={() => setRestock(null)}
        onSubmit={(a, qty) => setNotice(`Đã tạo yêu cầu nhập ${qty} đơn vị ${a.sku} cho ${a.warehouseCode}.`)} />
    </div>
  );
}
