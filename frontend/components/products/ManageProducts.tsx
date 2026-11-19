'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
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
import {
  AdminDataTable,
  AdminDialog,
  AdminFeedback,
  AdminPageFrame,
  AdminPager,
  RecordStatus,
  RefreshButton,
} from '../admin/operations/AdminUi';
import ProductImage, { normalizeProductImageUrl } from './ProductImage';

const MONEY_PATTERN = '[0-9]{1,12}(\\.[0-9]{1,2})?';
const PERCENT_PATTERN = '([0-9]{1,2}(\\.[0-9]{1,2})?|100(\\.0{1,2})?)';

export default function ManageProducts() {
  const { isAdmin } = useCurrentAdminUser();
  const catalog = useAdminProducts();
  const [editing, setEditing] = useState<ManagedProduct | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const current = editing === 'new' ? null : editing;

  function startEditing(target: ManagedProduct | 'new') {
    setActionError('');
    setNotice('');
    setEditing(target);
    setImagePreview(target === 'new' ? '' : (target.imageUrl ?? ''));
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
    const imageInput = text('imageUrl');
    const imageUrl = normalizeProductImageUrl(imageInput);
    if (imageInput && !imageUrl) {
      setActionError(
        'Nhập đường dẫn ảnh bắt đầu bằng / hoặc URL ảnh HTTP(S) hợp lệ.',
      );
      return;
    }
    const fields: ProductFields = {
      sku: text('sku'),
      name: text('name'),
      basePrice: text('basePrice'),
      discountPercent: text('discountPercent') || '0',
      imageUrl,
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
    <AdminPageFrame
      title="Sản phẩm"
      description={
        isAdmin
          ? 'Quản lý danh mục, giá bán và hình ảnh hiển thị trên cửa hàng.'
          : 'Tra cứu danh mục và giá niêm yết của sản phẩm.'
      }
      actions={
        <>
          <RefreshButton
            onClick={catalog.refresh}
            disabled={catalog.loading || saving}
          />
          {isAdmin && (
            <button
              type="button"
              className="btn btn-gradient-purple btn-sm admin-workspace-button"
              disabled={saving}
              onClick={() => startEditing('new')}
            >
              <Plus size={16} aria-hidden="true" /> Thêm sản phẩm
            </button>
          )}
        </>
      }
    >
      {notice && (
        <div className="alert alert-success py-2 mb-0" role="status">
          {notice}
        </div>
      )}
      <AdminFeedback
        error={(!editing && actionError) || catalog.categoryError || undefined}
        retry={catalog.categoryError ? catalog.refresh : undefined}
      />

      {isAdmin && editing && (
        <AdminDialog
          key={current?.id ?? 'new'}
          title={current ? `Sửa sản phẩm ${current.sku}` : 'Thêm sản phẩm'}
          onClose={() => {
            if (!pending.current) {
              setEditing(null);
              setActionError('');
            }
          }}
        >
          <form onSubmit={saveProduct}>
            {actionError && (
              <div className="alert alert-danger py-2" role="alert">
                {actionError}
              </div>
            )}
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
                <div className="col-12">
                  <div className="d-flex align-items-center gap-3">
                    <div className="admin-catalog-image admin-catalog-image-preview">
                      <ProductImage
                        src={imagePreview}
                        alt="Xem trước ảnh sản phẩm"
                        fill
                      />
                    </div>
                    <div className="flex-grow-1">
                      <label htmlFor="product-image-url" className="form-label">
                        Đường dẫn ảnh
                      </label>
                      <input
                        id="product-image-url"
                        name="imageUrl"
                        className="form-control"
                        defaultValue={current?.imageUrl ?? ''}
                        placeholder="/products/iphone18duo.webp"
                        aria-describedby="product-image-help"
                        onBlur={(event) =>
                          setImagePreview(event.currentTarget.value)
                        }
                        maxLength={500}
                      />
                      <div id="product-image-help" className="form-text">
                        Dùng đường dẫn từ thư mục ảnh hoặc URL của ảnh. Ảnh xem
                        trước cập nhật khi rời ô.
                      </div>
                    </div>
                  </div>
                </div>
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
                <button
                  type="submit"
                  className="btn btn-gradient-purple admin-workspace-button"
                >
                  {saving ? 'Đang lưu…' : 'Lưu sản phẩm'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => {
                    setEditing(null);
                    setActionError('');
                  }}
                >
                  Hủy
                </button>
              </div>
            </fieldset>
          </form>
        </AdminDialog>
      )}

      <div className="admin-workspace-panel admin-workspace-filters">
        <label className="admin-workspace-search">
          <span>Tìm sản phẩm</span>
          <span className="position-relative d-block">
            <Search
              size={16}
              className="admin-workspace-search-icon"
              aria-hidden="true"
            />
            <input
              type="search"
              className="form-control"
              placeholder="Nhập tên hoặc SKU"
              maxLength={200}
              value={catalog.search}
              onChange={(event) => catalog.setSearch(event.target.value)}
            />
          </span>
        </label>
        <label>
          <span>Danh mục</span>
          <select
            className="form-select"
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
        </label>
      </div>

      <div className="admin-workspace-panel overflow-hidden">
        {catalog.loading || catalog.error ? (
          <AdminFeedback
            loading={catalog.loading}
            error={catalog.error}
            retry={catalog.refresh}
          />
        ) : (
          <>
            <AdminDataTable<ManagedProduct>
              rows={catalog.products}
              empty="Không có sản phẩm khớp bộ lọc."
              columns={[
                {
                  heading: 'Sản phẩm',
                  render: (product) => (
                    <div className="admin-catalog-product">
                      <div className="admin-catalog-image">
                        <ProductImage src={product.imageUrl} alt="" fill />
                      </div>
                      <div>
                        <div className="fw-semibold">{product.name}</div>
                        <div className="admin-record-meta text-nowrap">
                          {product.sku}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  heading: 'Danh mục',
                  render: (product) =>
                    product.category?.name ?? 'Chưa phân loại',
                },
                ...(isAdmin
                  ? [
                      {
                        heading: 'Giá vốn',
                        className: 'text-end text-nowrap admin-catalog-price',
                        render: (product: ManagedProduct) =>
                          product.costPrice == null
                            ? '—'
                            : formatVnd(Number(product.costPrice)),
                      },
                    ]
                  : []),
                {
                  heading: 'Giá niêm yết',
                  className:
                    'text-end text-nowrap fw-semibold admin-catalog-price',
                  render: (product) => formatVnd(Number(product.basePrice)),
                },
                {
                  heading: 'Trạng thái',
                  render: (product) => (
                    <RecordStatus
                      label={product.isActive ? 'Đang bán' : 'Ngừng bán'}
                      tone={product.isActive ? 'good' : 'neutral'}
                    />
                  ),
                },
                ...(isAdmin
                  ? [
                      {
                        heading: 'Thao tác',
                        render: (product: ManagedProduct) => (
                          <div className="d-flex gap-1 text-nowrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              disabled={saving}
                              aria-label={`Sửa ${product.name}`}
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
                              aria-label={`Xóa ${product.name}`}
                              onClick={() => removeProduct(product)}
                            >
                              Xóa
                            </button>
                          </div>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            <AdminPager
              total={catalog.total}
              page={catalog.page}
              totalPages={catalog.totalPages}
              onChange={catalog.setPage}
            />
          </>
        )}
      </div>
    </AdminPageFrame>
  );
}
