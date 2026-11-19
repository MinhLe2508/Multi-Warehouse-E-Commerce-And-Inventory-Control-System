'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import {
  AdminDataTable,
  AdminFeedback,
  AdminPageFrame,
  RecordStatus,
  RefreshButton,
} from '../../../components/admin/operations/AdminUi';
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  extractErrorMessage,
} from '../../../shared/lib/apiClient';
import type { Warehouse } from '../../../shared/types/admin';

interface ManagedWarehouse extends Warehouse {
  region: string;
  address: string | null;
  capacity: number | null;
  defaultLowStockThreshold: number;
  isActive: boolean;
}

const MAX_STOCK = 2_147_483_647;

export default function WarehousesPage() {
  const { refreshWarehouses } = useAdminCtx();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    items?: ManagedWarehouse[];
    error?: string;
  }>();
  const [editing, setEditing] = useState<ManagedWarehouse | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const current = editing === 'new' ? null : editing;
  const read = result?.revision === revision ? result : undefined;

  useEffect(() => {
    let active = true;
    void apiGet<ManagedWarehouse[]>('/warehouses?includeInactive=true').then(
      (items) => {
        if (active) setResult({ revision, items });
      },
      (failure: unknown) => {
        if (active)
          setResult({
            revision,
            error: extractErrorMessage(
              failure,
              'Không tải được danh sách kho.',
            ),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);

  function edit(row: ManagedWarehouse | 'new') {
    setError('');
    setNotice('');
    setEditing(row);
  }

  async function save(work: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await work();
      setEditing(null);
      setNotice(success);
      setRevision((current) => current + 1);
      refreshWarehouses();
    } catch (failure: unknown) {
      setError(
        extractErrorMessage(failure, 'Không lưu được thay đổi của kho.'),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const capacity = text('capacity');
    const payload = {
      name: text('name'),
      region: text('region'),
      address: text('address') || null,
      capacity: capacity ? Number(capacity) : null,
      defaultLowStockThreshold: Number(text('threshold')),
    };
    if (current) {
      void save(
        () => apiPut(`/warehouses/${current.id}`, payload),
        'Đã cập nhật kho.',
      );
    } else {
      void save(
        () => apiPost('/warehouses', { ...payload, code: text('code') }),
        'Đã tạo kho.',
      );
    }
  }

  function changeActive(row: ManagedWarehouse) {
    if (row.isActive) {
      if (!window.confirm(`Ngừng hoạt động kho ${row.code}?`)) return;
      void save(
        () => apiDelete(`/warehouses/${row.id}`),
        'Đã ngừng hoạt động kho.',
      );
    } else {
      void save(
        () => apiPut(`/warehouses/${row.id}`, { isActive: true }),
        'Đã kích hoạt lại kho.',
      );
    }
  }

  return (
    <AdminPageFrame
      title="Quản lý kho hàng"
      description="Quản lý địa chỉ, sức chứa và ngưỡng cảnh báo của từng kho."
      actions={
        <>
          <RefreshButton
            onClick={() => setRevision((value) => value + 1)}
            disabled={!read || saving}
          />
          <button
            className="btn btn-gradient-purple btn-sm admin-workspace-button"
            type="button"
            onClick={() => edit('new')}
            disabled={saving}
          >
            <Plus size={16} aria-hidden="true" /> Thêm kho
          </button>
        </>
      }
    >
      {notice && (
        <p className="alert alert-success py-2 mb-0" role="status">
          {notice}
        </p>
      )}
      <AdminFeedback
        error={error || read?.error}
        retry={
          read?.error ? () => setRevision((value) => value + 1) : undefined
        }
      />

      {editing && (
        <form
          key={current?.id ?? 'new'}
          className="admin-workspace-panel p-3"
          onSubmit={submit}
        >
          <h2 className="admin-panel-heading mb-3">
            {current ? `Sửa kho ${current.code}` : 'Thêm kho'}
          </h2>
          <fieldset disabled={saving}>
            <div className="row g-3">
              {!current && (
                <label className="col-12 col-md-4">
                  Mã kho
                  <input
                    name="code"
                    className="form-control"
                    maxLength={32}
                    required
                  />
                </label>
              )}
              <label className="col-12 col-md-8">
                Tên kho
                <input
                  name="name"
                  className="form-control"
                  defaultValue={current?.name}
                  maxLength={150}
                  required
                />
              </label>
              <label className="col-12 col-md-4">
                Khu vực
                <input
                  name="region"
                  className="form-control"
                  list="warehouse-regions"
                  defaultValue={current?.region}
                  maxLength={100}
                  required
                />
              </label>
              <datalist id="warehouse-regions">
                <option value="Miền Bắc" />
                <option value="Miền Trung" />
                <option value="Miền Nam" />
              </datalist>
              <label className="col-12 col-md-4">
                Sức chứa
                <input
                  type="number"
                  name="capacity"
                  className="form-control"
                  defaultValue={current?.capacity ?? ''}
                  placeholder="Không giới hạn"
                  min={1}
                  max={MAX_STOCK}
                  step={1}
                />
              </label>
              <label className="col-12 col-md-4">
                Ngưỡng cảnh báo
                <input
                  type="number"
                  name="threshold"
                  className="form-control"
                  defaultValue={current?.defaultLowStockThreshold ?? 10}
                  min={0}
                  max={MAX_STOCK}
                  step={1}
                  required
                />
              </label>
              <label className="col-12">
                Địa chỉ
                <input
                  name="address"
                  className="form-control"
                  defaultValue={current?.address ?? ''}
                  maxLength={500}
                />
              </label>
            </div>
            <div className="d-flex gap-2 mt-3">
              <button
                type="submit"
                className="btn btn-gradient-purple admin-workspace-button"
              >
                {saving ? 'Đang lưu…' : 'Lưu kho'}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setEditing(null)}
              >
                Hủy
              </button>
            </div>
          </fieldset>
        </form>
      )}

      {!read && <AdminFeedback loading />}
      {read?.items && (
        <div className="admin-workspace-panel overflow-hidden">
          <AdminDataTable
            rows={read.items}
            empty="Chưa có kho hàng."
            columns={[
              {
                heading: 'Kho',
                render: (row) => (
                  <>
                    <strong>{row.name}</strong>
                    <div className="admin-record-meta">
                      {row.code}
                      {row.address && ` · ${row.address}`}
                    </div>
                  </>
                ),
              },
              {
                heading: 'Khu vực',
                className: 'text-nowrap',
                render: (row) => row.region,
              },
              {
                heading: 'Sức chứa',
                className: 'text-end text-nowrap',
                render: (row) =>
                  row.capacity?.toLocaleString('vi-VN') ?? 'Không giới hạn',
              },
              {
                heading: 'Ngưỡng cảnh báo',
                className: 'text-end text-nowrap',
                render: (row) =>
                  row.defaultLowStockThreshold.toLocaleString('vi-VN'),
              },
              {
                heading: 'Trạng thái',
                render: (row) => (
                  <RecordStatus
                    label={row.isActive ? 'Đang hoạt động' : 'Đã ngừng'}
                    tone={row.isActive ? 'good' : 'neutral'}
                  />
                ),
              },
              {
                heading: 'Thao tác',
                render: (row) => (
                  <div className="d-flex gap-1 text-nowrap">
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => edit(row)}
                      disabled={saving}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => changeActive(row)}
                      disabled={saving}
                    >
                      {row.isActive ? 'Ngừng hoạt động' : 'Kích hoạt lại'}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </AdminPageFrame>
  );
}
