# Danh Mục Kiểm Tra Trước Phát Hành (Release Checklist — F139)

Tài liệu này dùng để kiểm tra và xác nhận toàn bộ các tiêu chí kỹ thuật, bảo mật và hiệu năng của hệ thống **Multi-Warehouse E-Commerce & Inventory Control System** trước khi bàn giao hoặc triển khai.

---

## 1. Cơ sở dữ liệu & Hạ tầng (`Docker & Prisma`)

- [x] Container `postgres` dùng image `ankane/pgvector:v0.5.1` đã bật extension `vector` và ánh xạ cổng `5433:5432` khớp với `.env.example`.
- [x] Container `redis` (`redis:7-alpine`) hoạt động ổn định và kết nối thành công với `InventoryPubSubService`.
- [x] Chạy `npx prisma migrate deploy` thành công, đầy đủ các ràng buộc toàn vẹn:
  - `CHECK (stock >= reserved_stock)` và `CHECK (stock >= 0)` trên bảng `inventory`.
  - Unique partial index `uq_alerts_one_open_per_inventory` đảm bảo mỗi dòng tồn kho chỉ có tối đa 1 cảnh báo `OPEN` tại một thời điểm.
  - Cột `embedding vector(1024)` trên bảng `kb_chunks`.

---

## 2. Chuẩn hóa Phản hồi Lỗi & Bảo mật API (`F005`, `F006`, `F205`, `F206`)

- [x] `HttpExceptionFilter` trả về đúng cấu trúc Error Envelope `{ statusCode, error, code, message, path, timestamp }`.
- [x] Bảo toàn các mã lỗi nghiệp vụ `4xx` (`INSUFFICIENT_STOCK`, `RESERVATION_EXPIRED`, `PASSWORD_CHANGE_REQUIRED`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`) và không làm rò rỉ các thuộc tính nội bộ.
- [x] Các lỗi `5xx` luôn trả về `code: "INTERNAL_ERROR"` và thông điệp an toàn, không lộ stack trace hay câu lệnh SQL.
- [x] Endpoint `GET /admin/alerts` dùng `QueryAdminAlertsDto` chặn các tham số không hợp lệ (`limit=NaN`, `warehouseId` sai định dạng UUID, `status` lạ) với mã `400 VALIDATION_ERROR`.
- [x] Endpoint `PATCH /admin/alerts/:id/resolve` kiểm tra định dạng số nguyên dương hợp lệ trước khi ép kiểu `BigInt` và xử lý idempotent (`alreadyResolved: true/false`).

---

## 3. Cảnh báo Tồn kho & Thông báo Thời gian thực (`F073`–`F077`, `F118`, `F121`)

- [x] `LowStockNotifierService` sử dụng khóa tư vấn giao dịch (`pg_try_advisory_xact_lock`) và tạo thông báo theo lô, chống trùng lặp theo `(userId, alertId, alertLevel)`.
- [x] Cho phép nâng cấp thông báo từ `WARNING` (`availableStock > 0`) lên `CRITICAL` (`availableStock <= 0`) trên cùng một `StockAlert` đang mở.
- [x] `NotificationsGateway` xác thực JWT khi kết nối, từ chối tài khoản bị khóa (`!isActive`) hoặc bắt buộc đổi mật khẩu (`mustChangePassword`), và tự động ngắt kết nối khi JWT hết hạn.
- [x] Bộ kiểm thử tích hợp `npm run test:e2e` (`backend/test/e2e/inventory-alerts.e2e-spec.ts`) đạt `PASS 100%`.

---

## 4. AI Chatbot, RAG & Kiểm thử An toàn (`F086`–`F104`, `F219`)

- [x] `npm run sync:kb` đồng bộ tài liệu chính sách vào `kb_documents` và `kb_chunks` (`vector(1024)`) một cách nguyên tử.
- [x] `ChatbotToolsService` kiểm tra chặt chẽ quyền sở hữu đơn hàng (`order.userId === currentUser.userId`) và loại bỏ các trường nội bộ nhạy cảm trước khi trả dữ liệu cho LLM.
- [x] `ChatbotService` không cho phép mạo danh role `system` trong lịch sử hội thoại, không ghép nối các mã đơn hàng bị từ chối vào truy vấn RAG, và xử lý câu hỏi nối tiếp (`"đơn đó"`, `"sản phẩm này"`) không bịa thông tin.
- [x] Chạy `npm run eval:chatbot` đạt **95.0% (19/20 ca)** (>= ngưỡng 80%), **100% (8/8) ca bẫy bảo mật**, và **0 rò rỉ dữ liệu nhạy cảm**.

---

## 5. Kiểm thử Chịu tải & Hậu kiểm Chống Bán vượt tồn (`F110`–`F114`, `F208`–`F218`)

- [x] `setup-test-data.ts` chỉ dọn dẹp dữ liệu gắn với sản phẩm thử nghiệm (`SKU-K6-OVERSELL-001`), không xóa nhầm đơn hàng hỗn hợp của sản phẩm khác.
- [x] `k6-oversell.js` và `run-concurrency-test.ts` tách riêng độ trễ của đơn thành công (`201`) và đơn bị từ chối hết hàng (`409`), gắn `runId`, `gitCommit` và loại `runner`.
- [x] `oversell-verifier.ts` hậu kiểm nghiêm ngặt `NFR-04.1` (`0 oversell`, `stock >= reserved_stock`, khớp số lượng đơn thành công và giữ chỗ `HOLDING`) và `NFR-01` (`p95 <= 500ms`, `p99 <= 1000ms`), trả mã thoát khác `0` nếu vi phạm.
- [x] Toàn bộ `npm test`, `npm run test:oversell`, `npm run test:e2e`, `npm run lint` và `npm run build` đều thực thi thành công với `0 errors`.
