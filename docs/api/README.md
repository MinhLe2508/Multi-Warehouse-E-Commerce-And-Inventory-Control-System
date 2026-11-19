# Huy — bộ bàn giao API Contract tuần 1

**Dự án:** Multi-Warehouse E-Commerce & Inventory Control System  
**Phiên bản:** 0.1.1, cập nhật yêu cầu Auth từ nhóm ngày 09/10/2026  
**Nhiệm vụ:** Soạn OpenAPI/API Contract cho Orders, Payments, Stock Reservation.  
**Hạn trong timeline:** 11/10/2026.

## 1. Bạn nhận được gì?

| File | Công dụng |
|---|---|
| [openapi.yaml](openapi.yaml) | Đặc tả đầy đủ 7 thao tác HTTP, request/response, quyền, lỗi và ví dụ |
| [stock-reservation-contract.md](stock-reservation-contract.md) | Chữ ký SQL thật, contract service nội bộ, transaction, audit và luồng thanh toán/hết hạn |
| [week1-decisions.md](week1-decisions.md) | Quyết định theo source/nhóm, các đề xuất cần review và đối chiếu ba ảnh mới |
| [examples.json](examples.json) | Fixture request/response để frontend mô phỏng, trích đúng từ OpenAPI |
| [validate_contract.py](validate_contract.py) | Chạy lại kiểm tra đặc tả, ví dụ, ràng buộc dữ liệu mẫu và đối chiếu source |
| [requirements-validation.txt](requirements-validation.txt) | Thư viện Python dành riêng cho kiểm tra tài liệu, không thêm vào backend |
| [validation-report.md](validation-report.md) | Kết quả kiểm tra đã chạy và phần chưa kiểm thử |

Đây là **bộ tài liệu bàn giao để nhóm review**, không phải bộ backend nghiệp vụ đã triển khai. Chưa push/merge lên Git và chưa đánh dấu nhóm phê duyệt. Các API đang là thiết kế; chỉ chép YAML vào repo không làm `/orders` hoạt động.

Bản này dùng schema/SQL từ ZIP commit `2cc0677fd6fd1a0253f400a71a2f71d1d01ff505` và yêu cầu mới từ ba ảnh nhóm. Chưa có ZIP Auth mới để kiểm chứng implementation của cập nhật 09/10.

## 2. Đọc nhanh phần của bạn

API Contract là bản thỏa thuận: frontend gửi dữ liệu nào, backend trả gì, ai được gọi và lỗi được xử lý ra sao. Nhiệm vụ tuần 1 của Huy là hoàn thiện bản thỏa thuận này.

| HTTP | Route dự thảo | Ý nghĩa |
|---|---|---|
| POST | `/orders` | Tạo đơn và giữ hàng |
| GET | `/orders` | Xem đơn của mình, có phân trang |
| GET | `/orders/{orderId}` | Chi tiết đơn của mình |
| POST | `/orders/{orderId}/cancel` | Hủy đơn chưa xác nhận thanh toán |
| POST | `/payments` | Tạo/tái sử dụng thanh toán mock đang chờ |
| GET | `/payments/{paymentId}` | Xem kết quả thanh toán của mình |
| POST | `/payments/mock/callback` | Mock gateway báo kết quả bằng quyền server riêng |

Stock Reservation dùng hàm SQL nội bộ Khang đã viết:

```sql
fn_reserve_stock(
  p_inventory_id BIGINT,
  p_order_id UUID,
  p_quantity INTEGER,
  p_ttl_minutes INTEGER DEFAULT 15
) RETURNS BIGINT
```

Hàm đã tăng reserved_stock và tạo reservation. Huy điều phối việc gọi hàm cùng transaction với Order, không làm tăng giữ chỗ thêm lần nữa. Reserve chưa trừ stock thật; thanh toán thành công mới commit/trừ kho.

### Cập nhật nhóm đã được áp dụng

- CUSTOMER chưa đổi mật khẩu lần đầu không được gọi 6 operation khách; contract có 403 `PASSWORD_CHANGE_REQUIRED`.
- Auth cung cấp userId UUID, role và trạng thái hợp lệ. Không dùng username trước @ làm khóa đơn hàng. Tên `passwordChangeRequired` là đề xuất giao tiếp, chưa có trong schema ZIP cũ.
- Đề xuất `ACCOUNT_INACTIVE` cho trạng thái Auth không cho hoạt động; không tự triển khai tính năng quản lý nhân viên.
- Nodemailer, đăng ký/reset password và email thuộc Khang; không thêm những module đó vào bài của Huy.
- Callback/cleanup là tác vụ server, không bị nhầm với phiên đổi mật khẩu của Customer.
- Mẫu commit đã đổi theo quy ước `[Huy] - ...` được ghim trong nhóm.

Không tự thêm kiểm tra xác minh email: ảnh chưa quy định token/link xác minh. Cơ chế mật khẩu mặc định là phần Auth nhóm đã chọn và ghi nhận hạn chế; tài liệu đơn hàng không thay đổi quy trình đó hoặc lưu mật khẩu trong response.

## 3. Chép vào project

1. Giải nén `Huy_Tuan1_API_Contract.zip`.
2. Mở thư mục chứa `docs` bên trong bản giải nén.
3. Chép thư mục `docs/api` vào **gốc repository nhóm** (cùng cấp với `backend`, `frontend`, `docker-compose.yml`). Nếu repo đã có file cùng tên, xem diff trước khi thay thế để giữ chỉnh sửa nhóm.
4. Mở `docs/api/README.md` trong VS Code; nhấn `Ctrl+Shift+V` để đọc bản Markdown.
5. Đọc `week1-decisions.md` trước khi gửi nhóm để biết điểm nào đã xác nhận, điểm nào cần review.

Các file này không sửa schema, migration, package.json, `.env` hoặc source của Khang/Minh. Không cần chạy Docker, seed hay backend để đọc/kiểm tra đặc tả.

## 4. Xem API và dùng JSON mock

`openapi.yaml` dùng OpenAPI 3.0.3. Có thể mở bằng công cụ xem OpenAPI nhóm đang dùng; nếu dùng Swagger Editor, nhập nội dung YAML tại [editor.swagger.io](https://editor.swagger.io/). Không dán token thật hoặc `.env` vào công cụ xem tài liệu. Nút “Try it out”, nếu có, chỉ hoạt động khi backend đã triển khai các endpoint.

Frontend có thể đọc `examples.json` và chọn fixture theo:

- `operationId`: thao tác, ví dụ `createOrder`.
- `kind`: `request` hoặc `response`.
- `status`: HTTP status của response.
- `scenario`: tên tình huống, ví dụ `holding`, `INSUFFICIENT_STOCK`, `PASSWORD_CHANGE_REQUIRED`.
- `value`: JSON mẫu có thể dùng trong mock.

Ví dụ `createOrder`/`response`/201/`holding` là một đơn mẫu có subtotal 300000.00, discountTotal 15000.00 và grandTotal 285000.00. UUID, orderCode, transactionRef và thời gian đều giả lập; không phải ID cố định của seed. Fixture lỗi là response mẫu, không phải request để dùng làm body tạo đơn.

Từ mock bạn có thể làm UI trước; mock hiển thị đúng không chứng minh transaction/chống oversell đã chạy.

## 5. Chạy kiểm tra tài liệu

Phần này dùng Python 3.10+; không bắt buộc để chỉ đọc file. Chạy trong terminal PowerShell tại gốc repository sau khi chép tài liệu:

```powershell
py -3 -m venv .venv-api-contract
.\.venv-api-contract\Scripts\python.exe -m pip install -r docs/api/requirements-validation.txt
.\.venv-api-contract\Scripts\python.exe docs/api/validate_contract.py
```

Lệnh kiểm tra mặc định không gọi backend và không sửa database. Nó kiểm tra OpenAPI, tham chiếu, fixtures và các ràng buộc mẫu. Có thể đối chiếu thêm schema/SQL trong repo:

```powershell
.\.venv-api-contract\Scripts\python.exe docs/api/validate_contract.py --source .
```

Nếu cần lưu báo cáo mới sau khi sửa tài liệu, thêm `--report docs/api/validation-report.md`. Chỉ ghi báo cáo khi toàn bộ kiểm tra qua; dùng báo cáo mới để phản ánh trạng thái mới.

Không commit `.venv-api-contract`. Nếu máy chưa có `py`, dùng lệnh Python 3 thực tế đã cài trên máy. Requirements này chỉ phục vụ kiểm tra docs, không phải dependency ứng dụng NestJS.

### Kiểm tra source không đồng nghĩa chạy source

`--source` kiểm tra enum, chữ ký hàm, constraints và tham chiếu field đã dùng. Nó không migrate, seed, build backend hay chạy race test. Source nền có hai import thiếu trong `main.ts`:

- `core/filters/http-exception.filter.ts`
- `core/interceptors/logging.interceptor.ts`

Nhờ Minh bổ sung/đồng bộ nếu bản mới vẫn thiếu. PrismaModule cũng cần được đăng ký khi tích hợp nghiệp vụ. Chưa coi các việc này là lỗi Huy phải tự sửa để hoàn thành tài liệu tuần 1.

## 6. Commit và gửi nhóm review

Từ repo gốc, xem nhánh và thay đổi trước:

```powershell
git status --short
git branch
```

Nếu nhóm chưa cấp nhánh riêng, có thể tạo từ nhánh `project` đã đồng bộ bằng tên sau; nếu đang ở nhánh làm việc của bạn thì giữ nhánh đó:

```powershell
git switch -c huy-week1-api-contract
```

Sau khi kiểm tra các file:

```powershell
git diff --check
git add docs/api
git diff --cached --stat
git diff --cached
git commit -m "[Huy] - Soạn API Contract Orders Payments Stock Reservation tuần 1"
git push -u origin huy-week1-api-contract
```

Nếu dùng tên nhánh khác thì thay tên trong lệnh push. Chỉ stage file thuộc phần Huy; không stage `.env`, virtualenv hoặc thay đổi ngoài `docs/api`. Nếu thư mục docs có sửa đổi của thành viên khác, chọn từng file/hunk trước khi commit.

Tạo PR theo quy trình nhóm, nhờ:

- **Khang:** review chữ ký SQL, wrapper, transaction, Auth context/đổi mật khẩu lần đầu.
- **Minh:** review định dạng lỗi, callback secret và cleanup.
- **Trọng:** review request/response cho checkout, JSON mock và xử lý 403/409.
- **Triết:** kiểm tra ranh giới admin/user, tránh trùng API quản trị.

Không đánh dấu nhiệm vụ “nhóm đã thống nhất” trước khi nhận review. CI của ZIP chỉ tự chạy push main/develop, PR và chạy thủ công; push nhánh Huy riêng chưa chắc tự kích hoạt workflow push.

## 7. Bạn có thể trình bày với nhóm như sau

“Tuần 1 mình đã soạn contract Orders, Payments và giữ chỗ tồn kho. Phần giữ chỗ dùng đúng hàm fn_reserve_stock của Khang: hàm tự khóa, kiểm tra, tăng lượng giữ và tạo reservation, nên service không làm lại các bước đó. Mình đã mô tả việc dùng chung transaction cho cả đơn, lỗi thiếu hàng 409, callback lặp và hết hạn. Mình cũng cập nhật điều kiện bắt đổi mật khẩu lần đầu theo thông báo nhóm. Các lựa chọn chưa có trong source như chọn kho, COD và định dạng lỗi mình ghi rõ là đề xuất để mọi người review.”

Bạn nên hiểu bốn điểm trước khi bàn giao: giữ hàng chưa trừ stock thật; payment lặp không trừ kho lần hai; nhiều sản phẩm thiếu một dòng phải rollback cả đơn; token phiên đổi mật khẩu chưa có quyền dùng API nghiệp vụ.

## 8. Giới hạn và nguồn

- Chỉ hoàn thành tài liệu tuần 1. Code Pricing/Orders/Payments/StockReservationService và test đồng thời thuộc các tuần triển khai.
- Nội dung SOURCE dựa trên ZIP 08/10; nội dung NHÓM dựa trên ba ảnh 09/10 và lựa chọn fn_reserve_stock Huy đã thông báo.
- `Timeline_MultiWarehouse_Ecommerce.ods`: nhiệm vụ số 3 của Huy.
- `backend/prisma/schema.prisma`, hai migration, seed, main.ts/AppModule/PrismaService và README: đối chiếu source.
- Tài liệu `Thiết kế CSDL và ERD.pdf`: NT-08, mục 10.2 và các ràng buộc thiết kế.
- [OpenAPI Specification 3.0.3](https://spec.openapis.org/oas/v3.0.3): cấu trúc đặc tả. Dùng chuẩn này để kiểm tra cú pháp, không lấy ví dụ của chuẩn làm nghiệp vụ dự án.

Đây là bản bàn giao cập nhật để dùng thay các đề xuất sơ bộ trong file hướng dẫn trước. Kết quả kiểm tra cụ thể nằm ở `validation-report.md`.
