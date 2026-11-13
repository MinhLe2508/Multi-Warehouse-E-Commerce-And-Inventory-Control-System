# Huy & Khang - Tuần 6 (STT 31, 33)

## Nội dung đã hoàn thành

### 1. STT 31 — Chạy lại script DDL + hàm `fn_reserve_stock` trên PostgreSQL 16.15 & đối chiếu mục 9.1–9.4
- Bổ sung file script DDL chuẩn độc lập tại `backend/prisma/ddl.sql` (tổng hợp đầy đủ Mục 10.1 & 10.2 tài liệu `Thiết kế CSDL và ERD.pdf`):
  - **18 bảng** (`BASE TABLE`), **10 kiểu `ENUM`**, **25 khóa ngoại** (`FOREIGN KEY`), **62 `Index`** (18 `PRIMARY KEY` + 11 `UNIQUE` constraint + 33 `CREATE [UNIQUE] INDEX`), **11 trigger `set_updated_at`** + trigger `inventory_bump_version` + constraint trigger `ctrg_reservation_consistency` (`DEFERRABLE INITIALLY DEFERRED`).
  - **20 ràng buộc `CHECK`** thực tế trong `ddl.sql` (đối chiếu Mục 9.1 ghi 21 ràng buộc thiết kế ban đầu và Mục 9.4 giải thích việc loại bỏ 1 ràng buộc `CHECK (expires_at > created_at)` trên bảng `stock_reservations` để hỗ trợ tạo test fixture hết hạn cho NFR-04.3; sau khi chạy đủ 4 Prisma migrations có thêm `chk_products_cost_price_non_negative` nâng tổng số `CHECK` trong CSDL vận hành lên 21).
  - Hàm `fn_reserve_stock(p_inventory_id BIGINT, p_order_id UUID, p_quantity INTEGER, p_ttl_minutes INTEGER DEFAULT 15) RETURNS BIGINT` khóa dòng `SELECT available_stock ... FOR UPDATE`, kiểm tra `INVENTORY_NOT_FOUND` (`P0002`) và `INSUFFICIENT_STOCK` (`23514`), cộng `reserved_stock` và chèn bản ghi `HOLDING` vào `stock_reservations`, triệt tiêu hoàn toàn lỗi "reservation ma" (Mục 9.2).

### 2. STT 33 — Hoàn thiện & kiểm thử cron `ReservationCleanupJob` (tính idempotent & `Index Scan using idx_res_cleanup`)
- Cập nhật `backend/src/inventory/reservation-cleanup.job.ts`:
  - **Sử dụng đúng partial index `idx_res_cleanup`**: Bước 1 lọc trực tiếp trên `stock_reservations` với điều kiện `WHERE r.status = 'HOLDING' AND r.expires_at <= NOW()` để PostgreSQL Planner sử dụng `Index Scan using idx_res_cleanup` thay vì quét qua toàn bộ `inventory`.Khi không có giữ chỗ hết hạn, job thoát ngay với chi phí gần bằng 0.
  - **Chống deadlock & chia tải đa instance**: Bước 2 khóa các dòng `inventory` theo `id` tăng dần (`FOR UPDATE OF i SKIP LOCKED`), sau đó khóa các dòng `stock_reservations` quá hạn theo `id` tăng dần (`FOR UPDATE SKIP LOCKED`), chuyển trạng thái `HOLDING -> EXPIRED`, giảm `reserved_stock`, và ghi `inventory_audit_log` (`reason = 'EXPIRE'`, `quantityDelta = 0`).
  - **Tự động hủy đơn quá hạn (khớp Mục 9.3 & 10.2)**: Bước 3 chuyển các đơn hàng `PENDING_PAYMENT` đã hết toàn bộ giữ chỗ `HOLDING` sang trạng thái `CANCELLED` (`cancelledReason = 'EXPIRED'`, `cancelledAt = NOW()`) với `FOR UPDATE OF o SKIP LOCKED` và ghi vết vào `order_status_history` (`fromStatus = 'PENDING_PAYMENT'`, `toStatus = 'CANCELLED'`, `actorId = null`, `reason = 'EXPIRED'`).
  - **Tính idempotent**: Chạy `cleanupExpired()` lần thứ 2 trên cùng dữ liệu trả về `0`, không trừ `reserved_stock` thêm lần nữa, không tạo bản ghi audit hay lịch sử trạng thái trùng lặp.
  - Khởi tạo mặc định `@Optional() alertService = new InventoryAlertService()` để tương thích cả khi chạy qua NestJS DI lẫn khi khởi tạo trực tiếp `new ReservationCleanupJob(prisma)` trong script test.
- Bổ sung bộ unit test Jest `backend/src/inventory/reservation-cleanup.job.spec.ts` (kiểm thử đầy đủ STT 31 & STT 33 khi chạy `npm test`).
- Cập nhật `backend/test/week3.integration.cjs` (đồng bộ `quantity_delta: 0` theo quy ước D09) và bổ sung bộ kiểm thử tích hợp `backend/test/week6-huy-khang.integration.cjs` cùng báo cáo nghiệm thu `backend/reports/week6-db-verify/latest.md`.

## Danh sách file thay đổi / bổ sung trong gói ZIP

| Đường dẫn file | Trạng thái | Mô tả |
|---|---|---|
| `backend/prisma/ddl.sql` | Mới | Script DDL PostgreSQL 16.15 đầy đủ + `fn_reserve_stock` + trigger bất biến (Mục 10.1 & 10.2) |
| `backend/src/inventory/reservation-cleanup.job.ts` | Sửa | Tối ưu quét `idx_res_cleanup`, tự hủy đơn `PENDING_PAYMENT -> CANCELLED (EXPIRED)` + ghi `order_status_history`, đảm bảo idempotent |
| `backend/src/inventory/reservation-cleanup.job.spec.ts` | Mới | Unit test Jest cho `ReservationCleanupJob` (STT 33) và kiểm chứng cấu trúc DDL mục 9.1–9.4 (STT 31) |
| `backend/test/week3.integration.cjs` | Sửa | Đồng bộ kỳ vọng `quantity_delta: 0` với quy ước D09 |
| `backend/test/week6-huy-khang.integration.cjs` | Mới | Kiểm thử tích hợp STT 31 & STT 33 (chạy cả chế độ tĩnh và chế độ PostgreSQL 16.15 thật kèm `EXPLAIN ANALYZE`) |
| `backend/reports/week6-db-verify/latest.md` | Mới | Báo cáo kết quả kiểm chứng mục 9.1–9.4, `fn_reserve_stock`, tính idempotent và `Index Scan using idx_res_cleanup` |
| `docs/huy-khang-week6/README.md` | Mới | Tài liệu hướng dẫn chạy kiểm thử và lệnh commit bàn giao Tuần 6 của Huy & Khang |

## Cách chạy và kiểm tra

### 1. Kiểm tra Unit Test (Jest) + Build + Lint (không cần DB đang chạy)
Từ thư mục `backend`:
```powershell
npx prisma generate
npx eslint "src/inventory/reservation-cleanup.job.ts" "src/inventory/reservation-cleanup.job.spec.ts"
npx jest src/inventory/reservation-cleanup.job.spec.ts --runInBand
node --test test/week6-huy-khang.integration.cjs
npm run build
```

### 2. Kiểm tra thực tế trên PostgreSQL 16.15 (Docker container rỗng)
Tại thư mục gốc dự án (PowerShell):
```powershell
docker run -d --rm --name cnpm-week6-pg-test -e POSTGRES_PASSWORD=week6-test-only -p 127.0.0.1:55439:5432 pgvector/pgvector:0.8.6-pg16-bookworm
docker exec cnpm-week6-pg-test pg_isready -U postgres

cd backend
npm run build
$env:WEEK6_TEST_DATABASE_URL='postgresql://postgres:week6-test-only@127.0.0.1:55439/postgres'
node --test test/week6-huy-khang.integration.cjs

docker stop cnpm-week6-pg-test
Remove-Item Env:WEEK6_TEST_DATABASE_URL -ErrorAction SilentlyContinue
```

Hoặc chạy trực tiếp file `ddl.sql` trên container PostgreSQL 16.15 bằng `psql`:
```powershell
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U warehouse -d postgres -c "DROP DATABASE IF EXISTS ddl_verify_w6; CREATE DATABASE ddl_verify_w6;"
Get-Content backend/prisma/ddl.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U warehouse -d ddl_verify_w6
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U warehouse -d postgres -c "DROP DATABASE IF EXISTS ddl_verify_w6;"
```

## Lệnh Git Commit gợi ý
Tại thư mục gốc dự án:
```powershell
git add backend/prisma/ddl.sql backend/src/inventory/reservation-cleanup.job.ts backend/src/inventory/reservation-cleanup.job.spec.ts backend/test/week3.integration.cjs backend/test/week6-huy-khang.integration.cjs backend/reports/week6-db-verify/latest.md docs/huy-khang-week6/README.md
git diff --cached --check
git diff --cached --stat
git commit -m "[Huy & Khang] - Hoàn thành kiểm chứng DDL fn_reserve_stock và kiểm thử ReservationCleanupJob tuần 6 (STT 31, 33)"
git pull --rebase origin project
git push origin project
```
