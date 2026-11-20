'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Modal } from 'react-bootstrap';
import { RefreshCw } from 'lucide-react';
import { extractErrorMessage } from '@/shared/lib/apiClient';
import { AdminFeedback, AdminPager } from '@/components/admin/operations/AdminUi';

export type Column<T> = { title: string; render: (row: T) => ReactNode; align?: 'right' };

export function PageTitle({ title, description, actions }: {
  title: string; description?: string; actions?: ReactNode;
}) {
  return (
    <div className="staff-page-title">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="staff-actions">{actions}</div>}
    </div>
  );
}

export function Refresh({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="staff-button" onClick={onClick} disabled={disabled}>
    <RefreshCw size={16} aria-hidden="true" /> Làm mới
  </button>;
}

export function Table<T extends { id: string }>({ rows, columns, label }: {
  rows: T[]; columns: Column<T>[]; label: string;
}) {
  return (
    <div className="staff-table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="staff-table">
        <thead><tr>{columns.map(({ title, align }) => <th key={title} scope="col" className={align === 'right' ? 'staff-number' : undefined}>{title}</th>)}</tr></thead>
        <tbody>{rows.map((row) =>
          <tr key={row.id}>{columns.map(({ title, render, align }) =>
            <td key={title} className={align === 'right' ? 'staff-number' : undefined}>{render(row)}</td>,
          )}</tr>,
        )}</tbody>
      </table>
    </div>
  );
}

export function Records<T extends { id: string }>({
  data, columns, page, pageSize, onPage, label, empty, loading, error, refresh,
}: {
  data?: { items: T[]; total: number };
  columns: Column<T>[]; page: number; pageSize: number; label: string; empty: string;
  loading: boolean; error?: string; refresh: () => void; onPage: (page: number) => void;
}) {
  return (
    <section className="staff-panel staff-records" aria-label={label}>
      {data && data.items.length > 0
        ? <Table label={label} rows={data.items} columns={columns} />
        : <AdminFeedback error={error ?? undefined} loading={loading} empty={empty} retry={refresh} />}
      {data && data.total > 0 && <AdminPager page={page} total={data.total}
        totalPages={Math.ceil(data.total / pageSize)} onChange={onPage} />}
    </section>
  );
}

export function Filters({
  children, onApply, onReset,
}: {
  children: ReactNode; onApply: (form: FormData) => void; onReset?: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply(new FormData(event.currentTarget));
  }
  return <form className="staff-panel staff-filters" onSubmit={submit}>
    {children}
    <div className="staff-actions">
      <button className="staff-button primary" type="submit">Lọc</button>
      {onReset && <button className="staff-button" type="reset" onClick={onReset}>Đặt lại</button>}
    </div>
  </form>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="staff-field"><span>{label}</span>{children}</label>;
}

export function Dialog({
  title, children, onClose, onConfirm, confirmText, success,
}: {
  title: string; children: ReactNode; onClose: () => void;
  onConfirm?: () => Promise<unknown>; confirmText?: string; success?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  async function confirm() {
    if (!onConfirm || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onConfirm();
      success?.();
      onClose();
    } catch (cause) {
      setError(extractErrorMessage(cause, 'Thao tác chưa hoàn tất. Vui lòng thử lại.'));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <Modal show centered scrollable className="staff-dialog" onHide={() => !inFlight.current && onClose()}
      backdrop={pending ? 'static' : true} keyboard={!pending} aria-labelledby="staff-dialog-heading">
      <Modal.Header closeButton={!pending} closeLabel="Đóng">
        <Modal.Title id="staff-dialog-heading" as="h2">{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}{error && <div className="staff-notice danger" role="alert">{error}</div>}</Modal.Body>
      <Modal.Footer>
        <button className="staff-button" type="button" disabled={pending} onClick={onClose}>
          {onConfirm ? 'Hủy' : 'Đóng'}
        </button>
        {onConfirm && <button className="staff-button primary" type="button" disabled={pending} onClick={() => void confirm()}>
          {pending ? 'Đang lưu…' : confirmText ?? 'Xác nhận'}
        </button>}
      </Modal.Footer>
    </Modal>
  );
}

export { AdminFeedback, AdminPager };
