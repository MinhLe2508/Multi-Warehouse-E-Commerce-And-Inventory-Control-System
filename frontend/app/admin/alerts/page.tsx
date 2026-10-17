'use client';

import { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, PlusCircle } from 'lucide-react';
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
    <div className="mx-auto max-w-5xl" style={{ maxWidth: '1000px' }}>
      <h1 className="h4 fw-bold mb-4 text-dark" style={{ letterSpacing: '-0.02em' }}>
        Cảnh báo tồn kho thấp
      </h1>

      <div className="mb-3">
        <select
          value={level}
          onChange={e => setLevel(e.target.value as AlertLevel | 'ALL')}
          aria-label="Lọc theo mức cảnh báo"
          className="form-select form-select-sm"
          style={{
            maxWidth: '180px',
            minHeight: '40px',
            borderColor: '#ede9fe',
            borderRadius: '8px',
            fontSize: '0.875rem',
            backgroundColor: '#ffffff',
          }}
        >
          <option value="ALL">Mọi mức</option>
          <option value="CRITICAL">Nghiêm trọng</option>
          <option value="WARNING">Sắp hết</option>
        </select>
      </div>

      {notice && (
        <div
          role="status"
          className="p-3 mb-3 rounded-3 small fw-medium d-flex align-items-center gap-2"
          style={{
            backgroundColor: '#f5f3ff',
            color: '#6d28d9',
            border: '1px solid #ede9fe',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {list.length === 0 ? (
        <div
          className="p-5 text-center small text-secondary rounded-3 border"
          style={{ borderColor: '#ede9fe', backgroundColor: '#ffffff' }}
        >
          ✅ Không có cảnh báo đang mở. Tồn kho tất cả các mặt hàng đang trên ngưỡng an toàn.
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {list.map(a => (
            <div
              key={a.id}
              className="d-flex flex-wrap align-items-center justify-content-between gap-3 p-3.5 bg-white border rounded-3 shadow-sm"
              style={{
                borderColor: '#ede9fe',
                transition: 'all 0.2s ease',
              }}
            >
              <div className="small">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <AlertBadge level={a.alertLevel} />
                  <span className="fw-bold text-dark">{a.sku}</span> · <span className="text-secondary">{a.productName}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Kho: <strong className="text-dark">{a.warehouseCode}</strong> · Khả dụng: <strong className="text-dark">{a.availableAtTrigger}</strong>, Ngưỡng tối thiểu: {a.thresholdAtTrigger} · {formatTime(a.triggeredAt)}
                </div>
              </div>

              {/* Toàn bộ các nút hành động — 100% Theme Tím Trắng Luxury */}
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRestock(a)}
                  className="btn btn-gradient-purple small"
                  style={{
                    minHeight: '40px',
                    padding: '0.45rem 1.1rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <PlusCircle size={15} />
                  <span>Tạo yêu cầu nhập kho</span>
                </button>

                <button
                  type="button"
                  disabled
                  title="Điều chuyển kho chưa có trong đặc tả (SRS) — chờ backend"
                  className="btn btn-disabled-purple small"
                  style={{
                    minHeight: '40px',
                    padding: '0.45rem 0.95rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <ArrowLeftRight size={14} />
                  <span>Điều chuyển kho</span>
                </button>

                <button
                  type="button"
                  onClick={() => resolve(a.id)}
                  className="btn btn-outline-purple small"
                  style={{
                    minHeight: '40px',
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>Đánh dấu đã xử lý</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RestockDialog
        alert={restock}
        onClose={() => setRestock(null)}
        onSubmit={(a, qty) => setNotice(`Đã tạo yêu cầu nhập ${qty} đơn vị ${a.sku} cho ${a.warehouseCode}.`)}
      />
    </div>
  );
}
