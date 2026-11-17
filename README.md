# Hệ Thống Thương Mại Điện Tử & Kiểm Soát Tồn Kho Đa Kho (Multi-Warehouse E-Commerce & Inventory Control System)

Hệ thống thương mại điện tử đa kho hàng (Bắc - Trung - Nam) hỗ trợ định tuyến kho tự động theo khu vực giao hàng, giữ chỗ tồn kho nguyên tử chống bán vượt tồn (`Zero Oversell` với Pessimistic Locking `SELECT ... FOR UPDATE`), cảnh báo tồn kho thấp thời gian thực qua Redis Pub/Sub & Socket.IO, và trợ lý ảo AI Chatbot hỗ trợ RAG (`pgvector`) + Function Calling.

---

## 1. Kiến trúc tổng thể & Công nghệ sử dụng

- **Frontend (`frontend/`)**: Next.js (App Router), TypeScript, Tailwind CSS, Socket.IO Client.
- **Backend (`backend/`)**: NestJS 11, TypeScript, Prisma ORM 7 (`@prisma/adapter-pg`), Passport JWT, Socket.IO Gateway.
- **Cơ sở dữ liệu & Hạ tầng (`docker-compose.yml`)**:
  - **PostgreSQL 16 + `pgvector`** (`ankane/pgvector:v0.5.1`, cổng host `5433 -> 5432`): Lưu trữ dữ liệu giao dịch, ràng buộc `CHECK (stock >= reserved_stock)` và vector embeddings (`vector(1024)`).
  - **Redis 7 Alpine** (`redis:7-alpine`, cổng `6379`): Pub/Sub phát tán sự kiện cảnh báo tồn kho thấp (`inventory.low_stock`) và biến động tồn kho (`inventory.changed`) giữa các instance Backend.
- **AI Chatbot & RAG (`backend/src/chatbot/`)**:
  - Hỗ trợ `Claude` (`@anthropic-ai/sdk`) và `Gemini` (`@google/genai`) với cơ chế fallback tự động.
  - RAG tìm kiếm ngữ nghĩa trên `kb_chunks` (`vector(1024)`) kết hợp bộ công cụ (`searchProducts`, `checkStock`, `getOrderStatus`) có kiểm soát quyền sở hữu đơn hàng (`ownership check`) và lọc các trường nhạy cảm.
- **Kiểm thử chịu tải & Hậu kiểm (`load-tests/`)**:
  - Bộ kịch bản chuẩn hóa tại `load-tests/` (`setup-test-data.ts`, `k6-oversell.js`, `run-concurrency-test.ts`, `verify-oversell.ts`, `oversell-verifier.ts`) xác minh `NFR-04.1` (0 oversell) và `NFR-01` (latency `p95`, `p99`).

---

## 2. Cấu trúc thư mục chính

```text
├── backend/                  # Ứng dụng Backend NestJS
│   ├── prisma/               # Schema Prisma, migrations và seed dữ liệu mẫu
│   ├── reports/              # Báo cáo hậu kiểm NFR-04.1/NFR-01 & Chatbot Eval
│   ├── src/
│   │   ├── admin/alerts/     # API Quản trị cảnh báo tồn kho (GET /admin/alerts, PATCH /:id/resolve)
│   │   ├── auth/             # Xác thực JWT, Refresh Token, RBAC & đổi mật khẩu bắt buộc
│   │   ├── catalog/          # Danh mục, Sản phẩm, Kho hàng
│   │   ├── chatbot/          # AI Chatbot (RAG pgvector, Tools, Eval Harness)
│   │   ├── core/             # Global HttpExceptionFilter (chuẩn hóa Error Envelope), Guards, Decorators
│   │   ├── inventory/        # Quản lý tồn kho, định tuyến đa kho, giữ chỗ & giải phóng TTL, Pub/Sub
│   │   ├── notifications/    # LowStockNotifierService (Cron + Dedup + Upgrade) & NotificationsGateway (Socket.IO)
│   │   └── orders/           # Đặt hàng, hủy đơn, thanh toán & chuyển trạng thái
│   └── test/                 # Kiểm thử E2E (jest-e2e.json) và wrapper load-test
├── frontend/                 # Ứng dụng Frontend Next.js (Storefront & Admin Portal)
├── load-tests/               # Bộ công cụ kiểm thử chịu tải k6 / Node Concurrency & hậu kiểm Zero Oversell
├── docs/                     # Tài liệu kiến trúc (SoDoHeThong.drawio), hướng dẫn kỹ thuật & Checklist Release
└── docker-compose.yml        # Cấu hình khởi chạy PostgreSQL (pgvector), Redis, Backend, Frontend
```

---

## 3. Hướng dẫn cài đặt & Khởi chạy nhanh

### Bước 1: Chuẩn bị biến môi trường

Sao chép file `.env.example` thành `.env` ở thư mục gốc:

```bash
cp .env.example .env
```

Các biến môi trường quan trọng trong `.env`:

- `DATABASE_URL`: Chuỗi kết nối PostgreSQL (`postgresql://postgres:123456@localhost:5433/multi_warehouse_db?schema=public`).
- `REDIS_HOST`, `REDIS_PORT`: Địa chỉ Redis phục vụ Pub/Sub (`localhost`, `6379`).
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: Khóa bí mật ký JWT.
- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`: Khóa API cho Chatbot LLM & Embedding (hệ thống tự động chuyển sang deterministic fallback nếu chạy local không cấu hình khóa).

### Bước 2: Khởi động PostgreSQL (`pgvector`) và Redis bằng Docker

```bash
docker compose up -d postgres redis
```

### Bước 3: Cài đặt phụ thuộc, chạy Migration & Seed dữ liệu Backend

```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma db seed
npm run sync:kb
npm run start:dev
```

Backend mặc định lắng nghe tại `http://localhost:3001`.

### Bước 4: Khởi chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định lắng nghe tại `http://localhost:3000`.

---

## 4. Các lệnh kiểm thử & Đánh giá chất lượng

Chạy từ thư mục `backend/`:

| Mục đích                                          | Lệnh thực thi           |
| :------------------------------------------------ | :---------------------- |
| Chạy toàn bộ Unit Test                            | `npm test`              |
| Chạy kiểm thử E2E (`inventory-alerts`)            | `npm run test:e2e`      |
| Chạy kiểm thử bộ hậu kiểm Oversell Verifier       | `npm run test:oversell` |
| Đánh giá chất lượng & bảo mật AI Chatbot (20 ca)  | `npm run eval:chatbot`  |
| Chạy trọn bộ Concurrency Smoke Test & Hậu kiểm DB | `npm run test:load:all` |
| Chạy kiểm thử chịu tải bằng k6 (`p95`, `p99`)     | `npm run test:load:k6`  |
| Kiểm tra Lint & định dạng code                    | `npm run lint`          |

---

## 5. Tài liệu tham khảo nội bộ

- [Hướng dẫn chi tiết Backend NestJS](backend/README.md)
- [Hướng dẫn chạy Load Test & Hậu kiểm NFR-04.1 / NFR-01](load-tests/README.md)
- [Sơ đồ kiến trúc hệ thống (`draw.io`)](docs/architecture/SoDoHeThong.drawio)
- [Danh mục kiểm tra trước phát hành (`Release Checklist`)](docs/release/CHECKLIST.md)
