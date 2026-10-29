"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";
import { authRequest } from "@/shared/lib/authApi";
import type { Category } from "@/shared/types/product";

type ProductRow = { id: string; sku: string; name: string; slug: string; basePrice: string; costPrice?: string | null; discountPercent: string; categoryId: string | null; imageUrl: string | null; isActive: boolean; createdAt: string; category: { name: string } | null };
type ProductPage = { items: ProductRow[]; total: number; totalPages: number };
export default function ManageProducts() {
  const session = useAuthStore(s => s.session);
  const admin = session?.user.role === "ADMIN";
  const [data, setData] = useState<ProductPage>({ items: [], total: 0, totalPages: 0 });
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: String(page), pageSize: "12", search });
    authenticatedRequest<ProductPage>(`/admin/products?${query}`).then(result => {
      if (active) { setData(result); setError(""); }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Không tải được sản phẩm."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, revision]);
  useEffect(() => {
    if (!admin) return;
    let active = true;
    authRequest<{ id: string; name: string }[]>("/products/categories").then(result => { if (active) setCategories(result.map(c => ({ id: c.id, name: { vi: c.name, en: c.name }, icon: "📦" }))); })
      .catch(() => { if (active) setError("Không tải được danh mục. Hãy tải lại trước khi tạo sản phẩm."); });
    return () => { active = false; };
  }, [admin]);
  const refresh = () => { setLoading(true); setRevision(v => v + 1); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !admin) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || "").trim();
    const body = { sku: text("sku"), name: text("name"), slug: text("slug"), basePrice: text("basePrice"), costPrice: text("costPrice"), categoryId: text("categoryId"), discountPercent: text("discountPercent") || "0", isActive: form.get("isActive") === "on", ...(text("imageUrl") ? { imageUrl: text("imageUrl") } : {}) };
    try {
      const update = editing !== null && editing !== "new";
      await authenticatedRequest(`/admin/products${update ? `/${editing.id}` : ""}`, body, update ? "PATCH" : "POST");
      setEditing(null); setNotice("Đã lưu sản phẩm."); refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không lưu được sản phẩm."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function remove(product: ProductRow) {
    if (pending.current || !admin || !window.confirm(`Xóa sản phẩm ${product.sku}? Sản phẩm có đơn hàng, tồn kho hoặc lịch sử kho sẽ không được xóa.`)) return;
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try { await authenticatedRequest(`/admin/products/${product.id}`, undefined, "DELETE"); setNotice("Đã xóa sản phẩm."); refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không xóa được sản phẩm."); }
    finally { pending.current = false; setBusy(false); }
  }
  const current = editing && editing !== "new" ? editing : null;
  const field = (name: string, title: string, value: string, required = true) => <label className="col-md-6 form-label" key={name}>{title}<input className="form-control mt-1" name={name} defaultValue={value} required={required} /></label>;
  return <section className="container-fluid py-3">
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4"><div><h1 className="h3">Sản phẩm</h1><p className="text-secondary mb-0">{admin ? "Quản lý thông tin và trạng thái bán sản phẩm." : "Danh sách sản phẩm — quyền xem."}</p></div>{admin && <button className="btn btn-primary" onClick={() => setEditing("new")}>Thêm sản phẩm</button>}</div>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    {notice && <div role="status" className="alert alert-success">{notice}</div>}
    {admin && editing && <form onSubmit={save} className="card card-body mb-4" key={current?.id ?? "new"}>
      <h2 className="h5 mb-3">{current ? "Cập nhật sản phẩm" : "Sản phẩm mới"}</h2><div className="row g-3">
        {field("sku", "SKU", current?.sku ?? "")}{field("name", "Tên sản phẩm", current?.name ?? "")}
        {field("slug", "Đường dẫn (chữ thường không dấu, nối bằng dấu -)", current?.slug ?? "")}
        {field("costPrice", "Giá nhập", current?.costPrice ?? "")}{field("basePrice", "Giá bán lẻ", current?.basePrice ?? "")}
        {field("discountPercent", "Giảm giá (%)", current?.discountPercent ?? "0")}
        {field("imageUrl", "Đường dẫn ảnh (không bắt buộc)", current?.imageUrl ?? "", false)}
        <label className="col-md-6 form-label">Danh mục<select name="categoryId" className="form-select mt-1" required defaultValue={current?.categoryId ?? ""}><option value="">Chọn danh mục</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name.vi}</option>)}</select></label>
        <label className="col-12"><input type="checkbox" name="isActive" defaultChecked={current?.isActive ?? true} /> Đang bán</label>
      </div><div className="d-flex gap-2 mt-4"><button disabled={busy || !categories.length} className="btn btn-primary">{busy ? "Đang lưu…" : "Lưu"}</button><button type="button" disabled={busy} onClick={() => setEditing(null)} className="btn btn-outline-secondary">Hủy</button></div>
    </form>}
    <form className="d-flex gap-2 mb-3" onSubmit={event => { event.preventDefault(); setLoading(true); setPage(1); setSearch(String(new FormData(event.currentTarget).get("search") || "")); setRevision(v => v + 1); }}><input name="search" aria-label="Tìm sản phẩm theo tên hoặc SKU" className="form-control" placeholder="Tìm theo tên hoặc SKU" /><button className="btn btn-outline-primary">Tìm</button><button type="button" className="btn btn-outline-secondary" onClick={refresh}>Tải lại</button></form>
    {loading ? <p role="status">Đang tải…</p> : <div className="table-responsive"><table className="table align-middle"><thead><tr><th>SKU / tên</th><th>Danh mục</th>{admin && <th>Giá nhập</th>}<th>Giá bán lẻ</th><th>Ngày tạo</th><th>Trạng thái</th>{admin && <th>Thao tác</th>}</tr></thead><tbody>{data.items.map(p => <tr key={p.id}><td><strong>{p.name}</strong><div className="small text-secondary">{p.sku}</div></td><td>{p.category?.name ?? "—"}</td>{admin && <td>{p.costPrice == null ? "Chưa cập nhật" : Number(p.costPrice).toLocaleString("vi-VN")}</td>}<td>{Number(p.basePrice).toLocaleString("vi-VN")}</td><td>{new Date(p.createdAt).toLocaleDateString("vi-VN")}</td><td>{p.isActive ? "Đang bán" : "Ngừng bán"}</td>{admin && <td><button className="btn btn-sm btn-outline-primary me-2" disabled={busy} onClick={() => setEditing(p)}>Sửa</button><button className="btn btn-sm btn-outline-danger" disabled={busy} onClick={() => remove(p)}>Xóa</button></td>}</tr>)}</tbody></table>{!data.items.length && <p>Không có sản phẩm phù hợp.</p>}</div>}
    <div className="d-flex gap-3 align-items-center"><button className="btn btn-outline-secondary" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage(p => p - 1); }}>Trước</button><span>Trang {page} / {Math.max(1, data.totalPages)} · {data.total} sản phẩm</span><button className="btn btn-outline-secondary" disabled={loading || page >= data.totalPages} onClick={() => { setLoading(true); setPage(p => p + 1); }}>Sau</button></div>
  </section>;
}
