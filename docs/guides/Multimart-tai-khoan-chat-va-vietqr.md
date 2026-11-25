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

Đặt ngân hàng, số tài khoản chính và tên chủ tài khoản trong `.env` gốc rồi khởi động lại. Ví dụ bên dưới dùng MB Bank. Dùng mã hoặc BIN trong [danh sách ngân hàng của SePay](https://vietqr.app/banks.json). Nếu để trống mã ngân hàng, ứng dụng dùng Vietcombank theo cấu hình cũ.

```dotenv
VIETQR_BANK=MB
VIETQR_ACCOUNT_NUMBER=
VIETQR_ACCOUNT_NAME=""
VIETQR_VIRTUAL_ACCOUNT=
VIETQR_MEMO_PREFIX=
```

Với VA chính thức, điền số VA vào `VIETQR_VIRTUAL_ACCOUNT` và giữ số tài khoản chính ở `VIETQR_ACCOUNT_NUMBER`. Với VA theo nội dung, để trống số VA và đặt `VIETQR_MEMO_PREFIX` theo mã TKP, ví dụ `TKP001`. MultiMart thêm dấu hiệu `SEVQR` cho VietinBank. [Quy tắc nội dung và tài khoản](https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code).

Checkout lưu ngân hàng và tài khoản theo từng đơn. Trang thanh toán dùng ảnh SePay mẫu compact và hiển thị đủ số tiền, số tài khoản cùng nội dung cần chuyển. Khi đổi tài khoản nhận, tạo đơn mới để thử cấu hình mới. Tổng tiền chuyển khoản là số nguyên dương VND. Chọn COD ở bước đặt hàng nếu giá có phần lẻ.

### Nhận xác nhận tự động

1. Liên kết tài khoản với SePay theo ngân hàng, loại tài khoản và phương thức kết nối. Kiểm tra loại giao dịch tiền vào được hỗ trợ và tạo VA nếu SePay yêu cầu. [Ngân hàng và tuyến nhận tiền được hỗ trợ](https://developer.sepay.vn/vi/sepay-webhooks/tai-khoan-ngan-hang).
2. Tạo webhook **Tiền vào** cho tài khoản hoặc VA tương ứng và trỏ URL HTTPS đến `/payments/sepay/webhook` của NestJS. Chọn HMAC-SHA256 với secret giống `SEPAY_WEBHOOK_SECRET` trong `.env` gốc, dài ít nhất 32 ký tự. Khi thử, có thể để trống bộ lọc mã để ứng dụng đọc mã `MM` từ nội dung chuyển. Giữ tài khoản cũ trong webhook nếu còn đơn chờ thanh toán về tài khoản đó. [Tích hợp webhook](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook).
3. Để lấy giao dịch định kỳ trên localhost hoặc dự phòng webhook, điền `SEPAY_API_TOKEN` và `SEPAY_BANK_ACCOUNT_ID` trong `.env` gốc. Dùng API Token Production và trường `id` (UUID) của số tài khoản nhận tiền trong danh sách tài khoản SePay. Backend đọc giao dịch của tài khoản đó mỗi phút, trong cửa sổ 30 phút gần nhất. Giữ token và secret trong cấu hình backend. [Tạo API Token](https://developer.sepay.vn/vi/sepay-api/v2/tao-api-token) · [Danh sách tài khoản](https://developer.sepay.vn/vi/sepay-api/v2/tai-khoan-ngan-hang/danh-sach)
4. Khởi động lại ứng dụng. Khi giao dịch tiền vào khớp tài khoản nhận, nội dung, số tiền và thời hạn giữ hàng, đơn sẽ chuyển sang **Đã thanh toán**. Trang chi tiết kiểm tra lại khoảng 4 giây một lần khi đang mở và sau khi người dùng quay lại từ ứng dụng ngân hàng.

### Nút giả lập SePay trong phiên dev

Đặt các biến sau trong `.env` gốc rồi khởi động lại `npm run dev`.

```dotenv
SEPAY_PAYMENT_PREFIX=MM
PAYMENT_TIMEOUT_MINUTES=15
SEPAY_ALLOW_SIMULATE=1
SEPAY_STRICT_AUTH=1
```

- `SEPAY_PAYMENT_PREFIX` định dạng mã chuyển khoản của đơn mới. Dùng 2–5 chữ cái. Mã của đơn cũ vẫn có hiệu lực trong thời hạn giữ hàng.
- `PAYMENT_TIMEOUT_MINUTES` là thời gian giữ hàng của đơn VietQR mới, từ 1 đến 120 phút, mặc định 15. Hạn của đơn đã tạo được giữ nguyên.
- `SEPAY_ALLOW_SIMULATE=1` hiện nút **[DEV TEST] Giả lập SePay nhận tiền** dưới QR của đơn đang chờ khi chạy `npm run dev` với PostgreSQL local. Chỉ dùng nút trên đơn thử. Sau khi bấm, MultiMart xác nhận đơn, chốt tồn kho và lưu một biên nhận có nhãn DEV TEST. Trang đơn hiển thị **Đã thanh toán (giả lập)** và ẩn QR.
- `SEPAY_STRICT_AUTH=1` yêu cầu chữ ký HMAC trên webhook. Giá trị `0` tắt tuyến nhận webhook. DEV TEST dùng cùng quy trình đối soát và xác nhận trong MultiMart, nhưng ghi nguồn là giả lập. Yêu cầu DEV TEST gửi lặp không trừ kho lần hai.

Đặt `SEPAY_ALLOW_SIMULATE=0` rồi chạy lại `npm run dev` để ẩn DEV TEST. Giao diện dùng địa chỉ ở dòng **[MultiMart]** trong log và Quick Tunnel cho thanh toán thật vẫn trỏ vào backend cổng `3001`.

### Gửi và xử lý yêu cầu đối soát

1. Khách vào chi tiết đơn VietQR và chọn **Yêu cầu CSKH xử lý** nếu đã chuyển tiền mà đơn chưa cập nhật. Nút khả dụng sau 30 giây kể từ khi tạo đơn. Khách có thể kèm mã giao dịch trên biên lai.
2. Admin mở thông báo đối soát hoặc lọc **Đơn hàng → Đối soát VietQR → Có yêu cầu CSKH đang mở**. Trang chi tiết hiển thị thời điểm khách gửi và mã giao dịch nếu có.
3. Nếu sao kê cho thấy tiền đã vào và đơn còn hạn giữ hàng, Admin chọn **Xác nhận đã thanh toán** ngay trong yêu cầu. Hệ thống cập nhật thanh toán, tồn kho và lịch sử đơn cùng lúc, đồng thời ghi nhận tài khoản Admin đã xác nhận.
4. Với khoản thiếu, dư hoặc đơn đã hết hạn, Admin có thể phản hồi trực tiếp trong yêu cầu và hướng dẫn khách xử lý khoản chuyển. Khoản tiền từ webhook cần xem lại nằm trong **Thanh toán → Khoản tiền đã ghi nhận**. Nếu giao dịch khớp trong lúc yêu cầu đang mở, hệ thống tự xác nhận và hoàn tất yêu cầu.
