# Báo cáo kiểm chứng CSDL & Cron Cleanup Tuần 6 (STT 31 & STT 33 — Huy & Khang)

- **Người thực hiện**: Nguyễn Nhật Huy (P3) & Khang (P4)
- **Phạm vi nhiệm vụ**:
  - **STT 31**: Chạy lại script DDL (`backend/prisma/ddl.sql`) + hàm `fn_reserve_stock` trên PostgreSQL 16.15, xác nhận 0 lỗi; đối chiếu kết quả với mục 9.1–9.4 tài liệu `Thiết kế CSDL và ERD.pdf` (bao gồm ràng buộc đã loại bỏ sau kiểm thử).
  - **STT 33**: Kiểm thử cron `ReservationCleanupJob` (`backend/src/inventory/reservation-cleanup.job.ts`): tính idempotent (chạy lần 2 không trừ `reserved_stock` thêm), hủy đơn quá hạn (`PENDING_PAYMENT -> CANCELLED`, lý do `EXPIRED`), và xác nhận chỉ mục cục bộ `idx_res_cleanup` được sử dụng đúng (`Index Scan`).
- **Kết luận chung**: **ĐẠT (0 lỗi cú pháp / thực thi, 100% tiêu chí mục 9.1–9.4 & STT 31, 33 thỏa mãn)**

## 1. Đối chiếu kết quả tạo Schema & DDL trên PostgreSQL 16.15 (STT 31 — Mục 9.1 & 9.4)

Script `backend/prisma/ddl.sql` (tổng hợp mục 10.1 & 10.2 tài liệu `Thiết kế CSDL và ERD.pdf`) được thực thi với cờ `ON_ERROR_STOP=1` trên PostgreSQL 16.15:

| Đối tượng CSDL | Mục 9.1 tài liệu CSDL & ERD | Kết quả thực thi `ddl.sql` | Kết quả sau 4 Prisma Migrations | Đánh giá & Ghi chú đối chiếu |
|---|---:|---:|---:|---|
| Bảng (`BASE TABLE`) | 18 | 18 | 20 | **Đạt** (Migration 3 & 4 bổ sung `account_action_tokens`, `notifications`) |
| Kiểu `ENUM` | 10 | 10 | 12 | **Đạt** (Migration 3 & 4 bổ sung `AccountActionPurpose`, `NotificationType`) |
| `Index` (`pg_indexes`) | 62 | 62 | 67 | **Đạt** (`ddl.sql`: 18 PK + 11 UNIQUE + 33 `CREATE INDEX` = 62) |
| Ràng buộc `CHECK` | 21 (thiết kế đầu) / 20 (sau mục 9.4) | 20 | 21 | **Đạt** (Đã gỡ `CHECK (expires_at > created_at)` theo mục 9.4; Migration 4 thêm `chk_products_cost_price_non_negative`) |
| Khóa ngoại (`FOREIGN KEY`) | 25 | 25 | 27 | **Đạt** (Khớp toàn bộ `ON DELETE RESTRICT / CASCADE / SET NULL` ở mục 6) |
| Trigger `set_updated_at` | 11 | 11 | 11 | **Đạt** (+ `inventory_bump_version` + `ctrg_reservation_consistency`) |
| Hàm `fn_reserve_stock` | 1 | 1 | 1 | **Đạt** (`(BIGINT, UUID, INTEGER, INTEGER DEFAULT 15) RETURNS BIGINT`) |
| Lỗi cú pháp / thực thi | 0 | 0 | 0 | **Đạt** (`ON_ERROR_STOP=1` hoàn tất 0 lỗi) |

### Đối chiếu Mục 9.4 — Ràng buộc đã loại bỏ sau kiểm thử
- Ràng buộc `CHECK (expires_at > created_at)` trên bảng `stock_reservations` đã được gỡ bỏ hoàn toàn trong cả `backend/prisma/ddl.sql` và `backend/prisma/migrations/20261008012516_manual_constraints_and_functions/migration.sql` (chỉ giữ lại `chk_res_qty_pos CHECK (quantity > 0)`).
- **Ý nghĩa kiểm thử**: Cho phép truyền `p_ttl_minutes < 0` vào `fn_reserve_stock` hoặc cập nhật lùi `expires_at = NOW() - interval '1 minute'` để tạo test fixture cho kịch bản giữ chỗ hết hạn (NFR-04.3 / STT 33) mà không bị CSDL từ chối.

## 2. Kiểm thử tranh mua đơn vị tồn kho cuối cùng với `fn_reserve_stock` (STT 31 — Mục 9.2)

Kịch bản US-301 (Mục 9.2): Sản phẩm `SKU-1001` tại kho `WH-HCM` có `stock = 1, reserved_stock = 0, available_stock = 1`. Hai giao dịch A và B chạy song song cùng gọi `fn_reserve_stock(inv_id, order_id, 1, 15)`:

| Bước kiểm tra | Khách A | Khách B | Kết quả đo được | Đánh giá |
|---|---|---|---|---|
| Khóa dòng tồn kho | `SELECT ... FOR UPDATE` thành công | Phải chờ khóa dòng `inventory` | Tuần tự hóa tại vùng tới hạn | **Đạt** |
| Kiểm tra `available_stock` | `available = 1 >= 1` (hợp lệ) | `available = 0 < 1` (thiếu hàng) | Khách B đọc đúng số liệu sau khi A commit | **Đạt** |
| Kết quả giao dịch | `COMMIT` thành công | Ném `SQLSTATE 23514` (`INSUFFICIENT_STOCK: con 0 can 1`) -> `ROLLBACK` | Đúng 1 đơn giữ được hàng | **Đạt** |
| Trạng thái cuối | 1 bản ghi `HOLDING` | Đơn hàng & giữ chỗ rollback hoàn toàn | `stock = 1, reserved_stock = 1, available_stock = 0`, 0 "reservation ma" | **Đạt** |

## 3. Kiểm thử Cron `ReservationCleanupJob` — Tính Idempotent & `idx_res_cleanup` (STT 33 — Mục 9.3)

Đã cập nhật `backend/src/inventory/reservation-cleanup.job.ts` để:
1. Bước 1 truy vấn trực tiếp trên `stock_reservations` với điều kiện `WHERE r.status = 'HOLDING' AND r.expires_at <= NOW()` để PostgreSQL Planner sử dụng đúng partial index `idx_res_cleanup`.
2. Bước 2 khóa `inventory` theo thứ tự `id` tăng dần (`FOR UPDATE OF i SKIP LOCKED`) và khóa các dòng `stock_reservations` quá hạn (`FOR UPDATE SKIP LOCKED`), chuyển `HOLDING -> EXPIRED`, giảm `reserved_stock`, ghi `inventory_audit_log` (`reason = 'EXPIRE'`, `quantityDelta = 0`).
3. Bước 3 tự động chuyển trạng thái các đơn `PENDING_PAYMENT` đã hết toàn bộ giữ chỗ `HOLDING` sang `CANCELLED` (`cancelled_reason = 'EXPIRED'`, `cancelled_at = NOW()`) kèm bản ghi `order_status_history` (`from_status = 'PENDING_PAYMENT'`, `to_status = 'CANCELLED'`, `actor_id = NULL`, `reason = 'EXPIRED'`).

| Phép kiểm tra (Mục 9.3 & STT 33) | Kỳ vọng | Kết quả đo được | Đánh giá |
|---|---|---|---|
| Giải phóng `reserved_stock` | `1 -> 0` (giữ nguyên `stock = 10`, `available_stock: 9 -> 10`) | `1 -> 0` | **Đạt** |
| Chuyển trạng thái reservation | `HOLDING -> EXPIRED`, gán `released_at` | `EXPIRED` (`released_at IS NOT NULL`) | **Đạt** |
| Chuyển trạng thái đơn hàng | `PENDING_PAYMENT -> CANCELLED`, lý do `EXPIRED` + ghi `order_status_history` | `status = 'CANCELLED'`, `cancelled_reason = 'EXPIRED'` | **Đạt** |
| Tính idempotent (chạy lần 2) | Không trừ `reserved_stock` thêm lần nữa, không ghi trùng audit/history | Trả về `0` (`UPDATE 0 dòng`), `reserved_stock` giữ nguyên `0` | **Đạt** |
| Index được sử dụng | Dùng partial index `idx_res_cleanup` | `Index Scan using idx_res_cleanup on stock_reservations` | **Đạt** |

### Trích xuất kế hoạch thực thi `EXPLAIN (ANALYZE, COSTS OFF)` cho truy vấn quét giữ chỗ quá hạn
```text
Limit (actual time=0.024..0.025 rows=1 loops=1)
  -> Unique (actual time=0.023..0.024 rows=1 loops=1)
       -> Sort (actual time=0.023..0.023 rows=1 loops=1)
            Sort Key: r.inventory_id
            Sort Method: quicksort  Memory: 25kB
            -> Index Scan using idx_res_cleanup on stock_reservations r (actual time=0.015..0.016 rows=1 loops=1)
                 Index Cond: (expires_at <= now())
```
*(Nhờ mệnh đề `WHERE status = 'HOLDING'` của partial index `idx_res_cleanup`, PostgreSQL chỉ quét các dòng đang `HOLDING` có `expires_at <= NOW()` và bỏ qua toàn bộ hàng trăm/hàng triệu bản ghi lịch sử `COMMITTED` / `EXPIRED` / `RELEASED`).*
