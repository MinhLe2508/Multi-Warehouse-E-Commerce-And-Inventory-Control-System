'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Modal } from 'react-bootstrap';
import { RefreshCw, Search } from 'lucide-react';
import { apiGet, extractErrorMessage } from '../../../shared/lib/apiClient';
import { useAdminCtx } from '../AdminContext';

export interface AdminPageResult<Row> {
  items: Row[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function useAdminResource<Data>(path: string | null, version = 0) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data?: Data;
    error?: string;
  }>();
  const key = path && JSON.stringify([path, version, revision]);

  useEffect(() => {
    if (!path || !key) return;
    let active = true;
    void apiGet<Data>(path).then(
      (data) => {
        if (active) setSnapshot({ key, data });
      },
      (error: unknown) => {
        if (active) {
          setSnapshot({
            key,
            error: extractErrorMessage(error, 'Không tải được dữ liệu.'),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [path, key]);

  const current = key && snapshot?.key === key ? snapshot : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: Boolean(path && !current),
    refresh: () => setRevision((value) => value + 1),
  };
}

export function AdminPageFrame({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-workspace">
      <div className="admin-workspace-heading">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function RefreshButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="btn btn-outline-secondary btn-sm admin-workspace-button"
      onClick={onClick}
      disabled={disabled}
    >
      <RefreshCw size={15} aria-hidden="true" /> Làm mới
    </button>
  );
}

export function AdminFeedback({
  error,
  loading,
  empty,
  retry,
}: {
  error?: string;
  loading?: boolean;
  empty?: string;
  retry?: () => void;
}) {
  if (error) {
    return (
      <div
        className="alert alert-danger d-flex align-items-center justify-content-between flex-wrap gap-2 mb-0"
        role="alert"
      >
        <span>{error}</span>
        {retry && (
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            onClick={retry}
          >
            Thử lại
          </button>
        )}
      </div>
    );
  }
  if (loading)
    return (
      <div className="admin-workspace-placeholder" role="status">
        Đang tải dữ liệu…
      </div>
    );
  return empty ? (
    <div className="admin-workspace-placeholder">{empty}</div>
  ) : null;
}

type Column<Row> = {
  heading: string;
  render: (row: Row) => ReactNode;
  className?: string;
};

export function AdminDataTable<Row extends { id: string }>({
  columns,
  rows,
  empty,
}: {
  columns: Column<Row>[];
  rows: Row[];
  empty: string;
}) {
  if (rows.length === 0) return <AdminFeedback empty={empty} />;
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0 admin-workspace-table">
        <thead>
          <tr>
            {columns.map(({ heading, className }) => (
              <th key={heading} scope="col" className={className}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map(({ heading, render, className }) => (
                <td key={heading} className={className}>
                  {render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="admin-workspace-pager">
      <span>{total.toLocaleString('vi-VN')} kết quả</span>
      {Math.max(page, totalPages) > 1 && (
        <div
          className="d-flex gap-2 align-items-center"
          aria-label="Phân trang"
        >
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onChange(page - 1)}
            disabled={page <= 1}
          >
            Trước
          </button>
          <span>
            {page}/{Math.max(page, totalPages)}
          </span>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => onChange(page + 1)}
            disabled={page >= totalPages}
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
}

type ListFilter = {
  key: string;
  label: string;
  options: Record<string, string>;
};

export function WarehouseScope() {
  const { warehouses, warehouseId, setWarehouseId } = useAdminCtx();
  return (
    <label className="d-md-none">
      <span>Kho hàng</span>
      <select
        className="form-select"
        value={warehouseId}
        onChange={(event) => setWarehouseId(event.target.value)}
      >
        <option value="ALL">Tất cả kho hàng</option>
        {warehouses.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminCollection<Row extends { id: string }>({
  title,
  description,
  searchLabel,
  filters = [],
  endpoint,
  warehouseId,
  columns,
  empty,
  version,
  actions,
  beforeTable,
  onRefresh,
}: {
  title: string;
  description?: string;
  searchLabel: string;
  filters?: ListFilter[];
  endpoint: string;
  warehouseId?: string;
  columns: Column<Row>[];
  empty: string;
  version?: number;
  actions?: ReactNode;
  beforeTable?: (listError: string | undefined) => ReactNode;
  onRefresh?: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [filtersApplied, setFiltersApplied] = useState('');
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const params = new URLSearchParams(filtersApplied);
  if (warehouseId && warehouseId !== 'ALL')
    params.set('warehouseId', warehouseId);
  const key = params.toString();
  const page = pagination.key === key ? pagination.page : 1;
  params.set('page', String(page));
  params.set('limit', '20');
  const result = useAdminResource<AdminPageResult<Row>>(
    `${endpoint}?${params}`,
    version,
  );

  function refresh() {
    result.refresh();
    onRefresh?.();
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiltersApplied(
      new URLSearchParams(
        Object.entries(draft)
          .filter(([, value]) => value.trim())
          .map(([field, value]) => [field, value.trim()]),
      ).toString(),
    );
    setPagination({ key: '', page: 1 });
  }

  return (
    <AdminPageFrame
      title={title}
      description={description}
      actions={
        <>
          {actions}
          <RefreshButton onClick={refresh} disabled={result.loading} />
        </>
      }
    >
      {beforeTable?.(result.error)}
      <form
        className="admin-workspace-panel admin-workspace-filters"
        onSubmit={search}
      >
        <label className="admin-workspace-search">
          <span>Tìm kiếm</span>
          <span className="position-relative d-block">
            <Search
              className="admin-workspace-search-icon"
              aria-hidden="true"
              size={16}
            />
            <input
              type="search"
              aria-label={searchLabel}
              placeholder={searchLabel}
              className="form-control"
              maxLength={200}
              value={draft.search ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, search: event.target.value })
              }
            />
          </span>
        </label>
        {filters.map(({ key, label, options }) => (
          <label key={key}>
            <span>{label}</span>
            <select
              className="form-select"
              value={draft[key] ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
            >
              <option value="">Tất cả</option>
              {Object.entries(options).map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ))}
        {warehouseId !== undefined && <WarehouseScope />}
        <div className="d-flex align-items-center gap-2">
          <button
            type="submit"
            className="btn btn-gradient-purple admin-workspace-button"
          >
            Áp dụng
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary admin-workspace-button"
            disabled={!filtersApplied && !Object.values(draft).some(Boolean)}
            onClick={() => {
              setDraft({});
              setFiltersApplied('');
              setPagination({ key: '', page: 1 });
            }}
          >
            Xóa lọc
          </button>
        </div>
      </form>
      <div className="admin-workspace-panel overflow-hidden">
        {result.data ? (
          <>
            <AdminDataTable
              columns={columns}
              rows={result.data.items}
              empty={empty}
            />
            <AdminPager
              {...result.data}
              onChange={(next) => setPagination({ key, page: next })}
            />
          </>
        ) : (
          <AdminFeedback
            error={result.error}
            retry={refresh}
            loading={result.loading}
          />
        )}
      </div>
    </AdminPageFrame>
  );
}

const adminModalContainer = () =>
  document.querySelector<HTMLElement>('.admin-root') ?? document.body;

export function AdminDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      show
      onHide={onClose}
      scrollable
      size="lg"
      container={adminModalContainer}
      aria-labelledby="admin-workspace-dialog"
    >
      <Modal.Header closeButton closeLabel="Đóng">
        <Modal.Title id="admin-workspace-dialog" className="fs-5">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
    </Modal>
  );
}

export function RecordStatus({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  return <span className={`admin-record-status is-${tone}`}>{label}</span>;
}

export function OrderReference({
  order,
}: {
  order: { id: string; orderCode: string };
}) {
  return (
    <Link
      className="admin-record-link"
      href={`/admin/orders/${encodeURIComponent(order.id)}`}
    >
      {order.orderCode}
    </Link>
  );
}

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
});

export const localDateTime = (value: string | null) =>
  value ? dateTime.format(new Date(value)) : '—';
