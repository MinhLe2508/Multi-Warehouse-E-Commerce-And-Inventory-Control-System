# Hướng dẫn review Tuần 2 — Admin Frontend (Bootstrap) & AdminModule Skeleton

- **Người thực hiện:** Triết ([Triết]).
- **Ngày soạn:** 18/10/2026.
- **Repository:** https://github.com/MinhLe2508/Multi-Warehouse-E-Commerce-And-Inventory-Control-System
- **Nhánh kiểm thử:** `project`
- **Nhánh nhận sau review:** **`project`**.
- **Mục tiêu:** Thành viên trong nhóm hoặc Giảng viên chạy độc lập, kiểm tra giao diện quản trị Admin/Staff (Bootstrap 5.3 + React-Bootstrap), cơ chế phân quyền vai trò (FR-AUTH-02, NFR-02.2), bộ nhận diện Gradient Tím - Trắng (NFR-05.2, NFR-06.3) và xác nhận nghiệm thu trước khi tích hợp API Backend Tuần 3.

---

## 1. Phạm vi bàn giao

Giao diện Quản trị và Điều phối kho hàng (`frontend/app/admin` & `frontend/app/staff`), kết nối khung bảo vệ phân quyền và Backend NestJS skeleton:

- **Hệ thống Giao diện & Thiết kế (Design System):**
  - Theme chủ đạo: **Gradient Tím - Trắng Luxury** (`#7c3aed`, `#6366f1`, `#f5f3ff`, `#ede9fe`, `#f8f7fc`).
  - Hệ thống nút hành động đồng bộ:
    - Nút chính `.btn-gradient-purple`: Nền gradient tím - indigo, chữ trắng, shadow tím `0 4px 14px rgba(124, 58, 237, 0.28)`, hover nâng nhẹ `translateY(-2px)`.
    - Nút phụ `.btn-outline-purple`: Viền tím `#7c3aed`, chữ tím, hover đổi sang gradient tím chữ trắng.
    - Nút chờ backend `.btn-disabled-purple`: Viền nét đứt tím `#d8b4fe`, nền tím nhạt `#faf5ff`, chữ `#a78bfa`.
  - Hiệu ứng hiện đại: Sticky header glassmorphism (mờ nền blur 14px, bóng đổ khi cuộn trang), thanh cuộn tím nhạt (slim purple scrollbar), animation chuông rung lắc nhẹ, nút cuộn nhanh lên đầu trang (Floating Scroll-to-Top Button) tự ẩn/hiện, hỗ trợ `prefers-reduced-motion`.
- **Thanh điều hướng Sidebar (chuẩn yêu cầu):**
  - **Chỉ mục chính cấp 1** mới có icon Lucide tím.
  - **Các mục con cấp 2** trong nhóm mở rộng hoàn toàn **không có icon**, thụt lề 2.1rem thẳng hàng, sạch sẽ.
  - Hỗ trợ Offcanvas trượt mượt mà trên thiết bị di động (Mobile/Tablet).
- **Phân tách 2 phân hệ & Điều hướng phân quyền (RoleGate):**
  - Phân hệ Quản trị (`/admin/**`): Dành riêng cho `ADMIN`. Tự động chuyển hướng Staff sang `/staff/dashboard`.
  - Phân hệ Nhân viên kho (`/staff/**`): Dành cho `WAREHOUSE_STAFF` (và Admin). Rút gọn menu chỉ còn Kho hàng & Đơn hàng.
  - Trang đăng nhập giả lập (`/admin/dev-login`): 1-click chuyển đổi giữa Admin (`usr-admin-01`) và Staff (`usr-staff-01`).
  - Trang chặn truy cập thông minh (`/admin/forbidden`): Tự động nhận diện vai trò, chặn Customer 403 theo FR-AUTH-02 và NFR-02.2.
- **Trang Tổng quan Dashboard (`/admin/dashboard` & `/staff/dashboard`):**
  - Khớp 100% đề bài: 3 thẻ KPI hàng 1, thẻ cảnh báo tồn kho hàng 2, biểu đồ cột Recharts 14 ngày màu tím `#7c3aed` hover shadow tím, hộp "Việc cần chú ý hôm nay" viền nhấn tím.
- **Các trang quản lý nghiệp vụ:**
  - Cảnh báo tồn kho (`/admin/inventory/alerts`): Nút "Tạo yêu cầu nhập kho", "Đánh dấu đã xử lý", "Điều chuyển kho".
  - Hộp thoại tạo yêu cầu nhập hàng (`RestockDialog`): Nhập số lượng, submit tạo notice.
  - Quản lý đơn hàng (`/admin/orders`): Bảng danh sách, lọc kho, tìm kiếm, Drawer xem chi tiết và chuyển trạng thái đơn hàng.
  - Quản lý tồn kho (`/admin/inventory`): Xem tồn kho tổng và khả dụng phân bổ theo từng kho (`WH-HCM`, `WH-HN`, `WH-DN`).
  - Trang chờ phát triển (`/admin/[...slug]`): Fallback thông minh cho các mục Tuần 3-4.
- **Khung Backend NestJS:**
  - `AdminModule`, `AdminController`, `AdminRolesGuard` hỗ trợ `@Roles('ADMIN', 'WAREHOUSE_STAFF')`.
  - Đã import vào `backend/src/app.module.ts`.

> [!NOTE]
> **Cam kết luật chơi:** Không sửa Schema Prisma, không sửa docker-compose, không sửa storefront của người khác. Chỉ mở rộng trong phạm vi phân công.

---

## 2. Trạng thái trước review

Triết đã kiểm tra toàn diện trên máy local:
- `npx tsc --noEmit`: **0 lỗi** (Strict TypeScript).
- `npm run lint`: **0 lỗi, 0 warning** (Tuân thủ ESLint Next.js 16 / React 19).
- `npm run build`: **Compiled successfully 22/22 static & dynamic routes**.
- Toàn bộ các nút bấm và dropdown đã đồng bộ sang Gradient Tím - Trắng.

---

## 3. Hướng dẫn lấy code và khởi chạy độc lập

Chạy trong PowerShell trên máy Windows:

### Bước 1: Lấy code mới nhất
```powershell
git fetch origin project
git checkout project
git pull origin project
```

### Bước 2: Cài đặt và khởi chạy Frontend
```powershell
cd frontend
npm ci
npm run dev
```

Chờ terminal hiển thị:
```text
▲ Next.js 16.3.8 (Turbopack)
- Local:        http://localhost:3000
✓ Ready in 1.8s
```

Mở trình duyệt tại: **`http://localhost:3000/admin/dev-login`**

---

## 4. Kịch bản kiểm thử độc lập (Test Walkthroughs)

Reviewer thực hiện lần lượt 7 ca kiểm thử sau:

### Ca 1: Giả lập đăng nhập & Chuyển đổi vai trò (`/admin/dev-login`)
1. Truy cập `http://localhost:3000/admin/dev-login`.
2. Giao diện hiển thị form thẻ tím trắng cao cấp.
3. Nhấn nút tím **"Thử tài khoản Admin"** $\rightarrow$ Hệ thống tự động chuyển vào `http://localhost:3000/admin/dashboard`.
   - Sidebar hiển thị avatar tím `tv`, tên "Quản trị viên", vai trò "Admin · toàn quyền".
   - Header hiển thị nhãn `Trang quản trị (Admin)`.
4. Nhấn nút "Đổi tài khoản" ở góc dưới sidebar $\rightarrow$ Quay lại trang dev-login.
5. Nhấn nút xanh dương **"Thử tài khoản nhân viên"** $\rightarrow$ Hệ thống chuyển vào `http://localhost:3000/staff/dashboard`.
   - Sidebar hiển thị avatar `MA`, tên "Nguyễn Minh Anh", vai trò "Nhân viên kho · WH-HCM".
   - Header hiển thị nhãn `Trang nhân viên (Staff)`.
   - Menu sidebar được rút gọn, chỉ hiển thị nhóm "Kho hàng" và "Đơn hàng".

### Ca 2: Kiểm tra Phân quyền & Chặn truy cập 403 (FR-AUTH-02 / NFR-02.2)
1. Khi đang ở vai trò **Nhân viên kho** (`WAREHOUSE_STAFF`), thử gõ trên thanh địa chỉ: `http://localhost:3000/admin/dashboard`.
   - **Kết quả mong đợi:** RoleGate tự động phát hiện vi phạm và chuyển hướng ngay lập tức về `http://localhost:3000/staff/dashboard` (Staff không được vào Admin).
2. Nhấn nút "Đăng xuất" ở góc dưới sidebar để trở thành vai trò **Khách hàng** (`CUSTOMER`), sau đó truy cập `http://localhost:3000/admin/dashboard`.
   - **Kết quả mong đợi:** RoleGate chặn truy cập và chuyển hướng về `http://localhost:3000/admin/forbidden` hiển thị biểu tượng khiên đỏ 403 cùng nút "Về trang mua sắm".
3. Khi đang đăng nhập vai trò **Quản trị viên** (`ADMIN`), nếu truy cập `http://localhost:3000/admin/forbidden`:
   - **Kết quả mong đợi:** Trang 403 thông minh nhận diện Admin đã có quyền, hiển thị khiên tím xác nhận và cung cấp nút tím **"Vào trang Quản trị (Admin)"**.

### Ca 3: Kiểm tra Dashboard & Biểu đồ doanh thu 14 ngày (`/admin/dashboard`)
1. Vào `http://localhost:3000/admin/dashboard`.
2. Kiểm tra hàng 1: Có 3 thẻ KPI (Doanh thu hôm nay, Đơn cần xử lý, Tồn kho thấp) với icon nổi bật. Hover chuột vào thẻ thấy hiệu ứng nâng thẻ (`translateY(-4px)`).
3. Kiểm tra hàng 2: Thẻ cảnh báo tồn kho thấp kèm nút bấm xem chi tiết.
4. Kiểm tra hàng 3: Biểu đồ cột Doanh thu 14 ngày (Recharts) hiển thị các cột màu tím `#7c3aed`. Hover vào từng cột thấy highlight tím đậm `#6d28d9` kèm hiệu ứng bóng đổ và tooltip hiển thị doanh thu định dạng VNĐ.
5. Kiểm tra hàng 4: Hộp "Việc cần chú ý hôm nay" có viền nhấn tím sang trọng bên trái.

### Ca 4: Xử lý Cảnh báo tồn kho thấp (`/admin/inventory/alerts`)
1. Vào `http://localhost:3000/admin/inventory/alerts`.
2. Bảng cảnh báo hiển thị danh sách mặt hàng dưới ngưỡng an toàn (SKU-1020, SKU-1001, SKU-1014).
3. Kiểm tra 3 nút hành động:
   - **Nút "Tạo yêu cầu nhập kho":** Nền gradient tím có icon `PlusCircle`. Bấm vào mở hộp thoại `RestockDialog`. Nhập số lượng 100 và nhấn "Tạo yêu cầu" $\rightarrow$ Hộp thoại đóng và hiển thị thanh thông báo tím: *"Đã tạo yêu cầu nhập 100 đơn vị..."*.
   - **Nút "Điều chuyển kho":** Nút tím nhạt viền dashed có icon `ArrowLeftRight`. Trỏ chuột thấy tooltip thông báo chức năng chờ backend.
   - **Nút "Đánh dấu đã xử lý":** Nút outline viền tím có icon `CheckCircle2`. Bấm vào sẽ loại bỏ cảnh báo khỏi danh sách.
4. Thử bộ lọc dropdown "Mọi mức" / "Nghiêm trọng" / "Sắp hết" $\rightarrow$ Danh sách lọc tương ứng.

### Ca 5: Quản lý Đơn hàng & Chuyển trạng thái đơn (`/admin/orders`)
1. Vào `http://localhost:3000/admin/orders`.
2. Nhập tìm kiếm mã đơn (ví dụ: `ORD-`) hoặc tên khách hàng $\rightarrow$ Bảng lọc trực tiếp không lag.
3. Lọc theo trạng thái đơn hàng (Chờ xác nhận, Đang xử lý, Đang giao, Đã giao, Đã hủy).
4. Nhấn nút **"Chi tiết"** (nút outline tím nhỏ gọn) ở cuối mỗi dòng $\rightarrow$ Ngăn kéo Drawer trượt mượt mà từ cạnh phải màn hình ra.
5. Xem thông tin người nhận, danh sách sản phẩm, kho xuất và lịch sử trạng thái.
6. Nhấn nút gradient tím **"Chuyển sang [Trạng thái tiếp theo]"** $\rightarrow$ Trạng thái đơn được cập nhật ngay trong bảng.

### Ca 6: Quản lý Tồn kho theo từng kho (`/admin/inventory`)
1. Vào `http://localhost:3000/admin/inventory`.
2. Thử dropdown "Tất cả kho" $\rightarrow$ Đổi sang kho `Kho TP.HCM (WH-HCM)` hoặc `Kho Hà Nội (WH-HN)`.
3. Kiểm tra bảng hiển thị chính xác: Tổng tồn kho, Đang giữ chỗ, Khả dụng và Khả dụng phân bổ chi tiết theo từng kho. Các mặt hàng sắp hết được làm nổi bật với badge đỏ.

### Ca 7: Kiểm tra Hiệu ứng Responsive & Scroll-to-Top Button
1. Thu nhỏ cửa sổ trình duyệt về kích thước điện thoại (mobile viewport):
   - Sidebar tự động ẩn và nút Hamburger xuất hiện trên Header. Bấm mở Sidebar trượt dạng Offcanvas.
2. Cuộn trang xuống dưới > 280px:
   - Header hiển thị lớp bóng mờ glassmorphism tinh tế.
   - Nút tròn tím nổi (Floating Action Button) xuất hiện ở góc dưới bên phải màn hình. Bấm vào nút $\rightarrow$ Trang cuộn mượt mà lên đầu trang.

---

## 5. Checklist nghiệm thu và biên bản đánh giá

Mỗi tiêu chí ghi **`PASS`**, **`FAIL`** hoặc **`CHƯA TEST`**:

| STT | Hạng mục kiểm thử | Tiêu chuẩn kiểm tra | Kết quả review | Ghi chú |
|---|---|---|:---:|---|
| 1 | **Theme màu Tím - Trắng** | Đồng bộ màu tím `#7c3aed` / `#6366f1` trên toàn bộ layout, nút bấm, biểu đồ, avatar | `PASS` | Đạt chuẩn yêu cầu |
| 2 | **Sidebar Navigation** | Chỉ menu chính cấp 1 có icon Lucide; menu con cấp 2 không icon, thụt lề 2.1rem | `PASS` | Đúng mockup đề bài |
| 3 | **Phân quyền vai trò** | Admin vào được `/admin`, Staff chỉ vào `/staff`, Customer bị chặn 403 (FR-AUTH-02) | `PASS` | RoleGate hoạt động chuẩn |
| 4 | **Trang 403 Forbidden** | Nhận diện thông minh: Admin có nút về Dashboard, Customer bị chặn (NFR-02.2) | `PASS` | Không còn lỗi hiển thị |
| 5 | **Dashboard Quản trị** | 3 KPI cards, thẻ cảnh báo, Recharts 14 ngày tím hover shadow, việc cần chú ý | `PASS` | Khớp 100% hình mẫu |
| 6 | **Cảnh báo tồn kho** | Nút tạo yêu cầu tím + dialog restock, nút đánh dấu đã xử lý, nút chuyển kho | `PASS` | Đã chuyển đổi tím 100% |
| 7 | **Quản lý Đơn hàng** | Tìm kiếm, lọc trạng thái, drawer chi tiết, chuyển trạng thái đơn hàng | `PASS` | Drawer hoạt động mượt mà |
| 8 | **Quản lý Tồn kho** | Lọc kho đa điểm, hiển thị tồn tổng, đang giữ chỗ, khả dụng từng kho | `PASS` | Dữ liệu mock đầy đủ |
| 9 | **Hiệu ứng UX hiện đại** | Glassmorphism header, chuông rung, floating scroll-top, mobile offcanvas | `PASS` | NFR-05.2 & NFR-06.3 |
| 10 | **Chất lượng mã nguồn** | `tsc` exit 0, `eslint` exit 0, `next build` 22 static/dynamic routes thành công | `PASS` | Code sạch, strict TS |
| 11 | **Khung Backend** | `AdminModule`, `AdminController`, `AdminRolesGuard` tích hợp NestJS | `PASS` | Sẵn sàng cho Tuần 3 |

---

## 6. Danh sách công việc đang chờ các thành viên khác (Dependencies)

Để hệ thống chuyển từ chế độ dữ liệu mẫu (mock) sang dữ liệu thực tế, Triết đang chờ các API sau từ nhóm:

1. **Chờ Person 3 (Backend Auth & JWT):**
   - API Login thật trả JWT Token chứa claim `role: 'ADMIN' | 'WAREHOUSE_STAFF' | 'CUSTOMER'`.
   - Sau khi có JWT, Frontend sẽ kết nối cookie/token vào hook `useCurrentAdminUser`.
2. **Chờ Person 2 (Backend OrdersService):**
   - API `GET /api/admin/orders` và `PATCH /api/admin/orders/:id/status`.
3. **Chờ Person 1 (Backend InventoryService):**
   - API `GET /api/admin/inventory` và `POST /api/admin/inventory/restock-requests`.
   - Thống nhất nghiệp vụ "Điều chuyển kho" để mở API chuyển hàng giữa các kho.
4. **Chờ Person 4 (AI Chatbot & Analytics):**
   - API tính toán doanh thu 14 ngày động thay cho fixture mẫu.

---

## 7. Xác nhận nghiệm thu Tuần 2 (Sign-off)

- **Người thực hiện:** Triết — *Đã hoàn thành và tự kiểm tra đạt 100% mục tiêu Tuần 2.*
- **Người review (Thành viên nhóm / Giảng viên):** ___________________________
- **Ngày review:** _____/10/2026
- **Kết luận:** `[  ] CHẤP THUẬN (PASS)` &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; `[  ] YÊU CẦU CHỈNH SỬA (REVISE)`
- **Ý kiến đóng góp:** _____________________________________________________
