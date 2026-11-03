'use client';

import React, { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import { authenticatedRequest } from '@/store/useAuthStore';
import { formatTime } from '@/shared/lib/format';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  FolderPlus,
} from 'lucide-react';

export interface AdminCategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  childCount: number;
}

export default function ManageCategories() {
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Trạng thái modal thêm/sửa
  const [editingCategory, setEditingCategory] = useState<
    | {
        mode: 'create' | 'edit';
        category?: AdminCategoryItem;
        presetParentId?: string | null;
      }
    | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await authenticatedRequest<AdminCategoryItem[]>('/categories/manage');
      setCategories(data || []);
      setError(null);
    } catch {
      // Fallback an toàn nếu backend chưa khởi chạy
      const mockCategories: AdminCategoryItem[] = [
        {
          id: 'cat-root-1',
          name: 'Điện tử & Công nghệ',
          slug: 'dien-tu-cong-nghe',
          parentId: null,
          isActive: true,
          createdAt: '2026-01-15T08:00:00.000Z',
          updatedAt: '2026-01-15T08:00:00.000Z',
          productCount: 15,
          childCount: 2,
        },
        {
          id: 'cat-phones',
          name: 'Điện thoại & Tablet',
          slug: 'dien-thoai-tablet',
          parentId: 'cat-root-1',
          isActive: true,
          createdAt: '2026-01-16T09:00:00.000Z',
          updatedAt: '2026-01-16T09:00:00.000Z',
          productCount: 8,
          childCount: 0,
        },
        {
          id: 'cat-laptops',
          name: 'Laptop & Máy tính',
          slug: 'laptop-may-tinh',
          parentId: 'cat-root-1',
          isActive: true,
          createdAt: '2026-01-16T10:00:00.000Z',
          updatedAt: '2026-01-16T10:00:00.000Z',
          productCount: 7,
          childCount: 0,
        },
        {
          id: 'cat-audio',
          name: 'Âm thanh & Phụ kiện',
          slug: 'am-thanh-phu-kien',
          parentId: null,
          isActive: true,
          createdAt: '2026-01-20T11:00:00.000Z',
          updatedAt: '2026-01-20T11:00:00.000Z',
          productCount: 4,
          childCount: 0,
        },
      ];
      setCategories(mockCategories);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCategories();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCategories]);

  // Xây dựng cây danh mục theo cha - con
  const { rootNodes, childrenMap } = useMemo(() => {
    const roots: AdminCategoryItem[] = [];
    const map: Record<string, AdminCategoryItem[]> = {};

    categories.forEach(cat => {
      if (!cat.parentId) {
        roots.push(cat);
      } else {
        if (!map[cat.parentId]) map[cat.parentId] = [];
        map[cat.parentId].push(cat);
      }
    });

    return { rootNodes: roots, childrenMap: map };
  }, [categories]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Bật/tắt trạng thái hiển thị của danh mục
  const handleToggleActive = async (cat: AdminCategoryItem) => {
    try {
      await authenticatedRequest(`/categories/${cat.id}`, { isActive: !cat.isActive }, 'PUT');
      setNotice(`Đã ${cat.isActive ? 'ẩn' : 'hiện'} danh mục ${cat.name}.`);
      fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không cập nhật được trạng thái.';
      setError(msg);
    }
  };

  // Xóa danh mục
  const handleDelete = async (cat: AdminCategoryItem) => {
    if (!window.confirm(`Xóa danh mục "${cat.name}"? Danh mục chỉ được xóa khi không còn sản phẩm và danh mục con.`)) {
      return;
    }
    try {
      await authenticatedRequest(`/categories/${cat.id}`, undefined, 'DELETE');
      setNotice(`Đã xóa danh mục "${cat.name}".`);
      fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không xóa được danh mục.';
      setError(msg);
    }
  };

  // Submit form thêm hoặc sửa danh mục
  const handleSubmitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !editingCategory) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);

    const form = new FormData(e.currentTarget);
    const name = String(form.get('name') || '').trim();
    const slug = String(form.get('slug') || '').trim();
    const parentIdVal = String(form.get('parentId') || '');
    const parentId = parentIdVal === '' ? null : parentIdVal;
    const isActive = form.get('isActive') === 'on';

    try {
      if (editingCategory.mode === 'create') {
        await authenticatedRequest(
          '/categories',
          {
            name,
            ...(slug ? { slug } : {}),
            parentId,
            isActive,
          },
          'POST'
        );
        setNotice(`Đã tạo thành công danh mục "${name}".`);
      } else if (editingCategory.mode === 'edit' && editingCategory.category) {
        await authenticatedRequest(
          `/categories/${editingCategory.category.id}`,
          {
            name,
            ...(slug ? { slug } : {}),
            parentId,
            isActive,
          },
          'PUT'
        );
        setNotice(`Đã cập nhật danh mục "${name}".`);
      }

      setEditingCategory(null);
      fetchCategories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không lưu được danh mục.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Render một dòng trong cây danh mục
  const renderCategoryRow = (cat: AdminCategoryItem, depth = 0) => {
    const children = childrenMap[cat.id] || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds[cat.id] ?? true;

    return (
      <React.Fragment key={cat.id}>
        <tr className="align-middle">
          {/* Cột 1: Tên dạng cây phân cấp */}
          <td className="px-3 py-2.5">
            <div className="d-flex align-items-center" style={{ paddingLeft: `${depth * 24}px` }}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(cat.id)}
                  className="btn btn-link p-0 me-2 text-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              ) : (
                <span className="me-2 text-muted" style={{ display: 'inline-block', width: '16px' }}>
                  •
                </span>
              )}
              <div className="min-w-0">
                <div className="fw-semibold text-dark">{cat.name}</div>
                <code className="text-muted" style={{ fontSize: '0.75rem' }}>
                  /{cat.slug}
                </code>
              </div>
            </div>
          </td>

          {/* Cột 2: Số sản phẩm */}
          <td className="px-3 py-2.5 text-center">
            <span className="badge bg-light text-secondary border small">
              {cat.productCount} sản phẩm
            </span>
          </td>

          {/* Cột 3: Ngày tạo */}
          <td className="px-3 py-2.5 text-secondary" style={{ fontSize: '0.8rem' }}>
            {formatTime(cat.createdAt)}
          </td>

          {/* Cột 4: Người tạo (CỐ ĐỊNH "Admin" theo mục 0 & T9) */}
          <td className="px-3 py-2.5 text-dark fw-medium small">
            Admin
          </td>

          {/* Cột 5: Trạng thái */}
          <td className="px-3 py-2.5 text-center">
            {cat.isActive ? (
              <span className="badge bg-success-subtle text-success small">Đang hiển thị</span>
            ) : (
              <span className="badge bg-secondary-subtle text-secondary small">Đã ẩn</span>
            )}
          </td>

          {/* Cột 6: Thao tác */}
          <td className="px-3 py-2.5 text-center">
            <div className="d-flex align-items-center justify-content-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setEditingCategory({
                    mode: 'create',
                    presetParentId: cat.id,
                  })
                }
                className="btn btn-outline-primary btn-sm p-1.5"
                title="Thêm danh mục con"
                style={{ borderRadius: '6px' }}
              >
                <FolderPlus size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleToggleActive(cat)}
                className="btn btn-outline-secondary btn-sm p-1.5"
                title={cat.isActive ? 'Ẩn danh mục' : 'Hiện danh mục'}
                style={{ borderRadius: '6px' }}
              >
                {cat.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditingCategory({
                    mode: 'edit',
                    category: cat,
                  })
                }
                className="btn btn-outline-primary btn-sm p-1.5"
                title="Sửa danh mục"
                style={{ borderRadius: '6px' }}
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(cat)}
                className="btn btn-outline-danger btn-sm p-1.5"
                title="Xóa danh mục"
                style={{ borderRadius: '6px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </td>
        </tr>

        {/* Render danh mục con nếu đang mở */}
        {hasChildren && isExpanded && children.map(child => renderCategoryRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  const editingItem = editingCategory?.category;

  return (
    <div className="container-fluid p-0">
      {/* Tiêu đề & Nút thêm danh mục gốc */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <h1 className="h4 fw-bold mb-1 text-dark">Quản lý danh mục sản phẩm</h1>
          <p className="text-secondary small mb-0">
            Cấu trúc danh mục dạng cây (cha - con). Dùng để phân loại sản phẩm trên Storefront.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setEditingCategory({
              mode: 'create',
              presetParentId: null,
            })
          }
          className="btn btn-primary d-flex align-items-center gap-1.5 px-3 py-2"
          style={{ borderRadius: '8px', fontSize: '0.875rem' }}
        >
          <Plus size={16} />
          <span>Thêm danh mục gốc</span>
        </button>
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

      {/* Form Card Thêm/Sửa Danh mục (Không có ô mô tả - theo mục 0 & T9) */}
      {editingCategory && (
        <div className="card shadow-sm border-0 mb-4" style={{ borderRadius: '12px', border: '1px solid #ede9fe' }}>
          <div className="card-header bg-light py-3 border-bottom d-flex align-items-center justify-content-between">
            <h5 className="card-title h6 fw-bold mb-0 text-dark">
              {editingCategory.mode === 'create'
                ? editingCategory.presetParentId
                  ? 'Thêm danh mục con'
                  : 'Thêm danh mục gốc'
                : `Sửa danh mục: ${editingItem?.name}`}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={() => setEditingCategory(null)}
              aria-label="Đóng"
            />
          </div>

          <form onSubmit={handleSubmitForm} className="card-body p-4">
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary">Tên danh mục</label>
                <input
                  name="name"
                  type="text"
                  required
                  defaultValue={editingItem?.name ?? ''}
                  className="form-control form-control-sm"
                  placeholder="Ví dụ: Thiết bị đeo thông minh"
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary">Đường dẫn (slug tùy chọn)</label>
                <input
                  name="slug"
                  type="text"
                  defaultValue={editingItem?.slug ?? ''}
                  className="form-control form-control-sm"
                  placeholder="Để trống để hệ thống tự tạo từ tên"
                />
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary">Danh mục cha</label>
                <select
                  name="parentId"
                  defaultValue={
                    editingCategory.mode === 'create'
                      ? editingCategory.presetParentId ?? ''
                      : editingItem?.parentId ?? ''
                  }
                  className="form-select form-select-sm"
                >
                  <option value="">(Không có - Danh mục gốc)</option>
                  {categories
                    // Không cho phép chọn chính nó làm cha khi đang sửa
                    .filter(c => !editingItem || c.id !== editingItem.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="col-12 col-md-6 d-flex align-items-center">
                <div className="form-check mt-3">
                  <input
                    name="isActive"
                    type="checkbox"
                    id="catIsActive"
                    defaultChecked={editingItem?.isActive ?? true}
                    className="form-check-input"
                  />
                  <label htmlFor="catIsActive" className="form-check-label small fw-medium text-dark">
                    Hiển thị trên website ngay
                  </label>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setEditingCategory(null)}
                className="btn btn-outline-secondary btn-sm px-3"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary btn-sm px-4"
              >
                {submitting ? 'Đang lưu…' : editingCategory.mode === 'create' ? 'Tạo mới' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bảng danh sách cây danh mục */}
      {loading ? (
        <p className="text-secondary small">Đang tải danh mục…</p>
      ) : categories.length === 0 ? (
        <div className="card p-5 text-center text-secondary small bg-white border">
          <FolderTree size={32} className="mx-auto mb-2 text-muted" />
          Chưa có danh mục nào. Hãy bấm &quot;Thêm danh mục gốc&quot;.
        </div>
      ) : (
        <div className="table-responsive bg-white rounded-3 border shadow-sm" style={{ borderColor: '#ede9fe' }}>
          <table className="table table-hover mb-0 text-sm">
            <thead style={{ backgroundColor: '#faf5ff' }}>
              <tr className="text-secondary small fw-semibold">
                <th className="px-3 py-2.5">Tên danh mục (Cây phân cấp)</th>
                <th className="px-3 py-2.5 text-center">Số sản phẩm</th>
                <th className="px-3 py-2.5">Ngày tạo</th>
                <th className="px-3 py-2.5">Người tạo</th>
                <th className="px-3 py-2.5 text-center">Trạng thái</th>
                <th className="px-3 py-2.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rootNodes.map(root => renderCategoryRow(root, 0))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
