'use client';

import React, { useState, type FormEvent } from 'react';
import { useCurrentAdminUser } from '../../hooks/useCurrentAdminUser';
import { useAdminProducts, type AdminProductItem } from '../../hooks/useAdminProducts';
import { formatVnd, formatTime } from '../../shared/lib/format';
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Search,
  Package,
} from 'lucide-react';

export default function ManageProducts() {
  const { isAdmin } = useCurrentAdminUser();
  const {
    products,
    loading,
    error,
    setError,
    addProduct,
    updateProduct,
    toggleProductActive,
    deleteProduct,
  } = useAdminProducts();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [editingProduct, setEditingProduct] = useState<AdminProductItem | 'new' | null>(null);
  const [priceWarning, setPriceWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Lọc sản phẩm
  const filtered = products.filter(p => {
    const matchSearch =
      (p.name + p.sku).toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      selectedCategory === 'ALL' || p.categoryName === selectedCategory;
    return matchSearch && matchCategory;
  });

  const categories = Array.from(new Set(products.map(p => p.categoryName)));

  // Xử lý submit form thêm/sửa
  const handleSubmitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    const sku = String(form.get('sku') || '').trim();
    const name = String(form.get('name') || '').trim();
    const categoryName = String(form.get('categoryName') || '').trim();
    const costPrice = isAdmin ? Number(form.get('costPrice') || 0) : undefined;
    const basePrice = Number(form.get('basePrice') || 0);
    const discountPercent = Number(form.get('discountPercent') || 0);
    const imageUrl = String(form.get('imageUrl') || '').trim();
    const description = String(form.get('description') || '').trim();

    // Validation
    if (costPrice !== undefined && costPrice < 0) {
      setError('Giá nhập không được nhỏ hơn 0.');
      return;
    }
    if (basePrice < 0) {
      setError('Giá bán lẻ không được nhỏ hơn 0.');
      return;
    }
    if (discountPercent < 0 || discountPercent > 100) {
      setError('Giảm giá phải nằm trong khoảng 0 - 100%.');
      return;
    }

    if (costPrice !== undefined && basePrice < costPrice) {
      setPriceWarning('Lưu ý: Giá bán lẻ đang thấp hơn giá nhập.');
    } else {
      setPriceWarning(null);
    }

    if (editingProduct === 'new') {
      await addProduct({
        sku,
        name,
        slug: sku.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        categoryId: 'cat-default',
        categoryName,
        costPrice,
        basePrice,
        discountPercent,
        imageUrl: imageUrl || null,
        description: description || null,
        isActive: true,
      });
      setNotice('Đã thêm sản phẩm mới thành công.');
    } else if (editingProduct) {
      await updateProduct(editingProduct.id, {
        sku,
        name,
        categoryName,
        costPrice,
        basePrice,
        discountPercent,
        imageUrl: imageUrl || null,
        description: description || null,
      });
      setNotice('Đã cập nhật sản phẩm.');
    }

    setEditingProduct(null);
  };

  const handleDelete = async (p: AdminProductItem) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa sản phẩm ${p.name} (${p.sku})?`)) {
      return;
    }
    const res = await deleteProduct(p.id);
    if (res.success) {
      setNotice(`Đã xóa sản phẩm ${p.sku}.`);
    }
  };

  const current = editingProduct && typeof editingProduct === 'object' ? editingProduct : null;

  return (
    <div className="container-fluid p-0">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h4 fw-bold mb-1 text-dark">Quản lý sản phẩm</h1>
          <p className="text-secondary small mb-0">
            {isAdmin
              ? 'Toàn quyền thêm, chỉnh sửa, định giá gốc và ẩn/xóa sản phẩm.'
              : 'Quyền xem danh mục và thông tin sản phẩm (không hiển thị giá nhập).'}
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setEditingProduct('new');
              setPriceWarning(null);
              setError(null);
            }}
            className="btn btn-primary d-flex align-items-center gap-1.5 px-3 py-2"
            style={{ borderRadius: '8px', fontSize: '0.875rem' }}
          >
            <Plus size={16} />
            <span>Thêm sản phẩm</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="alert alert-success alert-dismissible fade show small d-flex align-items-center justify-content-between mb-3" role="status">
          <div className="d-flex align-items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{notice}</span>
          </div>
          <button type="button" className="btn-close" onClick={() => setNotice(null)} />
        </div>
      )}

      {error && (
        <div className="alert alert-danger alert-dismissible fade show small d-flex align-items-center justify-content-between mb-3" role="alert">
          <div className="d-flex align-items-center gap-2">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
          <button type="button" className="btn-close" onClick={() => setError(null)} />
        </div>
      )}

      {/* Form Thêm / Sửa (CHỈ ADMIN) */}
      {isAdmin && editingProduct && (
        <div className="card shadow-sm border-0 mb-4" style={{ borderRadius: '12px', border: '1px solid #ede9fe' }}>
          <div className="card-header bg-light py-3 border-bottom d-flex align-items-center justify-content-between">
            <h5 className="card-title h6 fw-bold mb-0 text-dark">
              {current ? `Sửa sản phẩm: ${current.sku}` : 'Thêm sản phẩm mới'}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={() => setEditingProduct(null)}
              aria-label="Đóng"
            />
          </div>

          <form onSubmit={handleSubmitForm} className="card-body p-4">
            {priceWarning && (
              <div className="alert alert-warning small d-flex align-items-center gap-2 mb-3">
                <AlertTriangle size={16} />
                <span>{priceWarning}</span>
              </div>
            )}

            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold text-secondary">Mã SKU</label>
                <input
                  name="sku"
                  type="text"
                  required
                  defaultValue={current?.sku ?? ''}
                  className="form-control form-control-sm"
                  placeholder="Ví dụ: MWH-IP15-128"
                />
              </div>

              <div className="col-12 col-md-5">
                <label className="form-label small fw-semibold text-secondary">Tên sản phẩm</label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={current?.name ?? ''}
                  className="form-control form-control-sm"
                  placeholder="Nhập tên sản phẩm đầy đủ"
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label small fw-semibold text-secondary">Danh mục</label>
                <select
                  name="categoryName"
                  required
                  defaultValue={current?.categoryName ?? categories[0] ?? 'Điện thoại & Tablet'}
                  className="form-select form-select-sm"
                >
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Giá nhập (CHỈ ADMIN THẤY) */}
              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold text-secondary">
                  Giá nhập (VNĐ) <span className="text-primary">· Chỉ Admin</span>
                </label>
                <input
                  name="costPrice"
                  type="number"
                  min="0"
                  step="1000"
                  required
                  defaultValue={current?.costPrice ?? 0}
                  className="form-control form-control-sm"
                  placeholder="Giá vốn"
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold text-secondary">Giá bán lẻ niêm yết (VNĐ)</label>
                <input
                  name="basePrice"
                  type="number"
                  min="0"
                  step="1000"
                  required
                  defaultValue={current?.basePrice ?? 0}
                  className="form-control form-control-sm"
                  placeholder="Giá bán lẻ"
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold text-secondary">Giảm giá (%)</label>
                <input
                  name="discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={current?.discountPercent ?? 0}
                  className="form-control form-control-sm"
                  placeholder="0 - 100"
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary">URL hình ảnh (tùy chọn)</label>
                <input
                  name="imageUrl"
                  type="url"
                  defaultValue={current?.imageUrl ?? ''}
                  className="form-control form-control-sm"
                  placeholder="https://..."
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary">Mô tả ngắn</label>
                <input
                  name="description"
                  type="text"
                  defaultValue={current?.description ?? ''}
                  className="form-control form-control-sm"
                  placeholder="Thông số, tính năng chính"
                />
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="btn btn-outline-secondary btn-sm px-3"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm px-4"
              >
                {current ? 'Lưu thay đổi' : 'Thêm mới'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bộ lọc tìm kiếm */}
      <div className="d-flex flex-wrap gap-2 mb-3">
        <div className="input-group input-group-sm" style={{ maxWidth: '300px' }}>
          <span className="input-group-text bg-white border-end-0">
            <Search size={14} className="text-secondary" />
          </span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc SKU…"
            className="form-control border-start-0"
            aria-label="Tìm sản phẩm"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="form-select form-select-sm"
          style={{ maxWidth: '200px' }}
          aria-label="Lọc theo danh mục"
        >
          <option value="ALL">Tất cả danh mục</option>
          {categories.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Bảng sản phẩm */}
      {loading ? (
        <p className="text-secondary small">Đang tải sản phẩm…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-5 text-center text-secondary small bg-white border">
          <Package size={32} className="mx-auto mb-2 text-muted" />
          Không tìm thấy sản phẩm nào phù hợp.
        </div>
      ) : (
        <div className="table-responsive bg-white rounded-3 border shadow-sm" style={{ borderColor: '#ede9fe' }}>
          <table className="table table-hover align-middle mb-0 text-sm">
            <thead style={{ backgroundColor: '#faf5ff' }}>
              <tr className="text-secondary small fw-semibold">
                <th className="px-3 py-2.5" style={{ width: '60px' }}>Ảnh</th>
                <th className="px-3 py-2.5">SKU / Tên sản phẩm</th>
                <th className="px-3 py-2.5">Danh mục</th>
                {isAdmin && <th className="px-3 py-2.5 text-end text-primary">Giá nhập</th>}
                <th className="px-3 py-2.5 text-end">Giá bán lẻ</th>
                <th className="px-3 py-2.5 text-center">Giảm giá</th>
                <th className="px-3 py-2.5 text-center">Trạng thái</th>
                <th className="px-3 py-2.5 text-secondary">Ngày tạo</th>
                {isAdmin && <th className="px-3 py-2.5 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl || 'https://via.placeholder.com/40'}
                      alt={p.name}
                      className="rounded object-fit-cover"
                      style={{ width: '40px', height: '40px' }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="fw-semibold text-dark">{p.name}</div>
                    <code className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {p.sku}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    <span className="badge bg-light text-secondary border small">
                      {p.categoryName}
                    </span>
                  </td>
                  {/* Cột giá nhập - CHỈ RENDER CHO ADMIN (T8) */}
                  {isAdmin && (
                    <td className="px-3 py-2 text-end fw-semibold text-primary">
                      {p.costPrice !== undefined && p.costPrice !== null
                        ? formatVnd(p.costPrice)
                        : '—'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-end fw-semibold text-dark">
                    {formatVnd(p.basePrice)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.discountPercent > 0 ? (
                      <span className="badge bg-danger-subtle text-danger small">
                        -{p.discountPercent}%
                      </span>
                    ) : (
                      <span className="text-muted small">0%</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.isActive ? (
                      <span className="badge bg-success-subtle text-success small">
                        Đang bán
                      </span>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary small">
                        Đã ẩn
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-secondary" style={{ fontSize: '0.8rem' }}>
                    {formatTime(p.createdAt)}
                  </td>
                  {/* Các nút thao tác - CHỈ RENDER CHO ADMIN (T8) */}
                  {isAdmin && (
                    <td className="px-3 py-2 text-center">
                      <div className="d-flex align-items-center justify-content-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleProductActive(p.id)}
                          className="btn btn-outline-secondary btn-sm p-1.5"
                          title={p.isActive ? 'Ẩn sản phẩm' : 'Hiện sản phẩm'}
                          style={{ borderRadius: '6px' }}
                        >
                          {p.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(p);
                            setPriceWarning(null);
                            setError(null);
                          }}
                          className="btn btn-outline-primary btn-sm p-1.5"
                          title="Sửa sản phẩm"
                          style={{ borderRadius: '6px' }}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p)}
                          className="btn btn-outline-danger btn-sm p-1.5"
                          title="Xóa sản phẩm"
                          style={{ borderRadius: '6px' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
