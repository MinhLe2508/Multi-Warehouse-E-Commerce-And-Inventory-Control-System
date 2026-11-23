'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AdminCategoryItem } from '@/components/categories/ManageCategories';
import { apiDelete, apiPost, extractErrorMessage } from '@/shared/lib/apiClient';
import type { Promotion } from '@/shared/types/checkout';
import { AdminCollection, AdminDialog, AdminFeedback, localDateTime, RecordStatus, useAdminResource } from './AdminUi';

const statuses = { ACTIVE: 'Đang hiệu lực', EXPIRED: 'Hết hạn' };
const vietnamDate = (days: number) => new Date(Date.now() + (days * 24 + 7) * 3_600_000).toISOString().slice(0, 10);

function PromotionEditor({ onClose, onSaved }: {
  onClose: () => void; onSaved: (code: string) => void;
}) {
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const { data, error: categoryError, loading, refresh } = useAdminResource<AdminCategoryItem[]>('/categories/manage');
  const categories = (data ?? []).filter((item) => item.isActive && item.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (!all && !selected.length) {
      setError('Hãy chọn ít nhất một danh mục.');
      return;
    }
    const form = new FormData(event.currentTarget);
    const value = String(form.get('expiresAt'));
    const expiresAt = new Date((value.length === 16 ? value + ':00' : value) + '+07:00');
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      setError('Hạn sử dụng phải ở tương lai.');
      return;
    }

    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const promotion = await apiPost<Promotion>('/admin/promotions', {
        name: String(form.get('name')).trim(), percent: Number(form.get('percent')),
        allCategories: all, categoryIds: all ? [] : selected, expiresAt: expiresAt.toISOString(),
      });
      onSaved(promotion.code);
    } catch (cause) {
      setError(extractErrorMessage(cause, 'Chưa thể tạo khuyến mãi.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <AdminDialog title="Thêm khuyến mãi" onClose={() => { if (!pending.current) onClose(); }}>
    {error && <AdminFeedback error={error} />}
    <form onSubmit={(event) => void save(event)} className="d-grid gap-3">
      <label className="fw-semibold">Tên khuyến mãi
        <input name="name" className="form-control mt-1" required maxLength={150} disabled={busy} />
      </label>
      <div className="row g-3">
        <label className="col-sm-5 fw-semibold">Giảm giá (%)
          <input name="percent" type="number" min={1} max={100} step={1} className="form-control mt-1" required defaultValue={5} disabled={busy} />
        </label>
        <label className="col-sm-7 fw-semibold">Hạn sử dụng (giờ Việt Nam)
          <input name="expiresAt" type="datetime-local" className="form-control mt-1" required
            defaultValue={vietnamDate(1) + 'T23:59'} disabled={busy} />
        </label>
      </div>
      <fieldset className="border rounded-3 p-3 d-grid gap-2" disabled={busy}>
        <legend className="float-none w-auto px-2 fs-6 fw-semibold mb-0">Mặt hàng áp dụng</legend>
        <label className="d-flex align-items-center gap-2">
          <input className="form-check-input mt-0" type="radio" name="scope" checked={all} onChange={() => setAll(true)} /> Tất cả mặt hàng
        </label>
        <label className="d-flex align-items-center gap-2">
          <input className="form-check-input mt-0" type="radio" name="scope" checked={!all} onChange={() => setAll(false)} /> Chọn danh mục
        </label>
        {!all && <>
          <label className="small">Tìm danh mục
            <input type="search" className="form-control mt-1" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <AdminFeedback error={categoryError} loading={loading} retry={refresh} />
          <div className="d-grid gap-2 overflow-auto" style={{ maxHeight: '12rem' }}>
            {!loading && !categoryError && !categories.length && <p className="text-secondary small mb-0">Không có danh mục phù hợp.</p>}
            {categories.map(({ id, name }) => <label className="d-flex align-items-center gap-2 small" key={id}>
              <input type="checkbox" className="form-check-input mt-0" checked={selected.includes(id)}
                onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, id] : ids.filter((value) => value !== id))} />
              {name}
            </label>)}
          </div>
          <p className="small mb-0 text-secondary">{selected.length} danh mục đã chọn. Mã cũng áp dụng cho danh mục con.</p>
        </>}
      </fieldset>
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Hủy</button>
        <button type="submit" className="btn btn-gradient-purple" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo và thông báo'}</button>
      </div>
    </form>
  </AdminDialog>;
}

function RemovePromotion({ promotion, onClose, onSaved }: {
  promotion: Promotion; onClose: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await apiDelete('/admin/promotions/' + promotion.id);
      onSaved();
    } catch (cause) {
      setError(extractErrorMessage(cause, 'Chưa thể xóa khuyến mãi.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <AdminDialog title="Xóa khuyến mãi" onClose={() => { if (!pending.current) onClose(); }}>
    <p>Mã <strong>{promotion.code}</strong> sẽ hết hiệu lực đối với các đơn đặt sau khi xóa.</p>
    {error && <AdminFeedback error={error} />}
    <div className="d-flex justify-content-end gap-2">
      <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Hủy</button>
      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Đang xóa…' : 'Xóa mã'}</button>
    </div>
  </AdminDialog>;
}

export default function AdminPromotions() {
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Promotion | null>(null);
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  function refresh(message: string) {
    setNotice(message);
    setVersion((previous) => previous + 1);
  }
  return <>
    <AdminCollection<Promotion>
      title="Khuyến mãi" description="Tạo mã giảm giá theo danh mục và gửi thông báo đến người mua."
      endpoint="/admin/promotions" searchLabel="Tên khuyến mãi hoặc mã" version={version}
      beforeTable={() => notice && <p className="alert alert-success mb-0" role="status">{notice}</p>}
      filters={[{ key: 'status', label: 'Trạng thái', options: statuses }]} empty="Không có khuyến mãi phù hợp."
      actions={<button type="button" className="btn btn-gradient-purple btn-sm" onClick={() => setCreating(true)}>
        <Plus size={17} aria-hidden="true" /> Thêm khuyến mãi
      </button>}
      columns={[
        { heading: 'Khuyến mãi', render: (row) => <><strong>{row.name}</strong><div className="font-monospace admin-record-meta">{row.code}</div></> },
        { heading: 'Áp dụng', render: (row) => row.allCategories ? 'Tất cả mặt hàng' : row.categories.map(({ name }) => name).join(', ') || 'Danh mục đã xóa' },
        { heading: 'Mức giảm', className: 'fw-semibold text-nowrap', render: (row) => row.percent + '%' },
        { heading: 'Hạn sử dụng', className: 'text-nowrap', render: (row) => localDateTime(row.expiresAt) },
        { heading: 'Trạng thái', render: (row) => <RecordStatus label={statuses[row.status]} tone={row.status === 'ACTIVE' ? 'good' : 'neutral'} /> },
        { heading: 'Thao tác', className: 'text-end', render: (row) => <button type="button" className="btn btn-outline-danger btn-sm"
          aria-label={'Xóa ' + row.code} onClick={() => setRemoving(row)}><Trash2 size={15} aria-hidden="true" /> Xóa</button> },
      ]}
    />
    {creating && <PromotionEditor onClose={() => setCreating(false)} onSaved={(code) => {
      setCreating(false); refresh('Đã tạo và gửi thông báo mã ' + code + '.');
    }} />}
    {removing && <RemovePromotion promotion={removing} onClose={() => setRemoving(null)} onSaved={() => {
      refresh('Đã xóa mã ' + removing.code + '.'); setRemoving(null);
    }} />}
  </>;
}
