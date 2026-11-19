# Backend NestJS — Multi-Warehouse E-Commerce & Inventory Control

Dịch vụ Backend cung cấp RESTful API và cổng thời gian thực (`Socket.IO` trên namespace `/notifications`) cho hệ thống Thương mại điện tử & Kiểm soát tồn kho đa kho.

---

## 1. Các phân hệ cốt lõi

1. **Chuẩn hóa phản hồi lỗi (`src/core/filters/http-exception.filter.ts`)**:
   - Mọi lỗi HTTP đều trả về cấu trúc Error Envelope thống nhất: `{ statusCode, error, code, message, path, timestamp }`.
   - Bảo toàn mã lỗi nghiệp vụ `4xx` (`INSUFFICIENT_STOCK`, `RESERVATION_EXPIRED`, `PASSWORD_CHANGE_REQUIRED`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`) và ẩn chi tiết nhạy cảm đối với lỗi `5xx` (`INTERNAL_ERROR`).
2. **Định tuyến đa kho & Giữ chỗ chống Oversell (`src/inventory/`)**:
   - Khóa bi quan (`SELECT ... FOR UPDATE` theo thứ tự khóa cố định tránh deadlock) kết hợp ràng buộc cơ sở dữ liệu `CHECK (stock >= reserved_stock)`.
   - Cronjob giải phóng giữ chỗ quá hạn (`ReservationReleaseService`) và đối soát tồn kho định kỳ (`InventoryReconciliationService`).
3. **Cảnh báo tồn kho thấp & Thông báo thời gian thực (`src/admin/alerts/`, `src/notifications/`)**:
   - `AdminAlertsController`:
     - `GET /admin/alerts`: Hỗ trợ lọc theo `status` (`OPEN` / `RESOLVED`), `warehouseId` (UUID), `limit`, `offset`, trả kèm thống kê `summary` (`openCount`, `criticalCount`, `warningCount`) và các trường phẳng (`productId`, `productSku`, `warehouseId`, `warehouseCode`).
     - `PATCH /admin/alerts/:id/resolve`: Đóng cảnh báo thủ công một cách an toàn (idempotent, trả cờ `alreadyResolved`).
   - `LowStockNotifierService`: Quét cảnh báo mở theo lô, chống tạo thông báo trùng theo `(userId, alertId, alertLevel)` nhưng cho phép nâng cấp cảnh báo từ `WARNING` lên `CRITICAL` khi tồn khả dụng giảm về `<= 0`.
   - `NotificationsGateway`: Xác thực JWT khi bắt tay WebSocket, kiểm tra `isActive` và `mustChangePassword`, tự động ngắt kết nối khi token hết hạn.
4. **AI Chatbot hỗ trợ RAG & Function Calling (`src/chatbot/`)**:
   - `KnowledgeBaseService` & `RetrievalService`: Cắt nhỏ tài liệu chính sách (`text-chunker.ts`), sinh vector `1024` chiều và truy vấn tương đồng Cosine trên `pgvector`.
   - `ChatbotToolsService`: Cung cấp 3 công cụ an toàn (`searchProducts`, `checkStock`, `getOrderStatus`). Tự động kiểm tra quyền sở hữu đơn hàng theo `userId` từ JWT và loại bỏ các trường nội bộ.
   - `chatbot-eval.ts`: Bộ khung chấm điểm tự động 20 kịch bản (FAQ chính sách, tra cứu sản phẩm/tồn kho, tra cứu đơn hàng và 8 kịch bản tấn công/bẫy bảo mật).

---

## 2. Danh mục Script (`package.json`)

```bash
# Phát triển & Biên dịch
npm run start:dev          # Chạy server ở chế độ watch (cổng 3001)
npm run build              # Biên dịch TypeScript sang thư mục dist/
npm run start:prod         # Chạy bản build production

# Đồng bộ tri thức & Đánh giá Chatbot
npm run sync:kb            # Đồng bộ tài liệu chính sách vào bảng kb_documents / kb_chunks
npm run eval:chatbot       # Chạy 20 ca đánh giá Chatbot và xuất báo cáo ra reports/chatbot-eval/

# Kiểm thử tự động
npm test                   # Chạy toàn bộ Unit Test trong src/**/*.spec.ts
npm run test:e2e           # Chạy kiểm thử tích hợp E2E (test/jest-e2e.json)
npm run test:oversell      # Chạy unit test cho bộ hậu kiểm oversell-verifier

# Kiểm thử chịu tải (Load Testing)
npm run test:load:setup    # Khởi tạo dữ liệu mẫu (sản phẩm, kho, 200 JWT khách hàng)
npm run test:load:run      # Chạy bài kiểm thử đồng thời bằng Node Concurrency Runner
npm run test:load:k6       # Chạy bài kiểm thử chịu tải bằng k6 (xuất p95, p99)
npm run test:load:verify   # Đối soát DB và sinh báo cáo NFR-04.1-NFR-01-OVERSELL-REPORT.md
npm run test:load:all      # Thực thi tuần tự: setup -> run -> verify
```

---

## 3. Báo cáo kỹ thuật đầu ra

- Báo cáo kiểm thử chịu tải & chống bán vượt tồn: `backend/reports/NFR-04.1-NFR-01-OVERSELL-REPORT.md`
- Báo cáo đánh giá độ chính xác & an toàn Chatbot: `backend/reports/chatbot-eval/latest.md` và `backend/reports/chatbot-eval/latest.json`
