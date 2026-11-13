'use client';

import { useState } from 'react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import { OrderDrawer } from '../../../components/admin/OrderDrawer';
import { OrderBadge } from '../../../components/admin/StatusBadge';
import { useAdminOrders } from '../../../hooks/useAdminOrders';
import { STATUS_LABEL, formatTime, formatVnd } from '../../../shared/lib/format';
import type { OrderStatus } from '../../../shared/types/admin';
import { RefreshCw, AlertCircle, Info } from 'lucide-react';

export default function AdminOrdersPage() {
  const {
    orders,
    filters,
    loading,
    error,
    lastUpdated,
    conflictNotice,
    setConflictNotice,
    updateFilters,
    advanceStatus,
    refreshOrders,
  } = useAdminOrders();

  const { warehouses, warehouseId } = useAdminCtx();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const whCode = warehouses.find(w => w.id === warehouseId)?.code;
  const list = orders.filter(
    o => !whCode || o.warehouseCodes.includes(whCode) || o.warehouseCodes.length === 0
  );
  const selected = orders.find(o => o.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-7xl">
      {/* Tiêu đề & Nút làm mới */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div className="d-flex align-items-center gap-3">
          <h1 className="h4 fw-bold mb-0 text-dark">Đơn hàng</h1>
        </div>

        <div className="d-flex align-items-center gap-2 small text-muted">
          <span>Cập nhật lúc: <strong>{lastUpdated}</strong></span>
          <button
            type="button"
            onClick={refreshOrders}
            className="btn btn-outline-secondary btn-sm p-1 d-flex align-items-center justify-content-center"
            style={{ width: '28px', height: '28px', borderRadius: '6px' }}
            title="Làm mới dữ liệu đơn hàng"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {conflictNotice && (
        <div className="alert alert-info alert-dismissible fade show d-flex align-items-center justify-content-between mb-3 small" role="alert">
          <div className="d-flex align-items-center gap-2">
            <Info size={16} />
            <span>{conflictNotice}</span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setConflictNotice(null)}
            aria-label="Đóng"
          />
        </div>
      )}

      {/* Bộ lọc tìm kiếm, trạng thái và khoảng ngày */}
      <div className="mb-3 d-flex flex-wrap gap-2">
        <input
          type="search"
          value={filters.q ?? ''}
          onChange={e => updateFilters({ q: e.target.value })}
          placeholder="Tìm theo mã đơn, tên hoặc SĐT khách"
          aria-label="Tìm đơn hàng"
          className="form-control form-control-sm"
          style={{ maxWidth: '280px', minHeight: '38px', borderColor: '#ede9fe', borderRadius: '8px' }}
        />
        <select
          value={filters.status ?? 'ALL'}
          onChange={e => updateFilters({ status: e.target.value as OrderStatus | 'ALL' })}
          aria-label="Lọc theo trạng thái"
          className="form-select form-select-sm"
          style={{ maxWidth: '200px', minHeight: '38px', borderColor: '#ede9fe', borderRadius: '8px' }}
        >
          <option value="ALL">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABEL) as OrderStatus[]).map(s => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.from ?? ''}
          onChange={e => updateFilters({ from: e.target.value })}
          aria-label="Từ ngày"
          className="form-control form-control-sm"
          style={{ maxWidth: '160px', minHeight: '38px', borderColor: '#ede9fe', borderRadius: '8px' }}
        />
        <input
          type="date"
          value={filters.to ?? ''}
          onChange={e => updateFilters({ to: e.target.value })}
          aria-label="Đến ngày"
          className="form-control form-control-sm"
          style={{ maxWidth: '160px', minHeight: '38px', borderColor: '#ede9fe', borderRadius: '8px' }}
        />
      </div>

      {error ? (
        <div role="alert" className="alert alert-danger d-flex align-items-center justify-content-between gap-2 small">
          <div className="d-flex align-items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button type="button" onClick={refreshOrders} className="btn btn-danger btn-sm">
            Tải lại
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-secondary">Đang tải đơn hàng…</p>
      ) : list.length === 0 ? (
        <div className="rounded-3 border border-dashed p-5 text-center text-secondary small bg-white">
          Không có đơn hàng khớp bộ lọc. Thử đổi trạng thái hoặc kho.
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-3 border bg-white shadow-sm"
          style={{ borderColor: '#ede9fe' }}
        >
          <table className="table table-hover align-middle mb-0 text-sm">
            <thead style={{ backgroundColor: '#faf5ff' }}>
              <tr className="text-secondary small fw-semibold">
                <th className="px-3 py-2.5">Mã đơn</th>
                <th className="px-3 py-2.5">Khách hàng</th>
                <th className="px-3 py-2.5">Kho xuất</th>
                <th className="px-3 py-2.5 text-end">Tổng tiền</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5">Tạo lúc</th>
                <th className="px-3 py-2.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map(o => (
                <tr key={o.id}>
                  <td className="px-3 py-2.5 font-monospace fw-bold text-dark">{o.orderCode}</td>
                  <td className="px-3 py-2.5 text-dark">{o.customerName}</td>
                  <td className="px-3 py-2.5 text-secondary">{o.warehouseCodes.join(', ')}</td>
                  <td className="px-3 py-2.5 text-end fw-semibold text-dark">{formatVnd(o.grandTotal)}</td>
                  <td className="px-3 py-2.5">
                    <OrderBadge status={o.status} />
                  </td>
                  <td className="px-3 py-2.5 text-secondary">{formatTime(o.createdAt)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      aria-label={`Xem chi tiết ${o.orderCode}`}
                      className="btn btn-outline-primary btn-sm"
                      style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                    >
                      Chi tiết
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <OrderDrawer
        order={selected}
        onClose={() => setSelectedId(null)}
        onAdvance={advanceStatus}
      />
    </div>
  );
}
