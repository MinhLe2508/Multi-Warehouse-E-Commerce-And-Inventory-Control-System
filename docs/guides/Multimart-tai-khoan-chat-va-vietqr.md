# Tài khoản, Chatbot và VietQR của MultiMart

## Cài đặt bản cập nhật

Bản cập nhật dành cho nhánh `project` đã có VietQR. Dừng ứng dụng, giải nén các tệp vào thư mục gốc của dự án, rồi chạy các lệnh sau trong PowerShell. PostgreSQL và Redis cần đang chạy.

```powershell
cd backend
npx prisma migrate deploy
npx prisma generate
cd ..
npm run dev
```

Nếu cần khởi động cơ sở dữ liệu và Redis trước khi chạy migration, dùng `docker compose up -d --wait postgres redis` từ thư mục gốc. Migration bổ sung bảng yêu cầu đối soát và giữ dữ liệu đơn hàng hiện có.

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

### Nhận xác nhận tự động

1. Liên kết số tài khoản nhận tiền của VietQR trên SePay. Với Vietcombank, SePay hỗ trợ nhận giao dịch qua số tài khoản chính khi tài khoản có kết nối SMS báo biến động số dư. Nếu dùng kết nối API chỉ hỗ trợ tài khoản ảo (VA), cấu hình đó cần một luồng QR tương ứng với VA. Kiểm tra giao dịch tiền vào của đúng số tài khoản trong mục **Giao dịch** trên SePay trước khi bật tự động. [Ngân hàng và tuyến nhận tiền được hỗ trợ](https://developer.sepay.vn/vi/sepay-webhooks/tai-khoan-ngan-hang)
2. Trên máy chủ có HTTPS công khai, tạo webhook **Chỉ tiền vào** cho số tài khoản chính và trỏ URL đến `/payments/sepay/webhook` của NestJS. Chọn HMAC-SHA256 và dùng chung một secret từ 32 ký tự cho SePay và `SEPAY_WEBHOOK_SECRET` trong `.env` gốc. Nếu dùng bộ lọc mã, chọn mẫu nhận mã MultiMart bắt đầu bằng `MM`. [Tích hợp webhook](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
3. Để lấy giao dịch định kỳ trên localhost hoặc dự phòng webhook, điền `SEPAY_API_TOKEN` và `SEPAY_BANK_ACCOUNT_ID` trong `.env` gốc. Dùng API Token Production và trường `id` (UUID) của số tài khoản nhận tiền trong danh sách tài khoản SePay. Backend đọc giao dịch của tài khoản đó mỗi phút, trong cửa sổ 30 phút gần nhất. Giữ token và secret trong cấu hình backend. [Tạo API Token](https://developer.sepay.vn/vi/sepay-api/v2/tao-api-token) · [Danh sách tài khoản](https://developer.sepay.vn/vi/sepay-api/v2/tai-khoan-ngan-hang/danh-sach)
4. Khởi động lại ứng dụng. Khi giao dịch tiền vào khớp tài khoản nhận, nội dung, số tiền và thời hạn giữ hàng, đơn sẽ chuyển sang **Đã thanh toán**. Trang chi tiết kiểm tra lại khoảng 4 giây một lần khi đang mở và sau khi người dùng quay lại từ ứng dụng ngân hàng.

### Gửi và xử lý yêu cầu đối soát

1. Khách vào chi tiết đơn VietQR và chọn **Yêu cầu CSKH xử lý** nếu đã chuyển tiền mà đơn chưa cập nhật. Nút khả dụng sau 3 phút kể từ khi tạo đơn. Khách có thể kèm mã giao dịch trên biên lai.
2. Admin mở thông báo đối soát hoặc lọc **Đơn hàng → Đối soát VietQR → Có yêu cầu CSKH đang mở**. Trang chi tiết hiển thị thời điểm khách gửi và mã giao dịch nếu có.
3. Nếu sao kê cho thấy tiền đã vào và đơn còn hạn giữ hàng, Admin chọn **Xác nhận đơn hàng đã thanh toán**. Nhập mã giao dịch, mã nội dung trên sao kê, số tiền và giờ tiền vào theo giờ Việt Nam, rồi xác nhận. Hệ thống cập nhật thanh toán, tồn kho và lịch sử đơn trong cùng giao dịch cơ sở dữ liệu.
4. Với khoản thiếu, dư hoặc đơn đã hết hạn, Admin có thể phản hồi trực tiếp trong yêu cầu và hướng dẫn khách xử lý khoản chuyển. Khoản tiền từ webhook cần xem lại nằm trong **Thanh toán → Khoản tiền đã ghi nhận**. Nếu giao dịch khớp trong lúc yêu cầu đang mở, hệ thống tự xác nhận và hoàn tất yêu cầu.
