'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { AlertBadge } from '../../../components/admin/StatusBadge';
import { useStockAlerts } from '../../../hooks/useStockAlerts';
import { formatTime } from '../../../shared/lib/format';
import type { AlertLevel } from '../../../shared/types/admin';

export default function AdminAlertsPage() {
  const { alerts, loading, resolvingId, error, realtimeStatus, resolve, refresh } = useStockAlerts();
  const [level, setLevel] = useState<AlertLevel | 'ALL'>('ALL');
  const [notice, setNotice] = useState('');

  const list = alerts.filter(
    (a) => a.status === 'OPEN' && (level === 'ALL' || a.alertLevel === level)
  );

  const handleResolve = async (id: string, sku: string) => {
    const ok = await resolve(id);
    if (ok) {
      setNotice(`Đã đánh dấu xử lý cảnh báo cho ${sku}.`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl" style={{ maxWidth: '1000px' }}>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <h1 className="h4 fw-bold mb-0 text-dark" style={{ letterSpacing: '-0.02em' }}>
          Cảnh báo tồn kho thấp
        </h1>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {realtimeStatus === 'reconnecting' && (
        <div className="alert alert-warning d-flex align-items-center gap-2 small mb-3">
          <RefreshCw size={14} className="spin" />
          <span>Đang kết nối lại kênh cảnh báo realtime...</span>
        </div>
      )}

      <div className="mb-3">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as AlertLevel | 'ALL')}
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

      {error ? (
        <div role="alert" className="alert alert-danger d-flex align-items-center justify-content-between gap-2 small">
          <div className="d-flex align-items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => void refresh()} className="btn btn-danger btn-sm">
            Tải lại
          </button>
        </div>
      ) : loading ? (
        <div className="p-5 text-center small text-secondary rounded-3 border bg-white">
          Đang tải danh sách cảnh báo...
        </div>
      ) : list.length === 0 ? (
        <div
          className="p-5 text-center small text-secondary rounded-3 border"
          style={{ borderColor: '#ede9fe', backgroundColor: '#ffffff' }}
        >
          Không có cảnh báo đang mở. Tồn kho tất cả các mặt hàng đang trên ngưỡng an toàn.
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {list.map((a) => {
            const levelValue: AlertLevel = a.alertLevel === 'CRITICAL' ? 'CRITICAL' : 'WARNING';
            return (
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
                    <AlertBadge level={levelValue} />
                    <span className="fw-bold text-dark">{a.productSku}</span> ·{' '}
                    <span className="text-secondary">{a.productName}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                    Kho: <strong className="text-dark">{a.warehouseCode}</strong> · Khả dụng:{' '}
                    <strong className="text-dark">
                      {a.currentAvailable ?? a.availableAtTrigger}
                    </strong>
                    , Ngưỡng tối thiểu: {a.thresholdAtTrigger} · {formatTime(a.triggeredAt)}
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-2">
                  <Link
                    href="/admin/inventory"
                    className="btn btn-gradient-purple small d-inline-flex align-items-center gap-1"
                    style={{
                      minHeight: '40px',
                      padding: '0.45rem 1.1rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span>Nhập thêm hàng</span>
                    <ArrowRight size={14} />
                  </Link>
                  <button
                    type="button"
                    disabled={resolvingId === a.id}
                    onClick={() => void handleResolve(a.id, a.productSku)}
                    className="btn btn-outline-secondary small"
                    style={{ minHeight: '40px', fontSize: '0.85rem' }}
                  >
                    {resolvingId === a.id ? 'Đang xử lý...' : 'Đã xử lý'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
