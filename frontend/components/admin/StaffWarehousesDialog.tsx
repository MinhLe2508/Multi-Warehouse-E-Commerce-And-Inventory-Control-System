'use client';

import { useRef, useState } from 'react';
import { apiPut, extractErrorMessage } from '@/shared/lib/apiClient';
import { AdminDialog, AdminFeedback, useAdminResource } from './operations/AdminUi';
import type { Warehouse } from '@/shared/types/admin';

export function StaffWarehousesDialog({ id, name, onClose }: {
  id: string; name: string; onClose: () => void;
}) {
  const path = `/admin/staff/${id}/warehouses`;
  const current = useAdminResource<{ warehouseIds: string[] }>(path);
  const warehouses = useAdminResource<Warehouse[]>('/warehouses');
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const assigned = new Set(current.data?.warehouseIds ?? []);
  const selected = (warehouseId: string) => changes[warehouseId] ?? assigned.has(warehouseId);
  const loading = current.loading || warehouses.loading;

  async function save() {
    if (!current.data || !warehouses.data || inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError(''); setSaved(false);
    try {
      await apiPut(path, { warehouseIds: warehouses.data.filter(({ id }) => selected(id)).map(({ id }) => id) });
      setSaved(true);
      current.refresh();
    } catch (cause) {
      setError(extractErrorMessage(cause, 'Không lưu được phân công kho.'));
    } finally {
      inFlight.current = false; setPending(false);
    }
  }

  return <AdminDialog title={`Phân kho · ${name}`} onClose={() => !inFlight.current && onClose()}>
    <AdminFeedback error={current.error ?? warehouses.error ?? error} loading={loading}
      retry={() => { setError(''); current.refresh(); warehouses.refresh(); }} />
    {saved && <p className="alert alert-success py-2 mt-2" role="status">Đã lưu phân công kho.</p>}
    {current.data && warehouses.data && <>
      <p className="text-secondary small mb-2">Chọn các kho nhân viên được xem và thực hiện nghiệp vụ.</p>
      <fieldset className="d-grid gap-2 my-3" disabled={pending}>
        <legend className="visually-hidden">Kho được giao</legend>
        {warehouses.data.map((warehouse) => <label className="form-check" key={warehouse.id}>
          <input className="form-check-input" type="checkbox" checked={selected(warehouse.id)} onChange={(event) => {
            const checked = event.target.checked;
            setChanges((previous) => ({ ...previous, [warehouse.id]: checked }));
            setSaved(false);
          }} /> <span className="form-check-label">{warehouse.code} · {warehouse.name}</span>
        </label>)}
      </fieldset>
      <button type="button" className="btn btn-primary btn-sm" disabled={pending || !Object.keys(changes).length || saved}
        onClick={() => void save()}>{pending ? 'Đang lưu…' : 'Lưu phân công'}</button>
    </>}
  </AdminDialog>;
}
