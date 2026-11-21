# Tài khoản, danh mục và kho tri thức MultiMart

## Cập nhật dự án đã chạy trên Windows

Chép các tệp cập nhật vào thư mục gốc dự án. Dừng phiên `npm run dev` đang chạy và giữ PostgreSQL, Redis hoạt động. Chạy các lệnh sau từ thư mục gốc bằng PowerShell.

```powershell
cd backend
npx prisma migrate deploy
npx prisma generate
$env:ALLOW_DEMO_SEED = 'true'
npx prisma db seed
Remove-Item Env:ALLOW_DEMO_SEED
cd ..
npm run dev
```

Chỉ chạy seed trên CSDL phát triển. Seed có thể chạy lại. Nó giữ nguyên ID tài khoản, mật khẩu, giá đã chỉnh, tồn kho hiện có và các bản ghi bán hàng. Nếu email mẫu đã được dùng bởi tài khoản khác, seed giữ tài khoản hiện có và in thông báo. Khi SKU mục tiêu đã được dùng, seed giữ SKU cũ của sản phẩm liên quan.

## Kiểm tra trên giao diện

| Khu vực | Thao tác |
| --- | --- |
| Admin → Tài khoản & nhân sự → Nhân viên | Chọn **Thêm nhân viên**, nhập Email thuộc một khách hàng và bấm **Tạo nhân viên**. Kiểm tra tài khoản hiện ra rồi bấm **Chuyển thành nhân viên**. Phân công kho sau khi chuyển. |
| Staff → Cá nhân → Mua sắm tại MultiMart | Đăng nhập lại bằng tài khoản vừa chuyển. Từ khu vực Staff, mở cửa hàng, đặt đơn và xem **Đơn hàng của tôi**. |
| Admin → Nhân viên | Mở thao tác **Chuyển nhân viên xuống khách hàng** và xác nhận. Hệ thống thu hồi quyền kho và phiên đăng nhập. Tài khoản đang khóa được mở lại với quyền mua hàng. |
| Admin → Khách hàng | Mở **Xem hồ sơ** để xem thông tin liên hệ, địa chỉ mặc định và lịch sử mua hàng. Chọn **Xem chi tiết** trên một đơn để xem dòng sản phẩm, giá, phí giao hàng và giao dịch. |

Tài khoản đã xác thực có thể đăng nhập lại bằng mật khẩu đang dùng. Tài khoản chưa xác thực cần dùng Email kích hoạt theo vai trò mới. Admin có thể gửi lại thư mời Staff trong danh sách nhân viên. Customer có thể yêu cầu gửi lại Email xác thực từ trang đăng nhập.

## Bộ dữ liệu mẫu

| Tên hiển thị | Tên đăng nhập | Gmail |
| --- | --- | --- |
| Admin | `admin` | `admin@gmail.com` |
| Staff | `staff` | `staff@gmail.com` |
| Customer | `customer` | `customer@gmail.com` |

Bộ mẫu có 160 sản phẩm trong 24 danh mục. SKU dùng tiền tố theo ngành hàng, ví dụ `AUD-AIRBEAM-BUDS2`, `SMH-HOMEVIEW-C2` và `NET-LINKMESH-AX18`. Dòng sản phẩm trong đơn cũ tiếp tục hiển thị mã tại thời điểm mua. Sản phẩm mới có thông số, giá VND và biểu tượng danh mục đến khi được bổ sung ảnh.

Kho RAG có 95 tài liệu mẫu, gồm 65 tài liệu bổ sung. Các chủ đề bao gồm tài khoản, COD, VietQR, đối soát, theo dõi đơn, tồn kho và cách chọn sản phẩm. Những tài liệu cũ do Admin chỉnh sửa được giữ lại. Chatbot dùng tìm kiếm từ khóa với bộ tri thức mới ngay sau khi seed. Để bật tìm kiếm theo ngữ nghĩa, thêm `VOYAGE_API_KEY` vào `.env`, rồi chạy `npm run sync:kb` trong `backend` hoặc chọn đồng bộ vector trong **Admin → Hỗ trợ AI → Kho tri thức RAG**.
