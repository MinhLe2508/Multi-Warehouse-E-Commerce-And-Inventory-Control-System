# Kết quả kiểm tra bản bổ sung P1

Base: origin/project 065d117. Kiểm tra ngày 22/10/2026.

## Đã chạy thành công

- Prisma generate từ schema mới có costPrice và Notification.
- Backend build (Nest/TypeScript).
- ESLint thư mục backend/src/products.
- 38 test sản phẩm: JWT thật và JwtStrategy thật với database mock; kiểm tra 401/403, role hiện tại từ DB, yêu cầu đổi mật khẩu, STAFF không nhận costPrice, CRUD, DTO, conflict, bảo vệ đơn/tồn/lịch sử khi xóa; public API không trả costPrice.
- Toàn bộ 8 suite backend trước khi thêm test guard cuối: 104/104 đạt. Sau đó suite products có thêm 1 test guard và 38/38 đạt.
- Frontend 31/31 test: 6 auth + 16 cart + 9 inventory của nhóm. Auth được chạy lại sau chỉnh sửa và 6/6 đạt.
- ESLint toàn frontend.
- Frontend production build, bao gồm 7 trang Auth, admin/products và staff/products.
- Kiểm tra cú pháp smoke-products.mjs.

## Chưa được xác nhận ở môi trường thật

- Chưa chạy migrations/seed với PostgreSQL thật trong môi trường thực hiện: không có PostgreSQL/Docker sẵn, cài PostgreSQL không thành công do quyền hệ thống.
- Test backend thay database bằng mock: không chứng minh SQL lock/FK/Serializable trên PostgreSQL thật. Phải chạy smoke script và ca xóa sản phẩm có đơn/tồn/lịch sử trong README.
- Chưa gửi email Gmail/SMTP thật hoặc bấm qua link nhận trong hộp thư. Dùng tài khoản/email mình sở hữu và cấu hình SMTP hiện có để test.
- Chưa tự động kiểm tra trình duyệt hoặc chụp ảnh giao diện. Build không thay thế kiểm tra giao diện và luồng đăng nhập thực tế.
- Rate limit resend ở UI chỉ là cooldown; backend Auth cần người phụ trách review rate limit riêng.
- Session lưu sessionStorage theo tab cho phù hợp Bearer-token API hiện tại; nếu triển khai production nên thống nhất cơ chế HttpOnly cookie cùng Auth/backend.

## Cần review các file dùng chung với P2

frontend/hooks/useCurrentAdminUser.ts, frontend/components/admin/RoleGate.tsx,
frontend/app/admin/dev-login/page.tsx, frontend/app/admin/forbidden/page.tsx,
frontend/shared/config/adminNav.ts và trang sản phẩm mới.
Các file này chuyển từ vai trò demo sang phiên Auth thật. Admin/Staff cần đăng nhập thật; không còn mặc định là Admin khi mở trang.

Không sửa .env, .env.example, schema.prisma, migrations, seed.ts, AuthService hoặc CI.
