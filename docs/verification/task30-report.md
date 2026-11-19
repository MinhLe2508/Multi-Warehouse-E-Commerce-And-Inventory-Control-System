# Báo cáo Hoàn thành Task 30 — Ghép API thật & Realtime cho Admin

- **Ngày thực hiện:** 2026-11-12
- **Nhánh Git:** `feature/admin-real-api`
- **Tài liệu Audit liên quan:** `docs/verification/task30-audit.md`, `docs/verification/triet-audit.md`

---

## 1. Bảng tổng hợp ghép API & Hook

| Trang / Hook / Module | API Backend đã ghép | Trạng thái | Bằng chứng |
|---|---|---|---|
| **Backend: `AdminAnalyticsController` & `AdminAnalyticsService`** | `GET /admin/analytics/summary`, `GET /admin/analytics/revenue-series` (ADMIN only, read-only, `fromDate > toDate` → 422, tiền `string`) | **PASS (Unit Test + Build)** | `backend/src/admin/analytics/admin-analytics.controller.ts`<br>`backend/src/admin/analytics/admin-analytics.service.ts`<br>`backend/src/admin/analytics/admin-analytics.service.spec.ts` |
| **Backend: `AdminOrdersGatewayController` & `AdminOrdersQueryService`** | `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status` (ADMIN + STAFF, ủy quyền `OrdersService.changeStatus` trong 1 transaction) | **PASS (Unit Test + Build)** | `backend/src/admin/orders/admin-orders.controller.ts`<br>`backend/src/admin/orders/admin-orders.service.ts`<br>`backend/src/admin/orders/admin-orders.service.spec.ts` |
| **Backend: `AdminInventoryController` & `AdminInventoryService`** | `GET /admin/inventory`, `GET /admin/inventory/summary`, `PATCH /admin/inventory/:id` (Bỏ mock, ủy quyền `InventoryService`) | **PASS (Unit Test + Build)** | `backend/src/admin/inventory/admin-inventory.controller.ts`<br>`backend/src/admin/inventory/admin-inventory.service.ts`<br>`backend/src/admin/inventory/admin-inventory.controller.spec.ts` |
| **Backend: `AdminAlertsController`** | `GET /admin/alerts`, `PATCH /admin/alerts/:id/resolve` | **PASS (Build)** | `backend/src/admin/alerts/admin-alerts.controller.ts` |
| **Frontend: `apiClient`** | `apiGet`, `apiPost`, `apiPut`, `apiPatch` (Bearer JWT, 401 refresh 1 lần + retry, 403 xử lý rõ) | **PASS (Lint + Build)** | `frontend/shared/lib/apiClient.ts` |
| **Frontend: `useInventoryRealtime`** | Socket.IO `/notifications` (`auth: { token }`), `low_stock_alert`, `inventory.changed`, reconnect backoff (1s→30s + jitter), refetch sync khi reconnect, khử trùng lặp, cleanup StrictMode | **PASS (Lint + Build)** | `frontend/hooks/useInventoryRealtime.ts` |
| **Frontend: Trang Inventory (`useAdminInventory` + `app/admin/inventory/page.tsx`)** | `GET /inventory?limit=100`, `PUT /inventory/:id`, `POST /inventory/:id/restock` + WebSocket realtime, bỏ mock | **PASS (Lint + Build)** | `frontend/hooks/useAdminInventory.ts`<br>`frontend/app/admin/inventory/page.tsx` |
| **Frontend: Trang Orders (`useAdminOrders` + `app/admin/orders/page.tsx`)** | `GET /admin/orders`, `PATCH /admin/orders/:id/status`, xử lý 409 + refetch, bỏ mock | **PASS (Lint + Build)** | `frontend/hooks/useAdminOrders.ts`<br>`frontend/app/admin/orders/page.tsx` |
| **Frontend: Trang Alerts (`useStockAlerts` + `app/admin/alerts/page.tsx`)** | `GET /admin/alerts?status=OPEN`, `PATCH /admin/alerts/:id/resolve` + WebSocket realtime, bỏ mock | **PASS (Lint + Build)** | `frontend/hooks/useStockAlerts.ts`<br>`frontend/app/admin/alerts/page.tsx` |
| **Frontend: Trang Dashboard (`useDashboardAnalytics` + `DashboardView.tsx`)** | `GET /admin/analytics/summary`, `GET /admin/analytics/revenue-series`, `GET /admin/inventory/summary`, bỏ mock & số liệu tĩnh | **PASS (Lint + Build)** | `frontend/hooks/useAdminAnalytics.ts`<br>`frontend/components/admin/DashboardView.tsx` |
| **Frontend: `AdminContext`** | `GET /warehouses` thật (bỏ `MOCK_WAREHOUSES`) | **PASS (Lint + Build)** | `frontend/components/admin/AdminContext.tsx` |
| **Gỡ mock (`adminMock.ts`)** | Đã xóa `frontend/shared/mock/adminMock.ts` | **PASS** | `git grep` không còn trang/hook Admin nào import `adminMock` |

---

## 2. Kết quả kiểm tra tự động (Local)

- **`backend` (`npx tsc --noEmit`)**: **PASS** (0 lỗi TypeScript).
- **`backend` (`npm test -- admin --runInBand`)**: **PASS** (3 test suites, 12/12 tests passed).
- **`frontend` (`npm run lint`)**: **PASS** (0 errors, 0 warnings).
- **`frontend` (`npm run build`)**: **PASS** (32/32 pages build thành công).

---

## 3. Các mục kiểm thử E2E / Docker (Chưa chạy — `NOT RUN`)

Do môi trường hiện tại chưa có `.env` và chưa bật Docker Desktop (PostgreSQL 16 + Redis 7), các mục kiểm thử chạy thực tế với DB/Socket đang ở trạng thái **`NOT RUN`** (cần chạy ngay khi bật Docker):

| Mục kiểm thử (Bước 8 / Phần B) | Trạng thái | Ghi chú |
|---|---|---|
| `docker compose up`, `prisma migrate`, `prisma db seed` | **NOT RUN** | Chưa bật Docker Desktop & `.env` |
| Test 4 trang hiển thị dữ liệu seed thật trên trình duyệt | **NOT RUN** | Phụ thuộc Docker + DB |
| Test RBAC E2E (401/403 trên API thật với token JWT thật) | **NOT RUN** | Phụ thuộc Docker + DB |
| Test đổi trạng thái đơn song song (2 request -> 200 & 409) trên PostgreSQL | **NOT RUN** | Phụ thuộc Docker + DB |
| Test WebSocket realtime ≤ 500 ms + tắt/bật backend reconnect sync | **NOT RUN** | Phụ thuộc Docker + Redis + WebSocket |
| SQL đối soát doanh thu B5 trực tiếp trên PostgreSQL | **NOT RUN** | Phụ thuộc Docker + DB |
| Playwright 3 viewport (360/768/1280 px) | **NOT RUN** | Cần chạy sau khi server FE/BE lên |

---

## 4. Lỗi / Giới hạn phát hiện ở module khác (Không tự sửa theo Quy tắc 2)

1. **`backend/src/orders/admin-orders.controller.ts` (Huy):** Đang khóa `@Roles(UserRole.ADMIN)` ở route `PATCH /orders/admin/:id/status` (thiếu `WAREHOUSE_STAFF`) và không có endpoint `GET`. *(AdminModule đã tự cung cấp `/admin/orders` cho cả `ADMIN` và `WAREHOUSE_STAFF`, gọi `OrdersService.changeStatus` nên không cần sửa file của Huy).*
2. **`backend/src/notifications/notifications.gateway.ts` (Minh):** Hàm `emitLowStockAlert` hiện chỉ emit tới `ADMIN_ROOM` (`role:ADMIN`). `WAREHOUSE_STAFF` chưa nhận sự kiện `low_stock_alert` qua WebSocket (nhưng vẫn tự đồng bộ qua polling/refetch `GET /admin/alerts`).
3. **`backend/src/inventory/inventory-pubsub.service.ts` (Khang/Minh):** Hiện mới có kênh `inventory.low_stock`, chưa phát kênh `inventory.changed` khi thay đổi tồn kho không chạm ngưỡng.

---

## 5. Việc còn lại trước Code Freeze (15/11/2026)

1. Copy `.env.example` → `.env`, bật Docker Desktop, chạy `docker compose up -d`, `npx prisma migrate deploy` và `npx prisma db seed`.
2. Chạy toàn bộ checklist Bước 8 + SQL đối soát B5 + Playwright 3 viewport và cập nhật kết quả vào báo cáo.
3. Commit các thay đổi trên nhánh `feature/admin-real-api`, mở Pull Request vào `project`/`main` để nhóm review.

