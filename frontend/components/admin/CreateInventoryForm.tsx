'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminCtx } from './AdminContext';
import {
  listManagedProducts,
  type ManagedProduct,
} from '../../shared/lib/adminProductsApi';
import { apiPost, extractErrorMessage } from '../../shared/lib/apiClient';

const MAX_STOCK = 2_147_483_647;

export function CreateInventoryForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { warehouses, warehouseId } = useAdminCtx();
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<ManagedProduct | null>(null);
  const [result, setResult] = useState<{
    search: string;
    items?: ManagedProduct[];
    error?: string;
  }>();
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const query = search.trim();
  const current = result?.search === query ? result : undefined;

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void listManagedProducts({ search: query, page: 1, pageSize: 20 }).then(
        (result) => {
          if (active) setResult({ search: query, items: result.items });
        },
        (failure: unknown) => {
          if (active) {
            setResult({
              search: query,
              error: extractErrorMessage(failure, 'Không tải được sản phẩm.'),
            });
          }
        },
      );
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || pending.current) return;
    const form = new FormData(event.currentTarget);
    const threshold = String(form.get('threshold') ?? '');
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await apiPost('/inventory', {
        productId: selection.id,
        warehouseId: String(form.get('warehouseId')),
        initialStock: Number(form.get('initialStock')),
        threshold: threshold ? Number(threshold) : null,
        note: String(form.get('note') ?? ''),
      });
      onCreated();
    } catch (failure: unknown) {
      setError(extractErrorMessage(failure, 'Không tạo được dòng tồn kho.'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="card card-body">
      <h2 className="h6 fw-bold">Thêm dòng tồn kho</h2>
      {error && (
        <p className="alert alert-danger py-2" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={saving}>
        <div className="row g-3">
          <label className="col-12 col-md-6">
            Tìm tên hoặc SKU
            <input
              className="form-control"
              value={search}
              maxLength={200}
              onChange={(event) => {
                setSelection(null);
                setSearch(event.target.value);
              }}
            />
          </label>
          <label className="col-12 col-md-6">
            Sản phẩm
            <select
              className="form-select"
              value={selection?.id ?? ''}
              required
              onChange={(event) => {
                setSelection(
                  current?.items?.find(({ id }) => id === event.target.value) ??
                    null,
                );
              }}
            >
              <option value="">
                {current ? 'Chọn sản phẩm' : 'Đang tải sản phẩm…'}
              </option>
              {current?.items?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </select>
            {current?.error && (
              <span role="alert" className="text-danger">
                {current.error}
              </span>
            )}
          </label>
          <label className="col-12 col-md-4">
            Kho đang hoạt động
            <select
              className="form-select"
              name="warehouseId"
              defaultValue={warehouseId === 'ALL' ? '' : warehouseId}
              required
            >
              <option value="">Chọn kho</option>
              {warehouses.map(({ id, code, name }) => (
                <option key={id} value={id}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-6 col-md-4">
            Tồn ban đầu
            <input
              type="number"
              name="initialStock"
              className="form-control"
              min={0}
              max={MAX_STOCK}
              step={1}
              defaultValue={0}
              required
            />
          </label>
          <label className="col-6 col-md-4">
            Ngưỡng cảnh báo
            <input
              type="number"
              name="threshold"
              className="form-control"
              min={0}
              max={MAX_STOCK}
              step={1}
              placeholder="Mặc định của kho"
            />
          </label>
          <label className="col-12">
            Ghi chú
            <input name="note" className="form-control" maxLength={500} />
          </label>
        </div>
        <div className="d-flex gap-2 mt-3">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!selection || !warehouses.length}
          >
            {saving ? 'Đang lưu…' : 'Tạo dòng tồn kho'}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={onCancel}
          >
            Hủy
          </button>
        </div>
      </fieldset>
    </form>
  );
}
