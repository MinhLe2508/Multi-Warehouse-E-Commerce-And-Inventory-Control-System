# HƯỚNG DẪN CHẠY & KIỂM THỬ GIAO DIỆN ADMIN & STAFF (TUẦN 2) — BOOTSTRAP 5.3

Tài liệu hướng dẫn vận hành, kiểm thử các tính năng và cấu trúc layout Quản trị mới được xây dựng bằng **Bootstrap 5.3 + react-bootstrap**, tuân thủ nghiêm ngặt các yêu cầu SRS (FR-AUTH-02, NFR-02.2, NFR-05.2, NFR-06.3) và AGENT BRIEF mục 5.6 & 5.7.

---

## 1. TỔNG QUAN CÁC KHU VỰC VÀ TÍNH NĂNG ĐÃ TRIỂN KHAI

### 1.1 Trang Đăng nhập giả lập Dev-Login (`/admin/dev-login`) — Khớp Ảnh 1
- Giao diện chuẩn xác theo thiết kế: Tiêu đề `MWH — Đăng nhập` màu `#0f766e`, form Email/Mật khẩu.
- 2 Nút thử nghiệm nhanh:
  - **Thử tài khoản Admin**: Ghi tài khoản Quản trị viên và tự động chuyển về `/admin/dashboard`.
  - **Thử tài khoản nhân viên**: Ghi tài khoản Nguyễn Minh Anh (Staff) và tự động chuyển về `/staff/dashboard`.

### 1.2 Khu vực Quản trị viên (`/admin/**`) — Khớp Ảnh 2
- **Logo**: `MWH Admin` (màu `#0f766e`, bold).
- **Header**: Tiêu đề trang bên trái (`Dashboard`), nhãn `Trang quản trị (Admin)` bên phải.
- **Menu**:
  - `Dashboard` (active)
  - Nhóm `Kinh doanh` ▶ (`Đơn hàng`, `Thanh toán`)
  - Nhóm `Kho & tồn kho` ▶ (`Quản lý kho hàng`, `Tồn kho`, `Giữ hàng`, `Cảnh báo tồn kho`, `Lịch sử biến động`)
  - Nhóm `Sản phẩm` ▶ (`Sản phẩm`, `Danh mục`)
  - Nhóm `Hỗ trợ AI` ▶ (`Phiên hội thoại`, `Kho tri thức RAG`)
  - Nhóm `Tài khoản & nhân sự` ▶ (`Khách hàng`, `Nhân viên`)
  - `Thống kê & báo cáo`
  - `Cài đặt & tính năng chờ BE`
- **Góc dưới Sidebar**:
  - Avatar tròn xanh `tv`, **Quản trị viên**, subtitle `Admin · toàn quyền`, nút **Đăng xuất**.
- **Dashboard**:
  - Hàng 1: 3 Thẻ KPI (`Doanh thu hôm nay 72.000.000 đ`, `Tổng số đơn 128`, `Tỉ lệ hoàn tất 87%`).
  - Hàng 2: Thẻ `Cảnh báo chưa xử lý 3` (chữ đỏ đậm).
  - Hàng 3: Biểu đồ cột `Doanh thu 14 ngày gần nhất` (dùng Recharts).
  - Hàng 4: Hộp `Việc cần chú ý` (`2 mặt hàng hết hoặc gần hết · 1 giữ hàng quá hạn bất thường`).
  - Ghi chú: `Số liệu là dữ liệu mẫu. Giao diện thật dùng recharts.`

### 1.3 Khu vực Nhân viên kho (`/staff/**`) — Khớp Ảnh 3
- **Logo**: `MWH Staff` (màu `#0f766e`, bold).
- **Header**: Tiêu đề trang bên trái (`Dashboard`), nhãn `Trang nhân viên (Staff)` bên phải.
- **Menu rút gọn theo quyền (FR-AUTH-02)**:
  - `Dashboard`
  - `Quản lý đơn hàng`
  - Nhóm `Kho & tồn kho` ▶ (`Tồn kho`, `Cảnh báo tồn kho`)
- **Góc dưới Sidebar**:
  - Avatar tròn xanh `MA`, **Nguyễn Minh Anh**, subtitle `Nhân viên kho · WH-HCM`, nút **Đăng xuất**.

---

## 2. CÁC BƯỚC KHỞI ĐỘNG HỆ THỐNG

### Bước 1: Mở terminal tại thư mục `frontend`
```bash
cd frontend
```

### Bước 2: Kiểm tra TypeScript & Linter
```bash
npx tsc --noEmit
npm run lint
```
*(Kết quả: 0 error, 0 warning).*

### Bước 3: Khởi chạy môi trường Dev
```bash
npm run dev
```

---

## 3. KỊCH BẢN KIỂM THỬ TRỰC TIẾP TRÊN TRÌNH DUYỆT

### Kịch bản 1: Đăng nhập mô phỏng (Dev-Login)
1. Mở trình duyệt vào link: **[http://localhost:3000/admin/dev-login](http://localhost:3000/admin/dev-login)**
2. Giao diện sẽ hiển thị y hệt **Ảnh 1**.
3. Bấm nút **"Thử tài khoản Admin"** $\rightarrow$ Hệ thống tự động chuyển vào **[http://localhost:3000/admin/dashboard](http://localhost:3000/admin/dashboard)** (Giao diện hiển thị y hệt **Ảnh 2**).
4. Bấm nút **"Đăng xuất"** ở góc dưới bên trái $\rightarrow$ Hệ thống chuyển về lại trang đăng nhập `/admin/dev-login`.
5. Bấm nút **"Thử tài khoản nhân viên"** $\rightarrow$ Hệ thống tự động chuyển vào **[http://localhost:3000/staff/dashboard](http://localhost:3000/staff/dashboard)** (Giao diện hiển thị y hệt **Ảnh 3**).

### Kịch bản 2: Kiểm thử phân quyền bảo vệ (RoleGate)
1. Đang ở vai trò Staff, thử gõ URL trên trình duyệt: `http://localhost:3000/admin/dashboard`
   $\rightarrow$ Hệ thống tự động đẩy về `http://localhost:3000/staff/dashboard` (Chặn nhân viên không được xem trang Admin).
2. Khi tài khoản là Customer (chưa đăng nhập hoặc đăng xuất): Truy cập vào `/admin` hoặc `/staff`
   $\rightarrow$ Hệ thống tự động đẩy về trang **403 Forbidden** `/admin/forbidden`.

### Kịch bản 3: Kiểm thử Responsive Mobile (360px)
- Bật DevTools (F12) chuyển sang kích thước 360px:
  - Sidebar chuyển thành Offcanvas mở bằng nút hamburger (☰) ở Header.
  - Trang không cuộn ngang (`scrollWidth <= clientWidth`).

---

## 4. CÂU LỆNH COMMIT DÀNH CHO BẠN (TRIẾT)

```bash
# 1. Thêm các file đã chỉnh sửa và file mới vào stage
git add frontend/package.json frontend/package-lock.json
git add frontend/shared/config/adminNav.ts frontend/shared/config/features.ts frontend/shared/lib/roleRedirect.ts
git add frontend/hooks/useCurrentAdminUser.ts frontend/hooks/useRevealOnScroll.ts
git add frontend/components/admin/AdminShell.tsx frontend/components/admin/Header.tsx
git add frontend/components/admin/Sidebar.tsx frontend/components/admin/StatusBadge.tsx
git add frontend/components/admin/RoleGate.tsx frontend/components/admin/ScrollTopButton.tsx
git add frontend/components/admin/DataState.tsx frontend/components/admin/RevealWrapper.tsx
git add frontend/components/admin/DashboardView.tsx
git add frontend/app/admin/layout.tsx frontend/app/admin/admin.css frontend/app/admin/page.tsx
git add frontend/app/admin/dashboard/page.tsx frontend/app/admin/dev-login/page.tsx
git add frontend/app/admin/forbidden/page.tsx frontend/app/admin/[...slug]/page.tsx
git add frontend/app/staff/
git add backend/src/app.module.ts backend/src/admin/
git add docs/guides/Huong_dan_chay_Admin_Bootstrap_Tuan2.md

# 2. Thực hiện commit theo cú pháp chuẩn của nhóm
git commit -m "[Triết] - Hoàn thiện layout Admin và Staff Bootstrap 5.3, trang dev-login và điều hướng vai trò"

# 3. Đẩy lên remote
git push origin project
```
