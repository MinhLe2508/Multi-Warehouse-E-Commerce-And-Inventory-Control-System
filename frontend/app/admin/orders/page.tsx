'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import { OrderDrawer } from '../../../components/admin/OrderDrawer';
import { OrderBadge } from '../../../components/admin/StatusBadge';
import { useAdminOrders } from '../../../hooks/useAdminOrders';
import {
  STATUS_LABEL,
  formatTime,
  formatVnd,
} from '../../../shared/lib/format';
import type { OrderStatus } from '../../../shared/types/admin';
import { Info, Search } from 'lucide-react';
import {
  AdminDataTable,
  AdminFeedback,
  AdminPageFrame,
  AdminPager,
  RefreshButton,
  RecordStatus,
  WarehouseScope,
} from '../../../components/admin/operations/AdminUi';

export default function AdminOrdersPage() {
  const { warehouseId } = useAdminCtx();
  const isStaff = usePathname().startsWith('/staff/');
  const {
    orders,
    total,
    totalPages,
    filters,
    loading,
    updating,
    error,
    updateError,
    lastUpdated,
    conflictNotice,
    setConflictNotice,
    updateFilters,
    advanceStatus,
    refreshOrders,
  } = useAdminOrders(warehouseId);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <AdminPageFrame
      title="Đơn hàng"
      description="Tra cứu đơn theo khách hàng, trạng thái và kho xuất."
      actions={
        <div className="d-flex flex-wrap align-items-center gap-2">
          {lastUpdated !== '—' && (
            <span className="admin-record-meta">
              Cập nhật lúc {lastUpdated}
            </span>
          )}
          <RefreshButton onClick={refreshOrders} disabled={loading} />
        </div>
      }
    >
      {conflictNotice && (
        <div
          className="alert alert-info d-flex align-items-center justify-content-between gap-2 mb-0 small"
          role="alert"
        >
          <div className="d-flex align-items-center gap-2">
            <Info size={16} aria-hidden="true" />
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
      <AdminFeedback error={updateError ?? undefined} />

      <div className="admin-workspace-panel admin-workspace-filters">
        <label className="admin-workspace-search">
          <span>Tìm đơn hàng</span>
          <span className="position-relative d-block">
            <Search
              size={16}
              className="admin-workspace-search-icon"
              aria-hidden="true"
            />
            <input
              type="search"
              value={filters.q}
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder="Mã đơn, tên hoặc số điện thoại"
              className="form-control"
              maxLength={200}
            />
          </span>
        </label>
        <label>
          <span>Trạng thái</span>
          <select
            value={filters.status}
            onChange={(event) =>
              updateFilters({
                status: event.target.value as OrderStatus | 'ALL',
              })
            }
            className="form-select"
          >
            <option value="ALL">Tất cả trạng thái</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Từ ngày</span>
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => updateFilters({ from: event.target.value })}
            className="form-control"
          />
        </label>
        <label>
          <span>Đến ngày</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => updateFilters({ to: event.target.value })}
            className="form-control"
          />
        </label>
        {!isStaff && <label>
          <span>Đối soát VietQR</span>
          <select className="form-select" value={filters.paymentSupport}
            onChange={(event) => updateFilters({ paymentSupport: event.target.value === 'OPEN' ? 'OPEN' : 'ALL' })}>
            <option value="ALL">Tất cả đơn</option>
            <option value="OPEN">Có yêu cầu CSKH đang mở</option>
          </select>
        </label>}
        {!isStaff && <WarehouseScope />}
      </div>

      <div className="admin-workspace-panel overflow-hidden">
        {error || loading ? (
          <AdminFeedback
            error={error ?? undefined}
            loading={loading}
            retry={refreshOrders}
          />
        ) : (
          <>
            <AdminDataTable
              rows={orders}
              empty="Không có đơn hàng khớp bộ lọc."
              columns={[
                {
                  heading: 'Mã đơn',
                  className: 'text-nowrap',
                  render: (order) => (
                    <strong className="font-monospace">
                      {order.orderCode}
                    </strong>
                  ),
                },
                {
                  heading: 'Khách hàng',
                  render: (order) => order.customerName,
                },
                {
                  heading: 'Kho xuất',
                  render: (order) => order.warehouseCodes.join(', ') || '—',
                },
                {
                  heading: 'Tổng tiền',
                  className:
                    'text-end text-nowrap fw-semibold admin-catalog-price',
                  render: (order) => formatVnd(order.grandTotal),
                },
                {
                  heading: 'Trạng thái',
                  render: (order) => <div className="d-flex flex-wrap gap-1">
                    <OrderBadge status={order.status} />
                    {order.paymentSupport?.status === 'OPEN' && <RecordStatus label="Cần đối soát" tone="warn" />}
                    {!isStaff && order.paymentMethod === 'BANK_TRANSFER' && order.paymentStatus === 'SUCCESS' &&
                      <RecordStatus label="Đã thanh toán" tone="good" />}
                  </div>,
                },
                {
                  heading: 'Tạo lúc',
                  className: 'text-nowrap',
                  render: (order) => formatTime(order.createdAt),
                },
                {
                  heading: 'Thao tác',
                  className: 'text-end',
                  render: (order) => order.paymentSupport?.status === 'OPEN' ? (
                    <Link className="btn btn-outline-primary btn-sm text-nowrap" href={`/admin/orders/${order.id}`}
                      aria-label={`Xem chi tiết ${order.orderCode}`}>Chi tiết</Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      aria-label={`Xem chi tiết ${order.orderCode}`}
                      className="btn btn-outline-primary btn-sm text-nowrap"
                    >
                      Chi tiết
                    </button>
                  ),
                },
              ]}
            />
            <AdminPager
              total={total}
              totalPages={totalPages}
              page={filters.page}
              onChange={(page) => updateFilters({ page })}
            />
          </>
        )}
      </div>

      <OrderDrawer
        order={selected}
        updating={updating}
        onClose={() => setSelectedId(null)}
        onAdvance={advanceStatus}
      />
    </AdminPageFrame>
  );
}
