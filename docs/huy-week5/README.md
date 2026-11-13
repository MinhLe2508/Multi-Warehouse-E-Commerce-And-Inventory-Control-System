# Huy - Tuần 5 (STT 29)

## Đã thêm
`GET /internal/orders/:userId` — Internal API để Chatbot tra cứu đơn hàng (FR-BOT-03), chỉ trả đơn của **chính người đang hỏi**.

| Lớp bảo vệ | Hành vi |
| --- | --- |
| `JwtAuthGuard` | Xác minh chữ ký/hạn token; không có token → 401 |
| `PasswordChangedGuard` | Chưa đổi mật khẩu lần đầu → 403 `PASSWORD_CHANGE_REQUIRED` |
| `RolesGuard` (chỉ `CUSTOMER`) | ADMIN / WAREHOUSE_STAFF → 403 |
| So khớp `:userId` với JWT | Khác nhau → 403, **không truy vấn DB** |
| Service | Luôn `WHERE user_id = <userId từ JWT>`; đơn của người khác → 404 y hệt đơn không tồn tại |
| Allow-list cột | Không trả tên/SĐT/địa chỉ nhận hàng, `inventoryId`, `warehouseId`, `actorId`, ghi chú nội bộ |

Query (tùy chọn): `orderCode` (dạng `ORD-...`, tự chuẩn hóa chữ hoa) và `limit` (1–5, mặc định 3).
Tham số lạ (kể cả `?userId=`) → 400 do `forbidNonWhitelisted`.

Response 200:
```json
{
  "orders": [{
    "orderCode": "ORD-1A2B3C4D5E6F7A8B9C0D",
    "status": "CONFIRMED", "statusLabel": "Đã xác nhận",
    "subtotal": "200000.00", "discountTotal": "0.00", "shippingFee": "0.00", "grandTotal": "200000.00",
    "currency": "VND", "shippingRegion": "Miền Nam", "cancelledReason": null,
    "createdAt": "...", "confirmedAt": "...", "cancelledAt": null, "lastStatusChangeAt": "...",
    "items": [{ "productName": "...", "sku": "...", "quantity": 2, "unitPrice": "100000.00", "discountAmount": "0.00", "lineTotal": "200000.00" }],
    "statusHistory": [{ "fromStatus": "PENDING_PAYMENT", "toStatus": "CONFIRMED", "at": "..." }]
  }]
}
```
Chưa có đơn nào → `{ "orders": [] }`. Có `orderCode` nhưng không phải đơn của mình → 404.

## File
- Mới: `internal-orders.controller.ts`, `internal-orders.service.ts`, `dto/internal-order-query.dto.ts`, `internal-orders.spec.ts`
- Sửa: `orders.module.ts` (đăng ký controller + service; export `InternalOrdersService` để module khác dùng)
- Không đụng schema, migration, `.env`, package.json.

## Cách chạy
Từ `backend`:
```
npm ci
npx prisma generate
npm run build
npx jest src/orders          # test STT 29 + các test orders cũ
npm run start:dev
```
Kiểm tra thủ công (PowerShell): đăng nhập CUSTOMER lấy `accessToken` và `userId`, đã có ít nhất 1 đơn (xem huy-week4).
```
$h = @{ Authorization = "Bearer <accessToken>" }
Invoke-RestMethod "http://localhost:3001/internal/orders/<userId>" -Headers $h
Invoke-RestMethod "http://localhost:3001/internal/orders/<userId>?limit=1" -Headers $h
Invoke-RestMethod "http://localhost:3001/internal/orders/<userId>?orderCode=ORD-XXXXXXXXXXXXXXXXXXXX" -Headers $h
```
Trường hợp phải bị chặn: thay `<userId>` bằng id người khác → 403; không gửi token → 401; token ADMIN → 403;
`?userId=...` → 400; `orderCode` của người khác → 404.

## Lưu ý tích hợp
- `ChatbotToolsService.lookupOrder` (STT 27, Minh) hiện vẫn tự truy vấn Prisma với cùng quy tắc quyền. Chưa sửa file của Minh;
  khi muốn dùng chung, import `OrdersModule` vào `ChatbotModule` và gọi `InternalOrdersService.findForUser(ctx.userId, { orderCode, limit })`
  — `userId` phải lấy từ JWT, không từ LLM.
- Chưa chạy được kiểm thử với PostgreSQL thật trong môi trường tạo ZIP; unit test dùng Prisma giả. Cần chạy thủ công với DB đã migrate trước khi đánh dấu hoàn thành.
