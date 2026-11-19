'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import {
  AdminDataTable,
  AdminFeedback,
  AdminPageFrame,
  RefreshButton,
  useAdminResource,
} from '../../../components/admin/operations/AdminUi';
import { apiPut, extractErrorMessage } from '../../../shared/lib/apiClient';
import type { Warehouse } from '../../../shared/types/admin';

type WarehouseSettings = Warehouse & { defaultLowStockThreshold: number };
const MAX_THRESHOLD = 2147483647;

function ThresholdSetting({ warehouse }: { warehouse: WarehouseSettings }) {
  const { refreshWarehouses } = useAdminCtx();
  const [saved, setSaved] = useState(warehouse.defaultLowStockThreshold);
  const [value, setValue] = useState(String(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const threshold = Number(value);
    if (
      !value ||
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > MAX_THRESHOLD
    ) {
      setError('Nhập số nguyên từ 0 đến 2.147.483.647.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiPut<WarehouseSettings>(
        `/warehouses/${warehouse.id}`,
        {
          defaultLowStockThreshold: threshold,
        },
      );
      setSaved(result.defaultLowStockThreshold);
      setValue(String(result.defaultLowStockThreshold));
      setNotice('Đã lưu.');
      refreshWarehouses();
    } catch (failure: unknown) {
      setError(extractErrorMessage(failure, 'Không lưu được ngưỡng cảnh báo.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      className="admin-threshold-form"
      onSubmit={(event) => void update(event)}
    >
      <div className="d-flex gap-2 align-items-center">
        <input
          type="number"
          className="form-control form-control-sm"
          aria-label={`Ngưỡng cảnh báo ${warehouse.code}`}
          min={0}
          max={MAX_THRESHOLD}
          step={1}
          required
          value={value}
          disabled={busy}
          onChange={(event) => {
            setValue(event.target.value);
            setNotice('');
          }}
        />
        <button
          className="btn btn-gradient-purple btn-sm text-nowrap"
          type="submit"
          disabled={busy || value === String(saved)}
        >
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
      {error && (
        <div className="text-danger small mt-1" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="text-success small mt-1" role="status">
          {notice}
        </div>
      )}
    </form>
  );
}

export default function AdminSettingsPage() {
  const warehouses = useAdminResource<WarehouseSettings[]>('/warehouses');
  return (
    <AdminPageFrame
      title="Cài đặt"
      description="Ngưỡng mặc định áp dụng cho các dòng tồn kho đang dùng ngưỡng của kho."
      actions={
        <>
          <Link
            className="btn btn-outline-purple btn-sm admin-workspace-button"
            href="/admin/warehouses"
          >
            Quản lý kho
          </Link>
          <RefreshButton
            onClick={warehouses.refresh}
            disabled={warehouses.loading}
          />
        </>
      }
    >
      <section className="admin-workspace-panel overflow-hidden">
        <h2 className="h6 p-3 mb-0">Ngưỡng cảnh báo theo kho</h2>
        {warehouses.data ? (
          <AdminDataTable
            rows={warehouses.data}
            empty="Chưa có kho đang hoạt động."
            columns={[
              {
                heading: 'Kho',
                render: (row) => (
                  <>
                    <strong>{row.name}</strong>
                    <div className="admin-record-meta">{row.code}</div>
                  </>
                ),
              },
              {
                heading: 'Ngưỡng mặc định',
                render: (row) => (
                  <ThresholdSetting
                    key={`${row.id}:${row.defaultLowStockThreshold}`}
                    warehouse={row}
                  />
                ),
              },
            ]}
          />
        ) : (
          <AdminFeedback
            error={warehouses.error}
            loading={warehouses.loading}
            retry={warehouses.refresh}
          />
        )}
      </section>
    </AdminPageFrame>
  );
}
