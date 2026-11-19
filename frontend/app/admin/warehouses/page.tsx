'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
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
    <div className="container-fluid p-0">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="h4 fw-bold mb-0">Quản lý kho hàng</h1>
        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-secondary btn-sm"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            disabled={!read || saving}
          >
            Làm mới
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => edit('new')}
            disabled={saving}
          >
            Thêm kho
          </button>
        </div>
      </div>
      {notice && (
        <p className="alert alert-success py-2" role="status">
          {notice}
        </p>
      )}
      {(error || read?.error) && (
        <p className="alert alert-danger py-2" role="alert">
          {error || read?.error}
        </p>
      )}

      {editing && (
        <form
          key={current?.id ?? 'new'}
          className="card card-body mb-3"
          onSubmit={submit}
        >
          <h2 className="h6 fw-bold">
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
              <button type="submit" className="btn btn-primary btn-sm">
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

      {!read && <p role="status">Đang tải danh sách kho…</p>}
      {read?.items && (
        <div className="card table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th scope="col">Kho</th>
                <th scope="col">Khu vực</th>
                <th scope="col">Sức chứa</th>
                <th scope="col">Ngưỡng cảnh báo</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {read.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.code}</strong>
                    <div>{row.name}</div>
                    {row.address && (
                      <small className="text-secondary">{row.address}</small>
                    )}
                  </td>
                  <td>{row.region}</td>
                  <td>
                    {row.capacity?.toLocaleString('vi-VN') ?? 'Không giới hạn'}
                  </td>
                  <td>
                    {row.defaultLowStockThreshold.toLocaleString('vi-VN')}
                  </td>
                  <td>{row.isActive ? 'Đang hoạt động' : 'Đã ngừng'}</td>
                  <td>
                    <div className="d-flex flex-wrap gap-1">
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
                  </td>
                </tr>
              ))}
              {!read.items.length && (
                <tr>
                  <td colSpan={6} className="text-center py-4">
                    Chưa có kho hàng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
