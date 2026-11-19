# Báo cáo Audit Phase 0 — Phần việc của Triết (P2: Admin / Inventory UI / Orders & Analytics)

- **Ngày audit:** 2026-11-12
- **Nhánh Git hiện tại:** `project` (đồng bộ với `origin/project`, commit mới nhất `38b5291`)
- **Mục tiêu:** Rà soát toàn bộ thực trạng Backend (`AdminModule` + các API liên quan), Frontend (`app/admin/**`, `app/staff/**`, `components/admin/**`, `hooks/**`), và Realtime (Redis/WebSocket) trước khi triển khai Task 30 (ghép API thật, bỏ mock, `useInventoryRealtime`, `useAdminOrders`).

---

## 1. Trạng thái môi trường & nền tảng (Mục 4.2)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| `.env` ở thư mục gốc | **Chưa có** (`False`) | Cần copy từ `.env.example` và cấu hình DB/Redis/JWT trước khi chạy Docker/E2E. |
| Docker / Postgres / Redis | **Chưa chạy** | `docker ps` không trả container đang chạy tại thời điểm audit. Cần bật Docker Desktop và chạy `docker compose up -d` + `npx prisma migrate status` + `npx prisma db seed`. |
| `socket.io-client` (FE) | **Đã cài** (`^4.8.4`) | Có sẵn trong `frontend/package.json:20`, nhưng chưa có hook/code nào sử dụng. |
| Swagger (`@nestjs/swagger`) | **Chưa cài** | Không có trong `backend/package.json`; contract hiện dùng file YAML tại `docs/api/admin-api-contract.yaml`. |

---

## 2. Checklist Audit Chi tiết (Mục 4.3)

### 2.1 Backend (`AdminModule` & các endpoint Admin liên quan)

| # | Tiêu chí kiểm tra | Trạng thái | Bằng chứng (`file:dòng`) | Ghi chú / Sai lệch |
|---|---|---|---|---|
| 1 | Mọi route admin có `JwtAuthGuard` + `RolesGuard` + `@Roles(...)` | **Có** | `backend/src/admin/admin.controller.ts:14-17`<br>`backend/src/admin/inventory/admin-inventory.controller.ts:22-39`<br>`backend/src/adminapi/staff.controller.ts:69-70`<br>`backend/src/orders/admin-orders.controller.ts:20-21` | Guard đã chuẩn hóa sang `core/guards` (`JwtAuthGuard`, `RolesGuard`). |
| 2 | Phân quyền đúng: Analytics = ADMIN; Inventory/Alerts/Dashboard = ADMIN + STAFF; Orders status = ADMIN + STAFF | **Một phần (Thiếu / Lệch)** | `backend/src/orders/admin-orders.controller.ts:21` (`@Roles(UserRole.ADMIN)`)<br>`backend/src/inventory/inventory.controller.ts:66,78` (`ADMIN`, `WAREHOUSE_STAFF`) | • `AdminOrdersController` đang để `@Roles(UserRole.ADMIN)` → **chặn `WAREHOUSE_STAFF`** (trái với FR-ORD-05 & A5.1).<br>• Route hiện là `PATCH /orders/admin/:id/status` thay vì `/admin/orders/:id/status`.<br>• `AdminAnalyticsController` **chưa tồn tại** trên BE. |
| 3 | `AdminOrdersController`: danh sách (lọc status/ngày, phân trang), chi tiết (items, payments, history), đổi trạng thái | **Một phần (Thiếu GET)** | `backend/src/orders/admin-orders.controller.ts:25-32` | Hiện chỉ có duy nhất `PATCH /orders/admin/:id/status`. **Thiếu hoàn toàn** `GET /admin/orders` và `GET /admin/orders/:id` (hoặc `/orders/admin`). |
| 4 | Đổi trạng thái đơn: state machine 1 chiều, sai → 409, không tồn tại → 404, ghi `order_status_history` + `actorId` trong cùng transaction | **Có** | `backend/src/orders/orders.service.ts` + `backend/src/orders/orders.status.spec.ts` + `docs/huy-week4/README.md:32-36` | Huy đã implement `changeStatus()` khóa dòng `FOR UPDATE`, kiểm tra cạnh `PENDING_PAYMENT→CANCELLED`, `CONFIRMED→SHIPPING→DELIVERED`, ghi `order_status_history` trong Prisma transaction. |
| 5 | `AdminAnalyticsService`: đủ 5 chỉ số FR-DASH-02; `fromDate > toDate` → 422; chỉ đọc | **Không** | Chưa có file trong `backend/src/admin/` | **Thiếu hoàn toàn** `AdminAnalyticsController` và `AdminAnalyticsService` (`GET /admin/analytics/summary`, `GET /admin/analytics/revenue-series`). |
| 6 | Doanh thu chỉ tính `CONFIRMED, SHIPPING, DELIVERED` | **Không** | Chưa có service analytics | Sẽ implement trong `AdminAnalyticsService` dùng `SUM(grand_total)`. |
| 7 | Tiền trả về dạng **string** (Decimal), không phải `number` | **Một phần** | Prisma `Decimal` serialize thành string ở BE | Cần giữ đúng kiểu `string` cho `revenue.total`, `revenue`, `grandTotal` ở BE và DTO/type FE. |
| 8 | `BigInt` (`inventory.id`, `stock_alerts.id`, …) được serialize an toàn | **Có** | `backend/src/main.ts:16-20` | Đã có `BigInt.prototype.toJSON` trả về `this.toString()`. |
| 9 | Có Swagger/OpenAPI decorators cho endpoint admin | **Không** | `backend/package.json` | Dự án không cài `@nestjs/swagger`; tài liệu API dùng file `docs/api/admin-api-contract.yaml`. |
| 10 | Không import repository/entity của module khác (`AdminModule`) | **Có (do chưa query DB)** | `backend/src/admin/admin.module.ts:1-11`<br>`backend/src/admin/inventory/admin-inventory.service.ts:51` | `AdminInventoryService` hiện vẫn đang dùng `this.initMockData()` (in-memory mock 50 SP), **chưa nối vào `InventoryService` thật** của Khang (`backend/src/inventory/inventory.service.ts`). |

---

### 2.2 Frontend (`app/admin/**`, `app/staff/**`, `components/admin/**`, `hooks/**`)

| # | Tiêu chí kiểm tra | Trạng thái | Bằng chứng (`file:dòng`) | Ghi chú |
|---|---|---|---|---|
| 1 | Route guard: chưa đăng nhập → `/login`; CUSTOMER vào `/admin` → bị chặn; không chỉ ẩn menu | **Có** | `frontend/components/admin/RoleGate.tsx:20-69` | Đã chặn: chưa login → `/login?next=...`, CUSTOMER → `notFound()` (404 không lộ khu vực quản trị), STAFF vào route Admin → `/staff/dashboard?notice=...`, chưa ready → hiện spinner. |
| 2 | Trang Dashboard, Inventory, Orders, Alerts (và Categories/Products) — trang nào còn dùng mock? | **Hầu hết còn Mock** | Xem chi tiết **Mục 3** bên dưới | • `DashboardView.tsx` hardcode số liệu.<br>• `useAdminAnalytics.ts` dùng 100% `adminMock.ts`.<br>• `useAdminOrders.ts` dùng 100% `ORDERS` mock, `fetchOrders` chỉ cập nhật đồng hồ.<br>• `useAdminInventory.ts` có gọi `/inventory` nhưng khởi tạo và fallback bằng `adminInventoryMock.ts`.<br>• `useStockAlerts.ts` gọi `/inventory/alerts` nhưng fallback về `MOCK_ALERTS`.<br>• `app/admin/alerts/page.tsx` gọi `useAlerts()` (100% mock) thay vì `useStockAlerts()`. |
| 3 | `InventoryTable`, `WarehouseStockChart`, `RevenueChart` — nguồn dữ liệu | **Một phần** | `InventoryTable.tsx`, `WarehouseStockChart.tsx`, `RevenueChart.tsx` | Component nhận props sạch, nhưng dữ liệu truyền từ page/hook hiện vẫn có mock (`DashboardView` tự hardcode `FOURTEEN_DAYS_DATA`; `useAdminInventory` fallback mock). |
| 4 | Hook `useInventoryRealtime`, `useAdminOrders` | **Chưa đạt** | `useInventoryRealtime`: **Chưa tồn tại**<br>`frontend/hooks/useAdminOrders.ts:8-97` | • `useInventoryRealtime` chưa được tạo ở bất kỳ đâu trong repo.<br>• `useAdminOrders` chưa gọi API thật (chỉ sửa state in-memory). |
| 5 | Xử lý loading / empty / error + nút "Tải lại" (FR-DASH-01) | **Một phần** | `frontend/components/admin/DataState.tsx` | Có component `DataState`, nhưng `DashboardView` chưa có trạng thái loading/error/Tải lại vì đang hardcode; `Orders` & `Alerts` cần gắn error banner + nút "Tải lại" theo API thật. |
| 6 | Layout responsive ở 360 / 768 / 1280 px | **Một phần** | `frontend/app/admin/admin.css`, `InventoryTable.tsx`, `StockAdjustModal.tsx` | Cần chạy Playwright kiểm thử thực tế trên 3 viewport để xác nhận 0 cuộn ngang (`scrollWidth <= clientWidth`). |
| 7 | API client tự gắn `Authorization`, xử lý 401 (refresh token → retry → logout) và 403 | **Có** | `frontend/store/useAuthStore.ts` (`authenticatedRequest`) | Đã có `authenticatedRequest` tự gắn Bearer, xử lý refresh token 1 lần khi sắp hết hạn/401 (cần rà soát lại case retry sau 401 và xử lý 403 UI). |

---

### 2.3 Tích hợp Realtime (WebSocket & Redis)

| # | Tiêu chí kiểm tra | Trạng thái | Bằng chứng (`file:dòng`) | Ghi chú |
|---|---|---|---|---|
| 1 | `NotificationsGateway` namespace/path/event, xác thực JWT, giới hạn role | **Có (cần lưu ý role)** | `backend/src/notifications/notifications.gateway.ts:32-124` | • Namespace: **`/notifications`**<br>• Token truyền qua `handshake.auth.token` hoặc header `Authorization: Bearer ...` (KHÔNG qua query string).<br>• Khi lỗi auth: emit `'auth_error'` rồi `disconnect(true)`.<br>• Join room `user.id` và `role:${user.role}`.<br>• **Lưu ý:** `emitLowStockAlert` hiện **chỉ emit tới `role:ADMIN`** (`ADMIN_ROOM`, dòng 15 & 110). `WAREHOUSE_STAFF` không nhận được sự kiện socket này trừ khi Minh bổ sung room hoặc dùng chung. |
| 2 | Payload thật của `low_stock_alert` và `inventory.changed` | **Có `low_stock_alert`, Chưa có `inventory.changed`** | `backend/src/inventory/inventory-pubsub.service.ts:9-24`<br>`backend/src/notifications/low-stock-notifier.service.ts:57-62` | • Kênh Redis: `inventory.low_stock` (`LOW_STOCK_CHANNEL`).<br>• Event Socket: **`low_stock_alert`**, payload `LowStockEvent`:<br>  `{ inventoryId, productId, warehouseId, availableStock, threshold, alertId?, alertLevel?, sku?, productName?, warehouseCode?, triggeredAt? }`.<br>• **`inventory.changed` chưa tồn tại** ở BE. |
| 3 | Endpoint REST đọc lại `stock_alerts` để khôi phục khi mất kết nối | **Có (cần bổ sung resolve nếu thiếu)** | `backend/src/inventory/inventory.controller.ts:77-84` | Đã có `GET /inventory/alerts?status=OPEN&warehouseId&limit&offset` (ADMIN, STAFF). Chưa có `PATCH /inventory/alerts/:id/resolve` (cần kiểm tra/bổ sung nếu scope cho phép). |

---

## 3. Danh sách file & dòng còn Mock / Hardcode (Frontend & Admin BE)

1. **`backend/src/admin/inventory/admin-inventory.service.ts:51-54`**: `this.initMockData()` tạo 50 sản phẩm giả trong RAM. (Trong khi `backend/src/inventory/inventory.controller.ts` đã có API thật `/inventory`).
2. **`frontend/components/admin/DashboardView.tsx:21-37, 67-100`**: Hardcode `FOURTEEN_DAYS_DATA`, doanh thu `72.000.000 đ`, và các số KPI tĩnh.
3. **`frontend/hooks/useAdminAnalytics.ts:3-33`**: Import `ALERTS, INVENTORY, ORDERS, REVENUE, WAREHOUSES` từ `shared/mock/adminMock`; `useDashboard()`, `useInventory()`, `useAlerts()` đều dùng 100% mock.
4. **`frontend/hooks/useAdminOrders.ts:4, 8-97`**: Import `ORDERS` từ `shared/mock/adminMock`; `fetchOrders` không gọi API; `advanceStatus` chỉ sửa state giả lập trong RAM.
5. **`frontend/app/admin/alerts/page.tsx:7, 12`**: Đang import `useAlerts` (mock từ `useAdminAnalytics.ts`) thay vì hook API thật `useStockAlerts` + realtime.
6. **`frontend/hooks/useAdminInventory.ts:11-17, 94-99, 263, 369-402`**: Khởi tạo state bằng `adminInventoryData` (mock) và tự fallback về mock khi API lỗi; `warehouses` và `categories` vẫn trả `MOCK_WAREHOUSES`, `MOCK_CATEGORIES` thay vì lấy từ API `/warehouses` và `/categories`.
7. **`frontend/hooks/useStockAlerts.ts:5, 53-74`**: Khi gọi `GET /inventory/alerts` thất bại thì âm thầm fallback sang `MOCK_ALERTS` thay vì báo lỗi cho người dùng.
8. **`frontend/components/admin/AdminContext.tsx:3`**: Import `WAREHOUSES` từ `shared/mock/adminMock`.
9. **`frontend/hooks/useAdminProducts.ts:22, 85-88`** & **`frontend/components/categories/ManageCategories.tsx:57, 103`**: Còn dùng mock/fallback (do chưa có API CRUD products hoặc cần nối `/categories` thật).
10. **`frontend/shared/mock/adminMock.ts`** & **`frontend/shared/mock/adminInventoryMock.ts`**: File mock cần loại bỏ khỏi luồng Admin sau khi ghép xong API thật.

---

## 4. Danh sách Endpoint thiếu / lệch hợp đồng

| Chức năng | Kỳ vọng (A5.1 / SRS) | Hiện trạng trong Repo | Hướng xử lý đề xuất |
|---|---|---|---|
| **Tồn kho** | `GET /inventory`, `PUT /inventory/:id`, `POST /inventory/:id/restock` | Khang đã làm chuẩn tại `InventoryController` (`/inventory`, `/inventory/alerts`, `/inventory/:id`, `/inventory/:id/restock`). Ngược lại `AdminInventoryController` (`/admin/inventory`) là mock. | Frontend Admin Inventory nên gọi trực tiếp endpoint thật của Khang (`/inventory`, `/inventory/:id`, `/inventory/:id/restock`) hoặc `AdminModule` bỏ mock. |
| **Đơn hàng (Admin/Staff)** | `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status` (ADMIN + STAFF) | Chỉ có `PATCH /orders/admin/:id/status` của Huy (`AdminOrdersController`) và đang khóa `@Roles(UserRole.ADMIN)` (thiếu `WAREHOUSE_STAFF`). Chưa có `GET` list/detail cho Admin/Staff! | Bổ sung `GET /admin/orders`, `GET /admin/orders/:id`, và `PATCH /admin/orders/:id/status` (hoặc mở rộng `AdminOrdersController` cho `ADMIN` + `WAREHOUSE_STAFF`, gọi `OrdersService`). |
| **Báo cáo Analytics (FR-DASH-02)** | `GET /admin/analytics/summary`, `GET /admin/analytics/revenue-series` (ADMIN only) | **Chưa tồn tại** trên Backend. | Triển khai `AdminAnalyticsController` + `AdminAnalyticsService` trong `AdminModule` (chỉ đọc, `fromDate > toDate` → 422, tiền trả string, `@Roles(UserRole.ADMIN)`). |
| **Cảnh báo (Alerts)** | `GET /inventory/alerts` + `PATCH /admin/alerts/:id/resolve` | Đã có `GET /inventory/alerts` (Khang). Chưa có endpoint resolve alert. | Dùng `GET /inventory/alerts` để tải & khôi phục sau reconnect; kiểm tra bổ sung `PATCH /admin/alerts/:id/resolve` (hoặc gọi `InventoryService`). |

---

## 5. Kế hoạch triển khai Phase 1 — Task 30 (Theo thứ tự ưu tiên)

1. **Bước 1 — Chốt hợp đồng & Backend còn thiếu (`backend/src/admin/`):**
   - Tạo `AdminAnalyticsController` + `AdminAnalyticsService` (`GET /admin/analytics/summary`, `GET /admin/analytics/revenue-series`, `@Roles(UserRole.ADMIN)`).
   - Cung cấp API đọc danh sách & chi tiết đơn hàng cho Admin/Staff (`GET /admin/orders`, `GET /admin/orders/:id`) và đảm bảo `PATCH /admin/orders/:id/status` (hoặc `/orders/admin/:id/status`) cho phép cả `ADMIN` và `WAREHOUSE_STAFF`.
   - Dọn bỏ mock trong `AdminInventoryService` hoặc chuyển hẳn sang dùng `InventoryService` thật.
   - Bổ sung `PATCH /admin/alerts/:id/resolve` nếu cần nút "Đã xử lý" trên trang Alerts.
2. **Bước 2 — API Client & Hooks Frontend:**
   - Rà soát `authenticatedRequest` (xử lý 401 refresh + retry 1 lần, xử lý 403).
   - Tạo mới **`frontend/hooks/useInventoryRealtime.ts`** kết nối Socket.IO namespace `/notifications` với `auth: { token }`, tự reconnect (exponential backoff + jitter), lắng nghe `low_stock_alert`, refetch `GET /inventory/alerts` & `GET /inventory` khi (re)connect, khử trùng lặp và cleanup chuẩn React StrictMode.
   - Viết lại **`useAdminOrders.ts`** nối API thật (lọc, phân trang, chi tiết, đổi trạng thái + xử lý lỗi 409).
   - Viết lại **`useAdminAnalytics.ts`** nối `GET /admin/analytics/summary` và `revenue-series`.
   - Cập nhật **`useAdminInventory.ts`** và **`useStockAlerts.ts`** bỏ hoàn toàn fallback mock, tải danh sách kho (`/warehouses`) và danh mục (`/categories`) thật, hiển thị lỗi + nút "Tải lại".
3. **Bước 3 — Ghép từng trang & Loại bỏ Mock:**
   - Ghép `DashboardView`, `app/admin/inventory/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/alerts/page.tsx` (và `staff/*`).
   - Xóa `adminMock.ts`, `adminInventoryMock.ts` khỏi luồng Admin; `git grep` xác nhận sạch mock.
4. **Bước 4 — Kiểm thử & Tài liệu (Phần B):**
   - Viết unit/integration test Jest + supertest cho RBAC (401/403), FR-ORD-05 (409/404/history), FR-DASH-02 (422/Decimal string).
   - Đối soát SQL trực tiếp trên PostgreSQL (mục B5).
   - Kiểm thử responsive 3 viewport (360/768/1280) và đo độ trễ realtime.
   - Cập nhật `docs/api/admin-api-contract.yaml` (OpenAPI) và xuất `docs/verification/triet-report.md`.

---

## 6. Các điểm cần Triết xác nhận trước khi code (Mục A7 & A6.2)

1. **Ranh giới `AdminAnalyticsService` (A6.2):** Có thể đọc tổng hợp qua `PrismaService` với vai trò read-model chỉ đọc (hướng b — nhanh nhất trước 15/11) hay bắt buộc phải nhờ Huy/Khang thêm hàm thống kê công khai trong `OrdersService`/`InventoryService` (hướng a)?
2. **Quyền sửa tồn kho của `WAREHOUSE_STAFF` (A7 #1):** Hiện `InventoryController` của Khang chỉ cho `ADMIN` gọi `PUT /inventory/:id` và `POST /inventory/:id/restock` (`STAFF` chỉ xem). Giữ nguyên quy tắc này đúng không?
3. **Mốc thời gian tính doanh thu (A7 #3):** Tính theo `created_at` (khớp `idx_orders_status_time`) hay `confirmed_at`? *(Gợi ý: `created_at` để nhất quán giữa summary và chart).*
4. **Mốc đếm `expiredReservations` (A7 #4):** Đếm `stock_reservations` có `status = 'EXPIRED'` theo `released_at` (hoặc `updated_at`) trong khoảng `fromDate..toDate`?
5. **Quyền `WAREHOUSE_STAFF` đổi trạng thái đơn (`Orders`):** Hiện `backend/src/orders/admin-orders.controller.ts` của Huy đang khóa `@Roles(UserRole.ADMIN)`. Triết đồng ý để mình mở thêm `UserRole.WAREHOUSE_STAFF` (hoặc tạo endpoint tại `AdminOrdersController` trong `AdminModule` gọi `OrdersService.changeStatus`) và ghi rõ ngoại lệ này theo quy tắc A0.2 không?
6. **Phạm vi Products/Warehouses (A7 #7):** `ManageProducts.tsx` và `ManageCategories.tsx` có nằm trong phần phải ghép API thật ngay đợt này không, hay ưu tiên 4 trang chính (`Dashboard`, `Inventory`, `Orders`, `Alerts`) trước Code Freeze 15/11?

