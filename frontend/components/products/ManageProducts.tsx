'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useAdminProducts } from '../../hooks/useAdminProducts';
import { useCurrentAdminUser } from '../../hooks/useCurrentAdminUser';
import {
  createManagedProduct,
  deleteManagedProduct,
  updateManagedProduct,
  type ManagedProduct,
  type ProductFields,
} from '../../shared/lib/adminProductsApi';
import { extractErrorMessage } from '../../shared/lib/apiClient';
import { formatVnd } from '../../shared/lib/format';

const MONEY_PATTERN = '[0-9]{1,12}(\\.[0-9]{1,2})?';
const PERCENT_PATTERN = '([0-9]{1,2}(\\.[0-9]{1,2})?|100(\\.0{1,2})?)';

export default function ManageProducts() {
  const { isAdmin } = useCurrentAdminUser();
  const catalog = useAdminProducts();
  const [editing, setEditing] = useState<ManagedProduct | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const current = editing === 'new' ? null : editing;

  function startEditing(target: ManagedProduct | 'new') {
    setActionError('');
    setNotice('');
    setEditing(target);
  }

  async function runMutation(work: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      await work();
      setEditing(null);
      setNotice(success);
      catalog.refresh();
    } catch (error: unknown) {
      setActionError(
        extractErrorMessage(error, 'Không lưu được thay đổi sản phẩm.'),
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const fields: ProductFields = {
      sku: text('sku'),
      name: text('name'),
      basePrice: text('basePrice'),
      discountPercent: text('discountPercent') || '0',
      imageUrl: text('imageUrl') || null,
      description: text('description') || null,
    };
    const costPrice = text('costPrice');
    const categoryId = text('categoryId');

    if (current) {
      void runMutation(
        () =>
          updateManagedProduct(current.id, {
            ...fields,
            ...(categoryId && categoryId !== current.categoryId
              ? { categoryId }
              : {}),
            ...(costPrice ? { costPrice } : {}),
          }),
        'Đã lưu sản phẩm.',
      );
    } else {
      const slug = fields.sku
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!slug || !categoryId) {
        setActionError('Nhập SKU có chữ hoặc số và chọn danh mục.');
        return;
      }
      void runMutation(
        () => createManagedProduct({ ...fields, slug, categoryId, costPrice }),
        'Đã thêm sản phẩm.',
      );
    }
  }

  function removeProduct(product: ManagedProduct) {
    if (!window.confirm(`Xóa sản phẩm ${product.sku}?`)) return;
    void runMutation(
      () => deleteManagedProduct(product.id),
      `Đã xóa ${product.sku}.`,
    );
  }

  return (
    <div className="container-fluid p-0">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h1 className="h4 fw-bold mb-0">Sản phẩm</h1>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={catalog.refresh}
            disabled={catalog.loading || saving}
          >
            <RefreshCw size={15} /> Làm mới
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={() => startEditing('new')}
            >
              <Plus size={15} /> Thêm sản phẩm
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="alert alert-success py-2" role="status">
          {notice}
        </div>
      )}
      {(catalog.error || catalog.categoryError || actionError) && (
        <div className="alert alert-danger py-2" role="alert">
          {actionError || catalog.error || catalog.categoryError}
        </div>
      )}

      {isAdmin && editing && (
        <form
          key={current?.id ?? 'new'}
          onSubmit={saveProduct}
          className="card card-body mb-3"
        >
          <h2 className="h6 fw-bold mb-3">
            {current ? `Sửa ${current.sku}` : 'Thêm sản phẩm'}
          </h2>
          <fieldset disabled={saving}>
            <div className="row g-3">
              <label className="col-12 col-md-4">
                SKU
                <input
                  name="sku"
                  className="form-control"
                  defaultValue={current?.sku}
                  pattern={String.raw`[A-Za-z0-9_\-]+`}
                  maxLength={64}
                  required
                />
              </label>
              <label className="col-12 col-md-8">
                Tên sản phẩm
                <input
                  name="name"
                  className="form-control"
                  defaultValue={current?.name}
                  maxLength={255}
                  required
                />
              </label>
              <label className="col-12 col-md-6">
                Danh mục
                <select
                  name="categoryId"
                  className="form-select"
                  defaultValue={current?.categoryId ?? ''}
                  required={!current}
                >
                  <option value="" disabled={Boolean(current?.categoryId)}>
                    Chọn danh mục
                  </option>
                  {current?.category &&
                    !catalog.categories.some(
                      ({ id }) => id === current.categoryId,
                    ) && (
                      <option value={current.category.id}>
                        {current.category.name} (hiện tại)
                      </option>
                    )}
                  {catalog.categories.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-12 col-md-6">
                Giảm giá (%)
                <input
                  name="discountPercent"
                  className="form-control"
                  inputMode="decimal"
                  pattern={PERCENT_PATTERN}
                  defaultValue={current?.discountPercent ?? '0'}
                />
              </label>
              <label className="col-12 col-md-6">
                Giá vốn (VND)
                <input
                  name="costPrice"
                  className="form-control"
                  inputMode="decimal"
                  pattern={MONEY_PATTERN}
                  defaultValue={current?.costPrice ?? ''}
                  required={!current}
                />
              </label>
              <label className="col-12 col-md-6">
                Giá bán (VND)
                <input
                  name="basePrice"
                  className="form-control"
                  inputMode="decimal"
                  pattern={MONEY_PATTERN}
                  defaultValue={current?.basePrice}
                  required
                />
              </label>
              <label className="col-12">
                Đường dẫn ảnh
                <input
                  name="imageUrl"
                  className="form-control"
                  defaultValue={current?.imageUrl ?? ''}
                  maxLength={500}
                />
              </label>
              <label className="col-12">
                Mô tả
                <textarea
                  name="description"
                  className="form-control"
                  defaultValue={current?.description ?? ''}
                  rows={3}
                  maxLength={5000}
                />
              </label>
            </div>
            <div className="d-flex gap-2 mt-3">
              <button type="submit" className="btn btn-primary btn-sm">
                {saving ? 'Đang lưu…' : 'Lưu sản phẩm'}
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

      <div className="d-flex flex-wrap gap-2 mb-3">
        <input
          className="form-control form-control-sm w-auto"
          aria-label="Tìm sản phẩm"
          placeholder="Tìm tên hoặc SKU"
          maxLength={200}
          value={catalog.search}
          onChange={(event) => catalog.setSearch(event.target.value)}
        />
        <select
          className="form-select form-select-sm w-auto"
          aria-label="Lọc danh mục"
          value={catalog.categoryId}
          onChange={(event) => catalog.setCategoryId(event.target.value)}
        >
          <option value="">Tất cả danh mục</option>
          {catalog.categories.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {catalog.loading ? (
        <p role="status">Đang tải sản phẩm…</p>
      ) : (
        !catalog.error && (
          <div className="card">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Tên</th>
                    <th scope="col">Danh mục</th>
                    {isAdmin && <th scope="col">Giá vốn</th>}
                    <th scope="col">Giá bán</th>
                    <th scope="col">Trạng thái</th>
                    {isAdmin && <th scope="col">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {catalog.products.map((product) => (
                    <tr key={product.id}>
                      <td>{product.sku}</td>
                      <td>{product.name}</td>
                      <td>{product.category?.name ?? 'Chưa phân loại'}</td>
                      {isAdmin && (
                        <td>
                          {product.costPrice == null
                            ? '—'
                            : formatVnd(Number(product.costPrice))}
                        </td>
                      )}
                      <td>{formatVnd(Number(product.basePrice))}</td>
                      <td>{product.isActive ? 'Đang bán' : 'Ngừng bán'}</td>
                      {isAdmin && (
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={saving}
                              onClick={() => startEditing(product)}
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={saving}
                              onClick={() =>
                                void runMutation(
                                  () =>
                                    updateManagedProduct(product.id, {
                                      isActive: !product.isActive,
                                    }),
                                  'Đã lưu trạng thái sản phẩm.',
                                )
                              }
                            >
                              {product.isActive ? 'Ngừng bán' : 'Mở bán'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              disabled={saving}
                              onClick={() => removeProduct(product)}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {!catalog.products.length && (
                    <tr>
                      <td
                        colSpan={isAdmin ? 7 : 5}
                        className="text-center py-4"
                      >
                        Không có sản phẩm khớp bộ lọc.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <nav
              aria-label="Phân trang sản phẩm"
              className="p-3 d-flex flex-wrap gap-2 align-items-center justify-content-between"
            >
              <span className="small text-secondary">
                {catalog.total} sản phẩm · Trang {catalog.page}/
                {catalog.totalPages}
              </span>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={catalog.page <= 1}
                  onClick={() => catalog.setPage(catalog.page - 1)}
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  disabled={catalog.page >= catalog.totalPages}
                  onClick={() => catalog.setPage(catalog.page + 1)}
                >
                  Trang sau
                </button>
              </div>
            </nav>
          </div>
        )
      )}
    </div>
  );
}
