# [Trong] Bổ sung P1: quản lý sản phẩm và xác thực tài khoản

Nền code: `project` commit `065d117` ([Khang] - Cập nhật database), lấy ngày 22/10/2026.

## Phạm vi bàn giao

- API `/admin/products`: ADMIN xem/thêm/sửa/xóa; WAREHOUSE_STAFF chỉ GET danh sách/chi tiết và không nhận `costPrice`; CUSTOMER/khách bị chặn.
- Public `/products` dùng select rõ ràng, không truy vấn/trả giá nhập. Giữ hợp đồng catalog cũ.
- Trang `/admin/products` quản lý sản phẩm, `/staff/products` chỉ xem. Nút ghi và cột giá nhập chỉ hiển thị cho Admin, backend vẫn kiểm tra quyền riêng.
- Giữ SKU, không thêm mã vạch; bỏ khu vực hiển thị mô tả Storefront và không thêm ô nhập mô tả ở quản trị. Giữ nguyên cột Product.description và API cũ để tương thích.
- `/login`, `/register`, `/forgot-password`, `/verify-email`, `/staff-invitation`, `/reset-password`, `/change-password` nối Auth backend hiện có.
- Login username/password, nhận `{ tokens, user }`; accessTokenExpiresAt là epoch GIÂY. Refresh dùng token rotation với single-flight; logout dọn phiên.
- Verify/staff gửi `{token,password}`; reset gửi `{token,newPassword}`. confirmPassword chỉ kiểm tra client. Token không tự dùng khi mở trang; phải bấm gửi.
- Kiểm tra mật khẩu mới >=8 ký tự và <=72 byte UTF-8. Login không áp quy tắc mật khẩu mới nên tài khoản demo admin/admin vẫn đăng nhập được.
- Gửi lại email xác thực qua `/auth/resend-verification`; UI cooldown 60 giây (chỉ UX, không thay thế rate limit backend). Staff hết hạn được hướng dẫn nhờ Admin gửi lại lời mời.
- Bridge `useCurrentAdminUser` nhận phiên thật; `/admin/dev-login` chuyển `/login`. RoleGate chờ xác thực rồi mới render. Màn hình 403 không còn nút giả lập Admin.

## Cần các bạn review

- Triệt/P2: hook useCurrentAdminUser, RoleGate, menu sản phẩm, chuyển dev-login sang login thật. Dashboard/orders/inventory khác vẫn theo triển khai riêng của P2; không coi chúng đã nối API thật nhờ bản này.
- Khang/P4: schema, migration và seed giữ nguyên của nhóm. Categories CRUD không thuộc bản này. Kiểm tra Auth/email theo luồng dưới.
- Quy tắc xóa được bảo vệ thêm: không xóa khi có OrderItem bất kỳ (kể cả đơn hủy), hoặc tồn kho/giữ chỗ/lịch sử kho/cảnh báo. Lý do: FK Product->Inventory->Audit đang Cascade. Dùng PATCH isActive=false để ngừng bán và giữ lịch sử.
- Không viết lại schema, migrations, seed, .env, AuthService, CI hay chức năng checkout tuần 4.

## API cho P2

| Method | URL | Role | Kết quả |
|---|---|---|---|
| GET | /admin/products?page=1&pageSize=12&search=...&category=...&sort=default | ADMIN, STAFF | items,total,page,pageSize,totalPages |
| GET | /admin/products/:id | ADMIN, STAFF | Chi tiết; STAFF không có thuộc tính costPrice |
| POST | /admin/products | ADMIN | 201 + sản phẩm |
| PATCH | /admin/products/:id | ADMIN | 200 + sản phẩm |
| DELETE | /admin/products/:id | ADMIN | 204; 409 nếu có dữ liệu cần giữ |

category nhận UUID hoặc slug. sort nhận default/price-asc/price-desc. Quản trị xem cả sản phẩm ngừng bán; public chỉ xem đang bán.

POST ví dụ (giá phải là CHUỖI thập phân, không dùng số float):

```json
{
  "sku": "P1-DEMO-001",
  "name": "San pham demo",
  "slug": "san-pham-demo-001",
  "basePrice": "199000.00",
  "costPrice": "100000.00",
  "categoryId": "UUID-DANH-MUC-DANG-HOAT-DONG",
  "discountPercent": "0",
  "isActive": true,
  "imageUrl": "/product-placeholder.svg"
}
```

PATCH chỉ gửi trường cần đổi; không nhận null, description/barcode hoặc trường lạ. costPrice bắt buộc khi tạo; các sản phẩm cũ có null vẫn đọc được và hiển thị “Chưa cập nhật”. Tạo/cập nhật kiểm tra danh mục hoạt động. SKU/slug trùng trả 409; input sai 400; không đăng nhập 401; sai vai trò 403; không tồn tại 404.

## Database mới nhất: dùng dữ liệu của nhóm

Schema hiện có `costPrice Decimal? @db.Decimal(14,2)` ánh xạ `cost_price`.
Có **4 migrations**, gồm `20261020081832_add_product_cost_price`; migration cuối còn thêm notifications. Hướng dẫn setup cũ nói “3 migrations” đã chưa cập nhật; `migrate deploy` tự áp dụng đủ migration còn thiếu.

Dùng PostgreSQL đang chạy tại máy (không bắt buộc Docker), có pgvector, pgcrypto, pg_trgm theo migrations. DATABASE_URL trong .env local phải trỏ đúng database thử nghiệm. Port lấy theo PostgreSQL thực tế: cài trực tiếp thường 5432, Docker cũ của nhóm publish 5433. Không đổi port nếu môi trường cậu đang chạy đúng.

Tại root dự án, PowerShell:

```powershell
cd backend
npm ci
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```

Chỉ tiếp tục khi mỗi lệnh thành công. Không reset DB, không db push --force-reset.

Nếu database demo chưa có dữ liệu, dùng **seed.ts của nhóm**, không cần SQL giả thay thế. Bật cờ chỉ cho tiến trình PowerShell, không ghi .env:

```powershell
$previousSeedFlag = $env:ALLOW_DEMO_SEED
try {
    $env:ALLOW_DEMO_SEED = "true"
    npx prisma db seed
} finally {
    if ($null -eq $previousSeedFlag) {
        Remove-Item Env:ALLOW_DEMO_SEED -ErrorAction SilentlyContinue
    } else {
        $env:ALLOW_DEMO_SEED = $previousSeedFlag
    }
}
```

Seed tạo 3 kho, danh mục, 200 sản phẩm, 600 inventory, 100 Customer, Admin và Staff. Nó dùng createMany(skipDuplicates)/upsert: dữ liệu đã tồn tại không được tự cập nhật giá nhập. Migration để costPrice cũ NULL là có chủ đích; không tự tạo giá vốn giả cho dữ liệu cũ. Seed cũng không ghi đè mật khẩu Admin/Staff đã đổi.

Tài khoản demo ban đầu:

| Vai trò | Username | Mật khẩu |
|---|---|---|
| ADMIN | admin | admin |
| STAFF | staff | staff |
| CUSTOMER | customer1 | FiveTL524 |

## Chạy ứng dụng

Backend terminal (backend/): `npm run start:dev`.
Frontend terminal (frontend/): `npm ci`, sau đó `npm run dev`.
Mở URL frontend do terminal thông báo. NEXT_PUBLIC_API_URL local phải đúng cổng backend; dùng cấu hình local đang chạy. FRONTEND_ORIGIN backend phải đúng origin frontend. Không commit .env/.env.local, không ghi đè cấu hình của nhóm.

## Test tự động và test database thật

Từ backend:

```powershell
npm test -- --runInBand products
npx eslint src/products
npm run build
```

Từ frontend:

```powershell
node --test tests/auth.test.mjs tests/cart.test.mjs tests/cart-store.test.mjs
npm run lint
npm run build
```

Khi backend thật đang chạy, từ root:

```powershell
node docs/p1-updates/smoke-products.mjs
```

Smoke mặc định localhost:3001, admin/admin, staff/staff; chỉ chấp nhận hostname loopback. Có thể đặt P1_API_URL, P1_ADMIN_USER, P1_ADMIN_PASSWORD, P1_STAFF_USER, P1_STAFF_PASSWORD tạm trong shell nếu môi trường khác. Script tạo duy nhất sản phẩm có prefix P1-TEST, kiểm tra CRUD/quyền/giá nhập, xóa đúng sản phẩm đó trong finally và logout các phiên test. Không sửa sản phẩm seed. Nếu lỗi cleanup, script in ID cần kiểm tra.

Chạy thêm thủ công:

1. Đăng nhập admin -> Sản phẩm: tạo sản phẩm với danh mục seed; sửa giá, ngừng bán; reload phải giữ thay đổi.
2. Đăng xuất -> staff: vào /staff/products, không có giá nhập/nút thêm/sửa/xóa. DevTools gọi POST/PATCH/DELETE vẫn 403.
3. Customer/khách gọi /admin/products phải 403/401. Public list/detail tuyệt đối không có costPrice trong Network response.
4. Sản phẩm seed đang có tồn kho: xóa phải 409, tồn kho giữ nguyên. Sản phẩm nằm trong đơn bất kỳ: phải 409. Sản phẩm mới chưa có tồn/đơn/lịch sử: xóa thành công.
5. Đăng ký bằng Gmail thật mình sở hữu để nhận email; mở verify-email?token=..., nhập mật khẩu và nhập lại. Sai confirm phải chặn ngay ở FE; request không có confirmPassword. Link thiếu/sai/hết hạn/đã dùng phải báo lỗi, không thông báo thành công giả.
6. Bấm gửi lại email xác thực rồi dùng liên kết mới. Token cũ bị backend vô hiệu. TTL xác thực/mời Staff hiện cấu hình mặc định 60s, reset 900s; backend quyết định hiệu lực, UI không tự giả định token còn hạn.
7. Nhờ Admin tạo lời mời Staff qua chức năng P2/Auth; mở staff-invitation, kiểm tra gọi activate-staff. Không tạo endpoint tự cấp quyền Staff.
8. Quên mật khẩu -> email -> reset-password. Gửi newPassword; đăng nhập bằng mật khẩu mới. Đổi mật khẩu tài khoản đã đăng nhập và đăng nhập lại.
9. F5 khôi phục phiên bằng refresh; logout về /login; chuyển Admin->Staff không giữ vai trò Admin. Giỏ hàng tuần 3 vẫn thêm/sửa/xóa, refresh catalog và chặn sản phẩm ngừng bán.

Test email cần SMTP/Gmail hợp lệ do người phụ trách Auth cấu hình; tài khoản demo không thay thế hộp thư thật để nhận link. Không chia sẻ token hay App Password trong ảnh/log.
