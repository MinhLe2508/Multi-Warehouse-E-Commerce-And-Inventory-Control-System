# Tài khoản, Chatbot và VietQR của MultiMart

## Cài đặt bản cập nhật

Bản cập nhật dành cho nhánh `project` đã có luồng đối soát VietQR. Dừng ứng dụng, giải nén các tệp vào thư mục gốc của dự án, rồi chạy các lệnh sau trong PowerShell. PostgreSQL và Redis cần đang chạy.

```powershell
cd backend
npx prisma migrate deploy
npx prisma generate
cd ..
npm run dev
```

Nếu cần khởi động cơ sở dữ liệu và Redis trước khi chạy migration, dùng `docker compose up -d --wait postgres redis` từ thư mục gốc. Migration thêm sổ địa chỉ, khuyến mãi và trường kho khách chọn. Các đơn hiện có mặc định thuộc nhóm giao tự động.

## Tài khoản và Email

Customer và Staff đăng nhập bằng Gmail đầy đủ hoặc tên đăng nhập. Tài khoản mới lấy tên từ phần trước `@gmail.com`. Hệ thống thêm hậu tố khi tên trùng. Với tài khoản cũ, Gmail đầy đủ luôn trỏ tới đúng tài khoản đã đăng ký. Biểu mẫu đặt mật khẩu mở từ liên kết trong thư xác thực hoặc thư mời.

Các thư xác thực, thư mời và thư đặt lại mật khẩu dùng cùng mẫu MultiMart. Thư xác thực Customer ghi tên đăng nhập chính xác của tài khoản, kể cả khi hệ thống đã thêm hậu tố. Các thư dùng cấu hình Gmail SMTP hiện tại. Địa chỉ trong `FRONTEND_ORIGIN` cần là địa chỉ mà người nhận mở được.

## Đặt hàng và địa chỉ yêu thích

Ở lần đặt hàng đầu tiên, nhập người nhận, số điện thoại và địa chỉ. Chọn **Lưu địa chỉ yêu thích** để lưu một địa chỉ có tên riêng. Có thể thêm, sửa, xóa hoặc đặt mặc định tại **Tài khoản → Địa chỉ yêu thích**. Lần đặt sau ưu tiên địa chỉ mặc định, sau đó là thông tin của đơn gần nhất. Người mua có thể sửa các trường trước khi gửi đơn.

Trường **Kho giao hàng** có lựa chọn **MultiMart tự chọn kho** và danh sách kho đang hoạt động. Khi khách chọn một kho, cả đơn được giữ hàng tại kho đó. Nếu thiếu tồn tại kho đã chọn, khách có thể chọn kho khác hoặc chọn để MultiMart tự phân bổ.

Staff xem được các đơn giao tự động và các đơn khách chọn kho mình phụ trách. Chi tiết đơn gồm tài khoản đặt, thông tin người nhận, sản phẩm, kho xuất và thanh toán. Staff xác nhận xuất và giao đơn khi được phân công toàn bộ kho xuất của đơn.

## Khuyến mãi

1. Vào **Admin → Kinh doanh → Khuyến mãi → Thêm khuyến mãi**. Đặt tên, mức giảm 1–100%, hạn theo giờ Việt Nam và chọn tất cả mặt hàng hoặc các danh mục. Danh mục cha bao gồm các danh mục con.
2. Hệ thống tạo mã 5 ký tự in hoa hoặc chữ số và gửi thông báo trong ứng dụng cho Customer và Staff mua sắm. Người mua chọn **Nhận mã khuyến mãi** trong thông báo.
3. Khi đặt hàng, chọn một mã đã nhận. Mức giảm tính trên giá bán của từng sản phẩm phù hợp sau chiết khấu sản phẩm. Máy chủ tính lại khi tạo đơn. Đơn có tổng 0 đồng được xác nhận trực tiếp.
4. Admin có thể lọc mã còn hiệu lực hoặc hết hạn. Xóa mã chấm dứt hiệu lực với đơn đặt sau đó. Số tiền giảm của đơn đã đặt được lưu cùng đơn.

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

1. Khách vào chi tiết đơn VietQR và chọn **Yêu cầu CSKH xử lý** nếu đã chuyển tiền mà đơn chưa cập nhật. Nút khả dụng sau 30 giây kể từ khi tạo đơn. Khách có thể kèm mã giao dịch trên biên lai.
2. Admin mở thông báo đối soát hoặc lọc **Đơn hàng → Đối soát VietQR → Có yêu cầu CSKH đang mở**. Trang chi tiết hiển thị thời điểm khách gửi và mã giao dịch nếu có.
3. Nếu sao kê cho thấy tiền đã vào và đơn còn hạn giữ hàng, Admin chọn **Xác nhận đã thanh toán** ngay trong yêu cầu. Hệ thống cập nhật thanh toán, tồn kho và lịch sử đơn cùng lúc, đồng thời ghi nhận tài khoản Admin đã xác nhận.
4. Với khoản thiếu, dư hoặc đơn đã hết hạn, Admin có thể phản hồi trực tiếp trong yêu cầu và hướng dẫn khách xử lý khoản chuyển. Khoản tiền từ webhook cần xem lại nằm trong **Thanh toán → Khoản tiền đã ghi nhận**. Nếu giao dịch khớp trong lúc yêu cầu đang mở, hệ thống tự xác nhận và hoàn tất yêu cầu.
