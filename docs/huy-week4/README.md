# Huy - Tuần 4 (STT 19, 20)

## Đã thêm
- `POST /orders` (CUSTOMER): tạo đơn + chọn kho + `order_items` snapshot giá + giữ chỗ TTL 15 phút bằng `fn_reserve_stock`, tất cả bên trong **một Prisma transaction**. Khóa inventory theo id tăng dần trước insert order_items, trả 409 nếu hết tồn.
- `POST /payments/mock/:orderId` (CUSTOMER): thanh toán giả lập `MOCK_CARD` / `MOCK_EWALLET`; thành công chuyển HOLDING -> COMMITTED, trừ stock và cập nhật Order CONFIRMED trong transaction; thất bại ghi Payment FAILED nhưng để order PENDING_PAYMENT để có thể thử giao dịch mới. Có UNIQUE transaction_ref (đã có trong schema) và trả `duplicate: true` khi gửi lại cùng giao dịch.
- `order_status_history`: ghi lúc tạo đơn (`null -> PENDING_PAYMENT`) và xác nhận thanh toán (`PENDING_PAYMENT -> CONFIRMED`).
- `GET /orders/:id` (CUSTOMER): chỉ đọc đơn của người dùng đang đăng nhập, có lịch sử trạng thái.

## Cách chạy và kiểm tra
Từ `backend`: `npm ci`, cấu hình `DATABASE_URL` Postgres, `npx prisma generate`, chạy migrations hiện có, `npm run build`, `npm test -- --runInBand`, `npm run start:dev`.

1. Đăng nhập CUSTOMER lấy Bearer token, đảm bảo kho active có stock.
2. `POST /orders` body ví dụ:
```json
{"items":[{"productId":"<UUID_SAN_PHAM>","quantity":1}],"shippingRecipient":"Nguyen Van A","shippingPhone":"0900000000","shippingAddress":"TP HCM"}
```
3. Lấy `id` đơn, gửi `POST /payments/mock/<id>`:
```json
{"transactionRef":"HUY-W4-DEMO-0001","method":"MOCK_CARD","approved":true}
```
4. Gửi lại chính xác request tại bước 3: `duplicate: true`, không trừ kho lần 2. Kiểm tra `GET /orders/<id>` và `order_status_history`.
5. Thử giao dịch với đơn khác dùng lại transactionRef để thấy 409; thử tạo đơn với quantity vượt stock để thấy 409 và không tồn tại order dang dở.

## Ranh giới và lưu ý tích hợp
- Đường dẫn mock này **chỉ dùng môi trường demo/thử nghiệm**, không được triển khai production: `approved` do request cung cấp, không phải chữ ký xác thực của cổng thanh toán thực.
- `POST /orders` không có khóa idempotency (contract API hiện có cũng nêu rõ); không tự retry request khi timeout.
- Chưa có endpoint chuyển SHIPPING/DELIVERED hoặc hủy; những chuyển trạng thái tương lai phải ghi thêm `order_status_history` cùng transaction.
- Chưa chạy được bài kiểm tra tích hợp PostgreSQL trong môi trường xuất ZIP; kiểm thử với DB đã migrate là cần thiết trước merge.
- ZIP chỉ có các file mới và các file chỉnh sửa của Huy để chép đè theo đúng đường dẫn dự án.
