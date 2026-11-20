# Tài khoản, Chatbot và VietQR của MultiMart

## Cài đặt bản cập nhật

Bản cập nhật dành cho nhánh `project` đã có giao diện Customer. Dừng ứng dụng, giải nén các tệp vào thư mục gốc của dự án, rồi chạy các lệnh sau trong PowerShell. PostgreSQL và Redis cần đang chạy.

```powershell
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
cd ..
npm run dev
```

Nếu cần khởi động cơ sở dữ liệu và Redis trước khi chạy migration, dùng `docker compose up -d --wait postgres redis` từ thư mục gốc. Migration bổ sung phương thức chuyển khoản và bảng ghi nhận tiền vào. Các đơn hiện có đọc được như trước.

## Tài khoản và Email

Customer và Staff đăng nhập bằng Gmail đầy đủ hoặc tên đăng nhập. Tài khoản mới lấy tên từ phần trước `@gmail.com`. Hệ thống thêm hậu tố khi tên trùng. Với tài khoản cũ, Gmail đầy đủ luôn trỏ tới đúng tài khoản đã đăng ký. Biểu mẫu đặt mật khẩu mở từ liên kết trong thư xác thực hoặc thư mời.

Các thư xác thực, thư mời và thư đặt lại mật khẩu dùng cùng mẫu MultiMart. Chúng dùng cấu hình Gmail SMTP hiện tại. Địa chỉ trong `FRONTEND_ORIGIN` cần là địa chỉ mà người nhận mở được.

## Chatbot

Câu gợi ý và các câu thường gặp về đặt hàng, thanh toán, sản phẩm và theo dõi đơn chạy bằng dữ liệu nội bộ. Khách cần đăng nhập để tra cứu đơn của mình. Có thể bật trả lời bằng mô hình ngôn ngữ bằng một trong hai biến `ANTHROPIC_API_KEY` hoặc `GEMINI_API_KEY` ở `.env` gốc. `ANTHROPIC_MODEL` mặc định là `claude-haiku-4-5-20251001`. Khởi động lại backend sau khi đổi cấu hình.

## Bật chuyển khoản VietQR

Thêm hai dòng sau vào `.env` gốc, điền số tài khoản và tên chủ tài khoản Vietcombank thực tế rồi khởi động lại. Tên có khoảng trắng đặt trong dấu ngoặc kép.

```dotenv
VIETQR_ACCOUNT_NUMBER=
VIETQR_ACCOUNT_NAME=""
```

Sau khi đặt đơn VietQR, khách sẽ thấy tên ngân hàng, chủ tài khoản, số tài khoản, số tiền chính xác và nội dung chuyển khoản riêng cho đơn. Tổng tiền chuyển khoản là số nguyên dương VND. Chọn COD ở bước đặt hàng nếu giá có phần lẻ.

### Đối soát trên sao kê

Mở **Admin → Thanh toán → Đối soát sao kê**. Xem giao dịch tiền vào của đúng tài khoản trong sao kê, nhập nội dung, mã giao dịch, số tiền và thời gian theo giờ Việt Nam. Khoản tiền đúng với đơn còn giữ hàng sẽ xác nhận đơn. Khoản thiếu, dư hoặc đến sau khi hết thời gian giữ hàng được ghi trong **Khoản tiền đã ghi nhận** để Admin xử lý ngoại lệ.

### Nhận xác nhận tự động

1. Trên SePay, liên kết tài khoản nhận theo phương thức hỗ trợ **tiền vào số tài khoản chính**. API Vietcombank được SePay công bố cho doanh nghiệp và hộ kinh doanh và có giới hạn tuyến nhận như tài khoản ảo. Kiểm tra khả năng nhận sự kiện của đúng tài khoản trước khi dựa vào xác nhận tự động.
2. Tạo webhook sự kiện **Có tiền vào** cho tài khoản mong muốn, chọn **HMAC-SHA256**, và đặt cùng secret vào `SEPAY_WEBHOOK_SECRET` trong `.env` backend. Secret cần ít nhất 32 ký tự. Tạo giá trị bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Dùng URL HTTPS truy cập được từ Internet cho tuyến backend `/payments/sepay/webhook`. Khi triển khai, định tuyến chính sách qua reverse proxy tới backend cố định. `127.0.0.1` chỉ dùng được trên chính máy đang chạy ứng dụng.
4. Nếu bật bộ lọc mã thanh toán, bảo đảm webhook nhận nội dung chuyển khoản bắt đầu bằng `MM`. Backend đối chiếu tài khoản nhận, giao dịch tiền vào, thời gian, mã đơn và số tiền. Trang chi tiết đơn tự tải lại trạng thái.

Tài liệu [SePay về xác thực HMAC](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc) và [khả năng nhận giao dịch theo ngân hàng](https://developer.sepay.vn/vi/sepay-webhooks/tai-khoan-ngan-hang).
