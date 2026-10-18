# Minh / P5 — Tuần 3: Redis Pub/Sub và ReservationCleanupJob

Nguồn phân công: `Timeline_MultiWarehouse_Ecommerce.xlsx`, `Trang tính1`, dòng 40–47; nhiệm vụ STT 18 tại dòng 46. Tuần 3: 18/10–25/10/2026. Excel đang ghi “Chưa bắt đầu”, ảnh người dùng ghi “Đang thực hiện”; chưa tự sửa trạng thái trong Excel.

## 1. Phần đã thêm

- `backend/src/inventory/inventory-pubsub.service.ts`: hai connection Redis riêng cho publisher và subscriber, kênh `inventory.low_stock`, kiểm tra payload, log khi nhận, đóng kết nối khi backend tắt.
- `backend/src/inventory/reservation-cleanup.job.ts`: cron mỗi phút, có chống chạy chồng trong một process; khóa DB để phối hợp nhiều process.
- `backend/src/inventory/inventory.module.ts`: đăng ký và export Pub/Sub service cho module nghiệp vụ.
- `backend/src/app.module.ts`: bật scheduler và module mới.
- `backend/test/week3.integration.cjs`: test PostgreSQL/Redis thật, chỉ nhận database thử nghiệm rỗng.

Không cần cài thêm package: dự án đã có `ioredis`, `@nestjs/schedule`, Prisma và `pg`.

Các file P5 dùng chung thư mục `backend/src/inventory` đã có trong khung dự án, giữ nguyên `dto/.gitkeep`. Khi ghép InventoryService của P4 và StockReservationService của P3, bổ sung provider vào `InventoryModule` này; không tạo module inventory thứ hai. Thư mục `backend/src/admin/inventory` vẫn phục vụ API quản trị.

## 2. Hiểu đúng luồng hoàn giữ chỗ

Ví dụ stock=10, reserved_stock=5: có reservation 3 sản phẩm hết hạn, 2 sản phẩm chưa hết hạn.

1. Job mở transaction.
2. Chọn inventory có reservation `HOLDING` quá hạn, khóa theo ID tăng dần bằng `FOR UPDATE SKIP LOCKED`.
3. Trên từng inventory, khóa các reservation `HOLDING` có `expires_at <= NOW()`; bỏ qua reservation đang bị transaction khác khóa.
4. Chuyển reservation sang `EXPIRED`, ghi `released_at`.
5. Giảm `reserved_stock` đúng lượng giữ chỗ. Không trừ/cộng `stock`.
6. Ghi `inventory_audit_log`, reason=`EXPIRE`, actor=null, reference trỏ về reservation.
7. Commit. Nếu bất kỳ bước nào lỗi, rollback toàn transaction.

Kết quả: stock=10, reserved_stock=2, available_stock=8. `available_stock` là generated column; trigger DB tăng version. Không tự ghi hai cột này.

Chạy lại không xử lý reservation đã `EXPIRED`, `RELEASED` hoặc `COMMITTED`. Mỗi lượt giới hạn 100 inventory, tối đa 500 reservation mỗi inventory, timeout transaction 30 giây. Khi backlog lớn có thể cần nhiều lượt; nếu thường xuyên timeout cần giảm batch/tách transaction. Log báo lỗi và lượt sau thử lại.

P3/P4 cần thống nhất khóa inventory theo ID tăng dần **trước** khi khóa reservation. Payment/commit cũng phải kiểm tra status và hạn giữ chỗ trong transaction, không dựa vào việc cron đã kịp chạy hay chưa.

## 3. Bước 1 — Chuẩn bị terminal

Mở PowerShell tại repo:

```powershell
cd D:\MinhDangHocCode\CNPM\Project\Multi-Warehouse-E-Commerce-And-Inventory-Control-System
git status --short
```

Tại thời điểm triển khai, `README.md` và `Trong_REVIEW_P1_WEEK2.md` đã bị xóa trong working tree từ trước. Phần P5 không thay đổi hai file này. Khi commit, chỉ stage file P5 như bước cuối.

## 4. Bước 2 — Kiểm tra cấu hình và dịch vụ

Giữ file `.env` hiện tại. Chỉ đối chiếu các biến, không ghi đè bằng `.env.example`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5433/warehouse
REDIS_URL=redis://localhost:6379
```

Đây là ví dụ khi chạy backend trên Windows. Thay USER/PASSWORD/port/database bằng cấu hình của bạn. Backend chạy trong Compose đã dùng `postgres:5432` và `redis:6379` tự động.

```powershell
docker compose up -d postgres redis
docker compose ps
docker compose exec redis redis-cli ping
```

Mong đợi Redis trả `PONG`, PostgreSQL/Redis ở trạng thái healthy.

DB dự án phải đã áp dụng migration tuần 2, đặc biệt migration `20261008012516_manual_constraints_and_functions`. Không chạy reset hoặc seed lại DB đang dùng. Kiểm tra migration trước:

```powershell
cd backend
npx prisma migrate status
```

Nếu migration còn pending, xem migration đó trước khi áp dụng `npx prisma migrate deploy` theo quy trình DB của nhóm. Phần P5 không thêm migration mới.

## 5. Bước 3 — Build và chạy backend

Nếu vừa clone và chưa có `node_modules`, chạy `npm ci`. Với checkout hiện tại đã có dependencies:

```powershell
npm run build
npx eslint src/inventory/*.ts src/app.module.ts
npm run start:dev
```

Chỉ chạy một backend trên cổng 3001: nếu backend Docker đang chạy thì dừng riêng service đó trước khi chạy dev trên Windows. Nếu muốn dùng Docker hoàn toàn, tại repo chạy `docker compose up -d --build backend` rồi `docker compose logs -f backend`.

Mong đợi log `Subscribed to inventory.low_stock`. Đến đầu mỗi phút, cron in `Expired 0 reservation(s)` khi không có gì hết hạn, hoặc số lượng đã xử lý. Nếu Redis không kết nối được lúc khởi động, module báo lỗi và backend không hoàn tất khởi động; sửa URL/dịch vụ rồi chạy lại.

## 6. Bước 4 — Demo nhận sự kiện Redis

Giữ backend chạy. Mở terminal khác tại repo:

```powershell
docker compose exec redis redis-cli
```

Trong Redis CLI, nhập:

```text
PUBLISH inventory.low_stock '{"inventoryId":"1","productId":"demo-product","warehouseId":"demo-warehouse","availableStock":2,"threshold":5}'
```

Redis trả số subscriber đang nhận. Backend phải log:

```text
Low stock: inventory=1, available=2, threshold=5
```

Các ID demo chỉ phục vụ kiểm tra truyền nhận, không truy vấn hay cập nhật DB. Nếu Redis trả 0 thì chưa có subscriber kết nối vào đúng Redis/kênh. Gõ `exit` để thoát CLI.

Để quan sát trực tiếp ở terminal thứ ba:

```powershell
docker compose exec redis redis-cli SUBSCRIBE inventory.low_stock
```

Publish lại và quan sát message. Ctrl+C thoát subscriber.

## 7. Bước 5 — Chạy test cleanup và publisher thật

Test tạo schema từ hai migration gốc nên yêu cầu **database rỗng riêng**, không dùng DATABASE_URL dự án. Lệnh dưới tạo hai container không gắn volume; tên/cổng phải chưa được dùng. Tại repo:

```powershell
docker run -d --rm --name cnpm-week3-pg-test -e POSTGRES_PASSWORD=week3-test-only -p 127.0.0.1:55439:5432 pgvector/pgvector:0.8.6-pg16-bookworm
docker run -d --rm --name cnpm-week3-redis-test -p 127.0.0.1:56379:6379 redis:7-alpine
docker exec cnpm-week3-pg-test pg_isready -U postgres
```

Chờ `accepting connections` rồi chạy:

```powershell
cd backend
npm run build
$env:WEEK3_TEST_DATABASE_URL='postgresql://postgres:week3-test-only@127.0.0.1:55439/postgres'
$env:WEEK3_TEST_REDIS_URL='redis://127.0.0.1:56379'
node --test test/week3.integration.cjs
```

Kết quả đã kiểm tra ngày 18/10/2026: 7/7 test đạt, gồm hai test cha và năm test con:

- Hết hạn đúng reservation, không đổi stock, đúng available, audit trước/sau, chạy lại không xử lý trùng.
- Hai worker chạy đồng thời chỉ giải phóng một lần.
- Inventory đang khóa được bỏ qua, xử lý ở lượt sau.
- Reservation đang khóa được bỏ qua, xử lý ở lượt sau.
- Ghi audit lỗi thì reservation và inventory đều rollback.
- Redis service publish/subscribe thật; từ chối payload không hợp lệ.

Sau khi test, xóa đúng hai container thử bằng cách dừng chúng (`--rm` tự xóa container):

```powershell
docker stop cnpm-week3-pg-test cnpm-week3-redis-test
Remove-Item Env:WEEK3_TEST_DATABASE_URL
Remove-Item Env:WEEK3_TEST_REDIS_URL
```

Muốn chạy lại, tạo container mới từ đầu. Test sẽ chủ động từ chối database đã có bảng. Test gọi trực tiếp phương thức cleanup; bước 3 xác nhận riêng việc cron hoạt động trong ứng dụng đầy đủ.

## 8. Bước 6 — Ghép code với P3/P4 và phần notification

Module muốn publish cần import `InventoryModule`, inject `InventoryPubSubService`, rồi gọi `publishLowStock` sau khi transaction cập nhật tồn kho đã commit:

```typescript
// snapshot lấy từ dữ liệu DB đã commit, không lấy từ giỏ client
if (snapshot.availableStock <= snapshot.threshold) {
  try {
    await this.inventoryPubSub.publishLowStock({
      inventoryId: snapshot.inventoryId.toString(),
      productId: snapshot.productId,
      warehouseId: snapshot.warehouseId,
      availableStock: snapshot.availableStock,
      threshold: snapshot.threshold,
    });
  } catch {
    this.logger.warn('Low-stock publish failed after inventory commit');
  }
}
```

Đây là mẫu tích hợp, chưa phải code đã nối vào service nghiệp vụ. Hiện `AdminInventoryService` dùng dữ liệu memory, Orders vẫn trả 501 và chưa có StockReservationService thật. Không coi việc sửa tồn trên màn hình Admin hiện tại là bằng chứng DB/Redis đã tích hợp.

Subscriber tuần 3 chỉ xác thực cấu trúc và ghi log. Tạo StockAlert/Notification, chống trùng, phân quyền người nhận và đẩy WebSocket cần ghép tiếp với phần tuần 4. Cleanup không tự hủy Order hoặc đổi Payment; luồng này cần P3 phối hợp khi triển khai thanh toán/hết hạn đơn.

Redis Pub/Sub không lưu/replay message: subscriber mất kết nối có thể mất sự kiện. DB/audit vẫn là dữ liệu gốc. Nếu cần đảm bảo gửi thông báo sau commit, bổ sung outbox/queue ở nhiệm vụ liên quan. Tham khảo: https://redis.io/docs/latest/develop/use-cases/pub-sub/ ; PostgreSQL SKIP LOCKED: https://www.postgresql.org/docs/16/sql-select.html .

## 9. Bước 7 — Nghiệm thu và commit

Lưu ảnh/log: Redis PONG, backend subscribe, demo message, kết quả test, cron mỗi phút. Chỉ đánh dấu nghiệm thu P5 sau khi kiểm tra chạy ứng dụng đầy đủ và thống nhất điểm ghép P3/P4. Milestone chống oversell toàn tuần vẫn cần bài tranh mua cuối cùng của P3.

Tại repo, kiểm tra rồi commit nếu kết quả phù hợp:

```powershell
git diff --check
git add backend/src/app.module.ts backend/src/inventory backend/test/week3.integration.cjs docs/p5-week3/README.md
git diff --cached --stat
git commit -m "feat: add week 3 inventory pubsub and reservation cleanup"
```

Bản bàn giao chưa commit/push. Không stage tất cả bằng `git add .` vì đang có thay đổi khác từ trước.

Kiểm tra bổ sung đã đạt: build backend, ESLint trên file P5 và AppModule, `git diff --check`, bộ Jest backend hiện có 81/81 test (7 suite). Các test cần localhost đã chạy ngoài giới hạn sandbox sau khi lần đầu bị EACCES. Chưa chạy ứng dụng đầy đủ để quan sát cron tự kích hoạt theo đồng hồ và chưa nghiệm thu giao diện/checkout.
