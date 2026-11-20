'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { PackagePlus } from 'lucide-react';
import { useAdminCtx } from '@/components/admin/AdminContext';
import { useAdminResource } from '@/components/admin/operations/AdminUi';
import { useCurrentAdminUser } from '@/hooks/useCurrentAdminUser';
import { apiPost } from '@/shared/lib/apiClient';
import { type Item, type List, count, dateTime, query, warehouseParam } from './data';
import { AdminFeedback, Dialog, Field, Filters, PageTitle } from './PortalUi';
import { StockItemLabel, StockNumbers } from './Inventory';
import { useLinkedWarehouse, useStaffProfile } from './StaffShell';

type Draft = { id: string; item: Item; quantity: number; note: string };
const resultLimit = 8;

function receiptId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function RestockForm({ initialInventoryId }: { initialInventoryId?: string }) {
  const { warehouseId, warehouses } = useAdminCtx();
  const { user } = useCurrentAdminUser();
  const profile = useStaffProfile();
  const actorName = profile?.fullName ?? user.name;
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [inventoryId, setInventoryId] = useState(initialInventoryId ?? '');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const lastDraft = useRef<Draft | null>(null);
  const [notice, setNotice] = useState('');
  const list = useAdminResource<List<Item>>(query('/inventory', {
    warehouseId: warehouseParam(warehouseId), search, limit: resultLimit, offset,
  }));
  const item = useAdminResource<Item>(inventoryId ? `/inventory/${encodeURIComponent(inventoryId)}` : null);
  const selected = item.data;
  const canUse = selected && (warehouseId === 'ALL' || selected.warehouseId === warehouseId);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const units = Number(quantity);
    if (!canUse || !Number.isInteger(units) || units < 1 || units > 2_147_483_647) return;
    setNotice('');
    const saved = lastDraft.current;
    const remark = note.trim();
    const id = saved?.item.id === selected.id && saved.quantity === units && saved.note === remark
      ? saved.id : receiptId();
    const review = { id, item: selected, quantity: units, note: remark };
    lastDraft.current = review;
    setDraft(review);
  }

  return <>
    <PageTitle title="Nhập kho" description="Chọn dòng tồn kho cần bổ sung và kiểm tra số lượng trước khi lưu."
      actions={<Link className="staff-button" href="/staff/inventory/audit-logs">Lịch sử thao tác</Link>} />
    {profile?.warehouses.length === 0 && !warehouses.length &&
      <p className="staff-notice">Liên hệ quản trị viên để được giao kho nhập hàng.</p>}
    {notice && <p className="staff-notice success" role="status">{notice}</p>}
    <div className="staff-grid-two">
      <section className="staff-panel padded">
        <div className="staff-section-title"><h2>Chọn sản phẩm và kho</h2></div>
        <Filters onApply={(form) => { setSearch(String(form.get('search') ?? '').trim()); setOffset(0); }}>
          <Field label="Tìm sản phẩm"><input type="search" name="search" placeholder="Tên hoặc mã SKU" maxLength={160} /></Field>
        </Filters>
        <AdminFeedback loading={list.loading} error={list.error ?? undefined} retry={list.refresh}
          empty={!list.data?.items.length ? 'Không có dòng tồn kho phù hợp.' : undefined} />
        {list.data && <ul className="staff-list mt-2">
          {list.data.items.map((row) => <li key={row.id}>
            <button className="staff-restock-option" type="button" aria-pressed={inventoryId === row.id} onClick={() => {
              setInventoryId(row.id); setNotice(''); setQuantity(''); setNote('');
            }}>
              <StockItemLabel item={row} />
              <span className="d-block staff-muted mt-1">{row.warehouse.code} · {row.warehouse.name} · Khả dụng {count(row.availableStock)}</span>
            </button>
          </li>)}
        </ul>}
        {list.data && list.data.total > resultLimit && <div className="staff-actions mt-3">
          <button className="staff-button" type="button" disabled={offset === 0} onClick={() => setOffset(offset - resultLimit)}>Trước</button>
          <span>{Math.floor(offset / resultLimit) + 1}/{Math.ceil(list.data.total / resultLimit)}</span>
          <button className="staff-button" type="button" disabled={offset + resultLimit >= list.data.total} onClick={() => setOffset(offset + resultLimit)}>Sau</button>
        </div>}
      </section>
      <section className="staff-panel padded">
        <div className="staff-section-title"><h2>Thông tin nhập hàng</h2></div>
        <AdminFeedback loading={item.loading} error={item.error ?? undefined} retry={item.refresh}
          empty={!inventoryId ? 'Chọn một dòng tồn kho để bắt đầu nhập.' : undefined} />
        {selected && !canUse && <p className="staff-notice">Chọn đúng kho trong bộ chọn phía trên hoặc chọn lại dòng tồn kho.</p>}
        {canUse && <>
          <StockItemLabel item={selected} />
          <StockNumbers item={selected} />
          <form className="staff-form mt-3" onSubmit={review}>
            <Field label="Số lượng nhập"><input type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} min={1} max={2147483647} step={1} required /></Field>
            <Field label="Ghi chú"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Mã phiếu nhập hoặc ghi chú" /></Field>
            <div className="staff-muted">Người thực hiện {actorName}<br />Thời gian ghi theo lúc xác nhận trên hệ thống.</div>
            <div><button className="staff-button primary" type="submit"><PackagePlus size={16} /> Xem lại phiếu nhập</button></div>
          </form>
        </>}
      </section>
    </div>
    {draft && <Dialog title="Xác nhận nhập kho" confirmText="Xác nhận nhập" onClose={() => setDraft(null)}
      onConfirm={() => apiPost<Item>(`/inventory/${draft.item.id}/restock`, {
        quantity: draft.quantity, requestId: draft.id, note: draft.note || undefined,
      })}
      success={() => {
        lastDraft.current = null;
        setNotice(`Đã nhập ${count(draft.quantity)} sản phẩm ${draft.item.product.sku} vào ${draft.item.warehouse.code}.`);
        setQuantity(''); setNote(''); list.refresh(); item.refresh();
      }}>
      <StockItemLabel item={draft.item} />
      <dl className="staff-details">
        <dt>Kho nhận</dt><dd>{draft.item.warehouse.name} · {draft.item.warehouse.code}</dd>
        <dt>Số lượng nhập</dt><dd><strong>+{count(draft.quantity)}</strong></dd>
        <dt>Người thực hiện</dt><dd>{actorName}</dd>
        <dt>Thời điểm xem lại</dt><dd>{dateTime(new Date().toISOString())}</dd>
        <dt>Ghi chú</dt><dd>{draft.note || '—'}</dd>
      </dl>
    </Dialog>}
  </>;
}

export function StaffRestock({ initialInventoryId, warehouse }: { initialInventoryId?: string; warehouse?: string }) {
  const warehouseId = useLinkedWarehouse(warehouse);
  return <RestockForm key={JSON.stringify([warehouseId, initialInventoryId])} initialInventoryId={initialInventoryId} />;
}
