# BÁO CÁO CÔNG VIỆC ADMIN FRONTEND & BACKEND SKELETON (TUẦN 2)
**Dự án:** Multi-Warehouse E-Commerce & Inventory Control System  
**Người thực hiện:** Triết ([Triết])  
**Nhánh Git:** `project`  
**Thời gian hoàn thành:** Tuần 2 (18/10/2026)  
**Tiêu chuẩn đáp ứng:** SRS FR-AUTH-02, NFR-02.2, NFR-05.2, NFR-06.3, Luật chơi Project

---

## 1. CÁC CÔNG VIỆC ĐÃ HOÀN THÀNH 100%

### 1.1. Thiết kế Giao diện Luxury: Gradient Tím - Trắng (Bootstrap 5.3 + React-Bootstrap)
- **Hệ màu chủ đạo:** Xây dựng hệ màu Tím - Trắng cao cấp theo yêu cầu (`#7c3aed`, `#6366f1`, `#f5f3ff`, `#ede9fe`, `#f8f7fc`).
- **Hệ thống nút hành động đồng bộ (Button System):**
  - `.btn-gradient-purple`: Nút chính nền gradient tím, chữ trắng, bóng mờ tím `box-shadow: 0 4px 14px rgba(124, 58, 237, 0.28)`, hover nâng nhẹ `translateY(-2px)`.
  - `.btn-outline-purple`: Nút phụ viền tím `#7c3aed`, chữ tím, hover nền gradient tím chữ trắng.
  - `.btn-disabled-purple`: Nút tính năng chờ backend viền nét đứt tím `#d8b4fe`, nền tím nhạt `#faf5ff`, chữ `#a78bfa`.
  - **Form Controls:** Input tìm kiếm và Select dropdown viền tím `#ede9fe`, focus ring tím `rgba(124, 58, 237, 0.18)`.
- **Hiệu ứng giao diện hiện đại (Modern Effects):**
  - **Sticky Header Glassmorphism:** Header cố định mờ nền `backdrop-filter: blur(14px)`, tự động thêm bóng đổ `box-shadow` khi cuộn trang (IntersectionObserver).
  - **Slim Glass Purple Scrollbar:** Thanh cuộn tím nhạt thanh mảnh 5px trên Sidebar và toàn trang.
  - **Bell Swing Animation:** Chuông cảnh báo lắc lư nhẹ nhàng khi hover.
  - **Floating Scroll-To-Top Button (FAB):** Nút tròn tím cuộn mượt lên đầu trang, tự ẩn/hiện khi cuộn > 280px.
  - **Accessibility:** Tự động tắt animation đối với người dùng bật `@media (prefers-reduced-motion)`.

### 1.2. Thanh điều hướng Sidebar (Chuẩn theo yêu cầu)
- **Cấu trúc Icon:**
  - **Chỉ các mục chính cấp 1 (Level 1)** mới hiển thị icon Lucide tím (`LayoutDashboard`, `Boxes`, `ClipboardList`, `BellRing`, `Layers`, `Settings`, ...).
  - **Các mục con cấp 2 (Level 2)** bên trong Collapse hoàn toàn **không để icon**, hiển thị text thụt lề 2.1rem thẳng hàng, sạch sẽ, tinh tế.
- **Phân nhóm chức năng:**
  - `ADMIN_NAV_GROUPS`: Đầy đủ 6 nhóm quản trị (Tổng quan, Quản lý kho, Quản lý đơn, Sản phẩm, Báo cáo & AI, Cấu hình).
  - `STAFF_NAV_GROUPS`: Rút gọn chỉ giữ nghiệp vụ kho (Kho hàng & Đơn hàng).
- **Trải nghiệm:** Accordion đóng/mở nhớ trạng thái, avatar tím chữ viết tắt `tv` (Trần Văn) / `MA` (Minh Anh), hỗ trợ Offcanvas trượt mượt mà trên điện thoại/tablet.

### 1.3. Trang Tổng quan Dashboard ([DashboardView.tsx](file:///c:/HK2_2026_2027/CNPM/THUCHANH/CUOIKY/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/frontend/components/admin/DashboardView.tsx))
- Khớp 100% hình ảnh đề bài:
  - **Hàng 1:** 3 thẻ KPI (Doanh thu hôm nay, Đơn cần xử lý, Tồn kho thấp) có hiệu ứng hover nâng thẻ và xoay nhẹ icon.
  - **Hàng 2:** Thẻ cảnh báo tồn kho thấp kèm nút tím chuyển nhanh sang danh sách cảnh báo.
  - **Hàng 3:** Biểu đồ cột Doanh thu 14 ngày (Recharts) cột tím `#7c3aed`, hover đổi màu tím đậm `#6d28d9` kèm shadow.
  - **Hàng 4:** Hộp "Việc cần chú ý hôm nay" viền nhấn tím sang trọng.

### 1.4. Phân tách Khu vực & Kiểm soát Phân quyền ([RoleGate.tsx](file:///c:/HK2_2026_2027/CNPM/THUCHANH/CUOIKY/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/frontend/components/admin/RoleGate.tsx))
- **Khu vực Admin (`/admin/**`):** Chỉ cho phép vai trò `ADMIN`. Nếu Staff truy cập $\rightarrow$ Tự động điều hướng sang `/staff/dashboard`.
- **Khu vực Nhân viên (`/staff/**`):** Dành riêng cho `WAREHOUSE_STAFF` (và Admin).
- **Trang Đăng nhập giả lập (`/admin/dev-login`):** Giao diện gradient tím trắng, hỗ trợ 1-click chuyển đổi giữa tài khoản Admin (`usr-admin-01`) và Staff (`usr-staff-01`), lưu trạng thái vào `localStorage`.
- **Trang 403 Forbidden thông minh (`/admin/forbidden`):**
  - Nhận diện nếu user là `ADMIN` $\rightarrow$ Thông báo đã có toàn quyền, hiển thị nút tím **[Vào trang Quản trị (Admin)]**.
  - Nhận diện nếu user là `STAFF` $\rightarrow$ Hiển thị nút tím **[Vào trang Nhân viên (Staff)]**.
  - Nếu là `CUSTOMER` $\rightarrow$ Chặn và hiển thị nút quay lại Storefront hoặc Đăng nhập thử Admin.

### 1.5. Đồng bộ màu Tím trên toàn bộ các trang nghiệp vụ
- **Trang Cảnh báo tồn kho (`/admin/alerts` & `/admin/inventory/alerts`):**
  - Nút "Tạo yêu cầu nhập kho": Gradient tím có icon `PlusCircle`.
  - Nút "Điều chuyển kho": Tím nhạt có icon `ArrowLeftRight`.
  - Nút "Đánh dấu đã xử lý": Outline tím có icon `CheckCircle2`.
- **Hộp thoại Nhập hàng ([RestockDialog.tsx](file:///c:/HK2_2026_2027/CNPM/THUCHANH/CUOIKY/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/frontend/components/admin/RestockDialog.tsx)):** Nút "Tạo yêu cầu" gradient tím, nút "Hủy" outline tím.
- **Quản lý Đơn hàng ([OrderDrawer.tsx](file:///c:/HK2_2026_2027/CNPM/THUCHANH/CUOIKY/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/frontend/components/admin/OrderDrawer.tsx) & [orders/page.tsx](file:///c:/HK2_2026_2027/CNPM/THUCHANH/CUOIKY/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/frontend/app/admin/orders/page.tsx)):** Nút chuyển trạng thái trong Drawer và nút "Chi tiết" trong bảng đơn hàng đều mang màu tím.
- **Trang Fallback (`/admin/[...slug]`):** Thông báo tính năng đang phát triển theo Tuần 3-4 với icon và nút điều hướng tím.

### 1.6. Khung Backend NestJS ([backend/src/admin/](file:///c:/HK2_2026_2027/CNPM/THUCHANH/CUOIKY/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/backend/src/admin/))
- Đã tạo `AdminModule`, `AdminController`, `AdminRolesGuard` hỗ trợ phân quyền `@Roles('ADMIN', 'WAREHOUSE_STAFF')`.
- Đã import vào `backend/src/app.module.ts`.

### 1.7. Kiểm tra chất lượng mã nguồn (Quality Gate)
- `npx tsc --noEmit`: **0 lỗi** (Strict Type-checking).
- `npm run lint`: **0 lỗi, 0 warning** (Tuân thủ ESLint React 19 / Next 16).
- `npm run build`: **Compiled successfully 22/22 routes**.

---

## 2. CÁC CÔNG VIỆC ĐANG CHỜ NGƯỜI KHÁC / BACKEND (WAITING LIST)

| TT | Hạng mục cần kết nối | Phụ trách / Người làm | Mã SRS liên quan | Nội dung đang chờ |
|---|---|---|---|---|
| **1** | **Xác thực JWT & Phân quyền thật** | Thành viên làm Auth Backend | `FR-AUTH-02`, `NFR-02.2` | Đang chờ API Login trả về Token JWT chứa `role` thật (`ADMIN`, `WAREHOUSE_STAFF`, `CUSTOMER`). Khi có JWT, Frontend sẽ thay hook `useCurrentAdminUser` sang đọc token từ Cookie/Header. |
| **2** | **Nghiệp vụ Đơn hàng Backend** | Thành viên làm OrdersService | `FR-ORD-01` $\rightarrow$ `FR-ORD-05` | Đang chờ API danh sách đơn hàng (`GET /api/admin/orders`) và API chuyển trạng thái đơn hàng (`PATCH /api/admin/orders/:id/status`). Hiện tại Frontend đang dùng mock state local. |
| **3** | **Tồn kho & Phiếu nhập kho Backend** | Thành viên làm InventoryService | `FR-INV-01` $\rightarrow$ `FR-INV-06` | Đang chờ API đồng bộ tồn kho thực tế và API nhận payload khi nhấn "Tạo yêu cầu nhập kho". |
| **4** | **Chốt nghiệp vụ Điều chuyển kho** | Nhóm & Giảng viên | `NFR-05.2` (UX) | Tính năng "Điều chuyển kho" chưa có endpoint trong SRS. Frontend đã làm sẵn nút (tạm disabled) chờ Backend cung cấp API chuyển kho giữa các chi nhánh (`w-hn`, `w-dn`, `w-hcm`). |
| **5** | **Số liệu thống kê AI / Analytics** | Thành viên làm Analytics/AI | Tuần 3 - 4 | Đang chờ API tính doanh thu 14 ngày tự động để thay cho dữ liệu mẫu `adminMock.ts`. |

---

## 3. CÁC LỆNH GIT ĐỂ BẠN TỰ COMMIT VÀ PUSH

> [!IMPORTANT]
> Agent tuân thủ nghiêm ngặt quy tắc không tự ý chạy `git commit` hay `git push`. Bạn vui lòng mở terminal và chạy các câu lệnh dưới đây.

### Cách 1: Commit toàn bộ 1 lần (Khuyên dùng)
```bash
# 1. Thêm tất cả các file đã làm vào khu vực chờ commit
git add frontend/ backend/ docs/

# 2. Kiểm tra trạng thái các file sẽ được commit
git status

# 3. Tạo commit với định dạng chuẩn [Triết]
git commit -m "[Triết] - Hoan thien Admin Frontend Bootstrap Tuan 2 theme gradient tim trang va skeleton backend"

# 4. Đẩy mã nguồn lên nhánh project trên GitHub
git push origin project
```

---

### Cách 2: Chia thành các commit nhỏ chi tiết theo từng nhiệm vụ

Nếu bạn muốn lịch sử Git chuyên nghiệp và rõ ràng hơn trong báo cáo nhóm:

#### Commit 1: Giao diện Layout, Sidebar, Header và Theme Gradient Tím - Trắng
```bash
git add frontend/app/admin/admin.css frontend/components/admin/Sidebar.tsx frontend/components/admin/Header.tsx frontend/components/admin/AdminShell.tsx frontend/shared/config/adminNav.ts frontend/package.json frontend/package-lock.json
git commit -m "[Triết] - Xay dung Layout Admin Bootstrap theme Gradient Tim Trang va Sidebar chuan SRS"
```

#### Commit 2: Phân quyền vai trò, Dev-Login, RoleGate và Trang 403
```bash
git add frontend/components/admin/RoleGate.tsx frontend/hooks/useCurrentAdminUser.ts frontend/app/admin/dev-login/ frontend/app/admin/forbidden/ frontend/shared/lib/roleRedirect.ts
git commit -m "[Triết] - Trien khai co che phan quyen RoleGate, DevLogin va trang 403 Forbidden thong minh"
```

#### Commit 3: Dashboard, Đồng bộ nút màu Tím và Phân hệ Nhân viên kho (/staff)
```bash
git add frontend/components/admin/DashboardView.tsx frontend/app/admin/dashboard/ frontend/app/staff/ frontend/app/admin/alerts/ frontend/components/admin/RestockDialog.tsx frontend/components/admin/OrderDrawer.tsx frontend/app/admin/orders/ frontend/app/admin/inventory/ frontend/app/admin/[...slug]/
git commit -m "[Triết] - Hoan thien Dashboard, dong bo toan bo nut hanh dong sang mau tim va phan tach route staff"
```

#### Commit 4: Khung Backend AdminModule và Tài liệu hướng dẫn
```bash
git add backend/src/admin/ backend/src/app.module.ts docs/
git commit -m "[Triết] - Tao khung module Backend AdminModule va viet tai lieu huong dan Tuan 2"
```

#### Sau đó đẩy toàn bộ lên nhánh:
```bash
git push origin project
```
