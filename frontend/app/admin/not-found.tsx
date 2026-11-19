import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <section
      className="admin-workspace-panel mx-auto p-4 p-md-5"
      style={{ maxWidth: '560px' }}
    >
      <h1 className="h4">Không tìm thấy trang</h1>
      <p className="text-secondary">
        Kiểm tra lại địa chỉ hoặc chọn một mục trong thanh điều hướng.
      </p>
      <Link href="/admin/dashboard" className="btn btn-gradient-purple btn-sm">
        Về Dashboard
      </Link>
    </section>
  );
}
