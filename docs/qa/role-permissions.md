# Ma trận quyền và kiểm thử truy cập dữ liệu · F222

Đối chiếu nhánh `project` tại commit `87db396`. Khang cập nhật tài liệu và bộ kiểm thử. Huy, Triết và Minh rà soát các quyết định liên quan đơn hàng, giao diện và thông báo.

Quy ước của Khang cho đợt này là **1 Admin và 1 Staff**. F119 tạo thêm hai Customer để kiểm tra dữ liệu theo chủ sở hữu. PostgreSQL kiểm thử sử dụng schema và migrations hiện có.

## Quy tắc xác thực

- REST đã bảo vệ dùng access JWT và kiểm tra trạng thái hiện tại của tài khoản trong PostgreSQL. Phiên thiếu xác thực hoặc tài khoản bị khóa nhận `401`. Vai trò sai nhận `403`.
- Route áp dụng chính sách đổi mật khẩu lần đầu trả `403 PASSWORD_CHANGE_REQUIRED` cho tài khoản còn `mustChangePassword`. `POST /auth/change-password` là điểm vào cho luồng đổi mật khẩu.
- Route nghiệp vụ lấy vai trò và ID người dùng từ ngữ cảnh đã xác thực. Phản hồi danh sách hoặc chi tiết chỉ trả các trường phục vụ nghiệp vụ. Token được cấp ở luồng Auth và giá vốn được giới hạn theo quyền.

## Quyền REST hiện hành

| Route và thao tác                                                                                    | `ADMIN`                                       | `WAREHOUSE_STAFF`                | `CUSTOMER`           | Phạm vi dữ liệu                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/orders`, `GET /admin/orders/:id`                                                         | Xem                                           | Xem theo controller hiện có      | Từ chối              | Danh sách hiện lọc theo trạng thái, ngày, tìm kiếm và phân trang. Phạm vi theo kho còn cần thống nhất.                             |
| `PATCH /admin/orders/:id/status`                                                                     | Cập nhật theo trạng thái nghiệp vụ            | Cập nhật theo controller hiện có | Từ chối              | Gateway chỉ nhận đích `SHIPPING` hoặc `DELIVERED`. Quyền theo từng đơn cần chốt cùng phạm vi kho.                                  |
| `PATCH /orders/admin/:id/status`                                                                     | Cập nhật theo trạng thái nghiệp vụ            | Từ chối                          | Từ chối              | Route quản trị cũ dùng `PasswordChangedGuard` và chỉ nhận Admin.                                                                   |
| `GET /admin/analytics/summary`, `GET /admin/analytics/revenue-series`                                | Xem                                           | Từ chối                          | Từ chối              | Tổng doanh thu dùng các trạng thái `CONFIRMED`, `SHIPPING`, `DELIVERED`. Khi lọc kho, tiền dùng các dòng hàng thuộc kho được chọn. |
| `GET /inventory`, `GET /inventory/:id`, `GET /inventory/alerts`                                      | Xem                                           | Xem                              | Từ chối              | Giá vốn trong dữ liệu tồn kho chỉ dành cho Admin.                                                                                  |
| `GET /admin/inventory`, `GET /admin/inventory/summary`                                               | Xem                                           | Xem                              | Từ chối              | Danh sách và summary cần thống nhất các điều kiện lọc và phạm vi dữ liệu.                                                          |
| `POST /inventory`, `POST /inventory/:id/restock`, `PUT /inventory/:id`, `PATCH /admin/inventory/:id` | Ghi                                           | Từ chối                          | Từ chối              | Cập nhật tồn kho dùng service nghiệp vụ của dự án.                                                                                 |
| `GET /admin/products`, `GET /admin/products/:id`                                                     | Xem, có giá vốn                               | Xem, ẩn giá vốn                  | Từ chối              | Quyền xem giá vốn được áp dụng khi tạo phản hồi.                                                                                   |
| `POST /admin/products`, `PATCH /admin/products/:id`, `DELETE /admin/products/:id`                    | Ghi                                           | Từ chối                          | Từ chối              | Quản lý danh mục sản phẩm tại API quản trị.                                                                                        |
| `GET /admin/alerts`, `PATCH /admin/alerts/:id/resolve`                                               | Xem và xử lý                                  | Xem và xử lý                     | Từ chối              | Controller có guard kiểm tra vai trò và đổi mật khẩu.                                                                              |
| Quản lý nhân viên tại `/admin/staff`                                                                 | Xem, tạo, sửa, khóa, mở khóa, gửi lại lời mời | Từ chối                          | Từ chối              | Mục tiêu thao tác là tài khoản `WAREHOUSE_STAFF`.                                                                                  |
| `POST /orders`, `GET /orders/:id`, `GET /internal/orders/:userId`                                    | Từ chối                                       | Từ chối                          | Dùng cho chính mình  | Chi tiết đơn thuộc khách khác trả `404`. Internal Orders lấy phạm vi chủ sở hữu từ JWT và kiểm tra user ID theo request.           |
| `GET /chatbot/history/:sessionToken`                                                                 | Xem phiên thuộc mình                          | Xem phiên thuộc mình             | Xem phiên thuộc mình | Với phiên có chủ đăng nhập, backend kiểm tra ID chủ sở hữu. Phiên khách vãng lai dùng quy tắc session riêng trong chatbot.         |
| `GET /chatbot/kb/stats`, `POST /chatbot/kb/ingest`, `POST /chatbot/kb/sync-embeddings`               | Quản trị KB                                   | Từ chối                          | Từ chối              | KB nghiệp vụ và truy cập phiên chat là hai quyền riêng.                                                                            |

## Thông báo qua socket

Gateway kiểm tra JWT và trạng thái tài khoản khi xác thực kết nối. Mỗi tài khoản nhận thông báo riêng theo user ID. `inventory.changed` gửi vào room Admin và Staff. `inventory.low_stock` gửi vào room Admin. Dữ liệu phát qua gateway được lọc trường nhạy cảm. F122 kiểm tra REST. Phần socket dùng bộ test của `NotificationsGateway`.

## Quyết định cần chốt trước khi nghiệm thu đầy đủ

| Chủ đề                    | Việc cần thống nhất                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Đổi mật khẩu lần đầu      | Rà soát và đồng bộ policy tại `admin/orders`, `admin/inventory` và `admin/analytics` theo F224. Đối chiếu với `/orders/admin` và `/inventory` đã áp dụng `PasswordChangedGuard`.                                            |
| Quyền Staff khi xử lý đơn | Xác nhận quyền đọc, chuyển trạng thái và phạm vi kho cho hai nhóm route quản trị đơn. Schema hiện lưu tài khoản và kho ở các model độc lập. Hợp đồng theo kho cần nguồn dữ liệu gán nhân viên với kho trước khi nghiệm thu. |
| Phạm vi Inventory         | Dùng cùng quy tắc cho list và summary. Đồng bộ lại hợp đồng API Admin, gồm mục `/admin/inventory` đang khai báo hai lần trong YAML.                                                                                         |

## Nghiệm thu F119–F120 và F122

`prepare-e2e.cjs` tạo dữ liệu của một lượt trong giao dịch, với hai kho, một sản phẩm, các trạng thái đơn đã biết, tồn kho và giữ chỗ, mỗi Customer có phiên chat riêng và một tài liệu KB tổng hợp. Manifest chứa mã lượt, địa chỉ database kiểm thử dạng host, port, tên database, ID và kết quả dự kiến. Access JWT do luồng đăng nhập của ứng dụng cấp trong thời gian kiểm thử.

`cleanup-e2e.cjs` xác minh database, mã lượt và dấu nhận diện của mỗi ID. Script dọn dữ liệu theo thứ tự quan hệ khóa ngoại và kiểm tra các bản ghi thuộc phạm vi trước khi ghi. F122 kiểm tra một kho đối chứng vẫn tồn tại sau khi dọn và lần chạy dọn lặp trả về số bản ghi xóa bằng `0`.

F122 chạy qua NestJS với PostgreSQL thật và JWT từ `/auth/login`. Bộ test kiểm tra danh sách đơn của Admin, tổng doanh thu theo kho, ẩn giá vốn với Staff, quyền Analytics, trạng thái khóa, đổi mật khẩu lần đầu trên các route đã áp guard, và quyền chủ sở hữu đơn hàng, phiên chat. Lớp gửi thư và phát sự kiện được thay thế trong ứng dụng kiểm thử.

### Chạy trên PostgreSQL kiểm thử

Tạo database PostgreSQL riêng có tên bắt đầu bằng `cnpm_e2e_test_`. Áp các migration của dự án vào database đó. Chạy từ thư mục `backend` với dependencies đã cài và Prisma Client đã được sinh.

```powershell
$env:E2E_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/cnpm_e2e_test_local'
$env:DATABASE_URL = $env:E2E_TEST_DATABASE_URL
npx prisma migrate deploy
npm run test:e2e -- --runInBand admin-data-access
```

Jest chuẩn bị và dọn fixture tự động. Có thể dùng hai script riêng để xem dữ liệu mẫu. Đặt `E2E_FIXTURE_PASSWORD` nếu cần đăng nhập thủ công vào tài khoản thử. Bản ghi tự dùng mật khẩu ngẫu nhiên khi không đặt biến này.

```powershell
node test/fixtures/prepare-e2e.cjs | Set-Content -Encoding utf8 .\fixture-manifest.json
node test/fixtures/cleanup-e2e.cjs .\fixture-manifest.json
```

**Nguồn đối chiếu** [Nhánh `project` tại 87db396](https://github.com/MinhLe2508/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/tree/87db396bbdd0376fa74e352fdfc2ff2c4c51ac44) · [Hợp đồng Admin hiện tại](../api/admin-api-contract.yaml).
