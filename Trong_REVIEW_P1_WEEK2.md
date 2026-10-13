# Hướng dẫn review P1 Tuần 2 — Products API và Storefront

- Người thực hiện: Trọng (P1).
- Ngày soạn: 13/10/2026.
- Repository: https://github.com/MinhLe2508/Multi-Warehouse-E-Commerce-And-Inventory-Control-System
- Nhánh kiểm thử: `feature/trong-week2-products`.
- Commit code Trọng đã push: `42e9a3b` — `Complete P1 Week 2: Product API and frontend integration`.
- Nhánh nhận sau review: **`project`**, không phải `main`.
- Mục tiêu: thành viên chạy độc lập, ghi kết quả và xác nhận trước khi merge PR.

## 1. Phạm vi bàn giao

P1 nối giao diện Storefront với PostgreSQL qua NestJS/Prisma:

- `GET /products`: danh sách, tìm tên/SKU, lọc danh mục, sắp xếp giá niêm yết, phân trang.
- `GET /products/categories`: danh mục đang hoạt động cho bộ lọc.
- `GET /products/:id`: chi tiết và tồn khả dụng theo kho.
- Giao diện: trang chủ, danh sách, chi tiết, loading, rỗng, lỗi/thử lại, không tìm thấy.
- Giỏ phía trình duyệt nhận sản phẩm từ API, giới hạn theo tồn đã tải, lưu qua reload.
- Tồn khả dụng = `stock - reserved_stock`; chỉ cộng kho đang hoạt động.

Không thay schema/migration của nhóm. Chưa bàn giao đặt đơn/thanh toán thật, giữ hàng khi nhiều khách mua đồng thời, hoặc tự đồng bộ lại giá/tồn ở giỏ. Checkout ở chế độ API không được tạo đơn demo với sản phẩm thật. Tìm kiếm không cam kết bỏ dấu hoặc gần đúng; lọc danh mục chưa bao gồm cây danh mục con.

## 2. Trạng thái trước review

Trọng đã báo đạt trên máy local: danh sách/chi tiết, tìm kiếm, lọc, giá tăng/giảm, phân trang, hết hàng, ID sai/không tồn tại, mất kết nối/thử lại và tên kho tiếng Việt. Đây là kết quả kiểm thử thủ công do tác giả báo, chưa phải xác nhận độc lập của người review.

Ở bản triển khai trước đó: build frontend/backend và 14 test Products dùng Prisma mock đã đạt. Các kết quả cũ không thay thế lần chạy trên commit của người review. Các ca nhiều kho, kho inactive và các dòng chưa thực hiện bên dưới phải để `CHƯA TEST`, không tự đánh dấu PASS.

Các tài liệu cũ `README.md`/`validation.md` có thể vẫn ghi trạng thái trước kiểm thử local. File này hướng dẫn review mới; ghi commit thực tế trong biên bản cuối file.

## 3. Lấy code mà không ghi đè công việc đang làm

Các lệnh dưới đây dành cho PowerShell Windows. Cách dễ nhất là clone vào một thư mục review mới. Mở PowerShell tại thư mục cha muốn chứa dự án:

```powershell
git clone --branch feature/trong-week2-products --single-branch https://github.com/MinhLe2508/Multi-Warehouse-E-Commerce-And-Inventory-Control-System.git P1-Week2-Review
cd P1-Week2-Review
git branch --show-current
git log -1 --oneline
git status
```

Nếu đã có thư mục review riêng, working tree sạch và đang ở đúng nhánh:

```powershell
git pull --ff-only origin feature/trong-week2-products
```

Không dùng `reset --hard`, không chép đè lên thư mục đang làm của thành viên khác. Clone mới chỉ tách code; vẫn phải xác nhận kết nối database local trước khi chạy migration/SQL.

Nếu nhánh có thêm commit tài liệu sau `42e9a3b`, ghi hash mới vào biên bản. Có thể kiểm tra commit code đã nằm trong lịch sử bằng `git log --oneline -10`.

## 4. Chuẩn bị môi trường

Cần Git, Docker Desktop đang mở và Node/npm tương thích dự án. Dùng phiên bản Node nhóm đang thống nhất; tham khảo Dockerfile trong repo. Không nâng phiên bản package/Prisma trong lúc review.

### Cấu hình local

Hướng dẫn này không cung cấp lệnh ghi hoặc thay biến môi trường.

- Backend/Prisma đọc `.env` ở **gốc repository** khi chạy từ thư mục `backend`.
- Nếu thư mục review chưa có `.env`, tự chuẩn bị bằng trình soạn thảo theo mẫu gốc và cấu hình local nhóm đã thống nhất; không lấy cấu hình database dùng chung/production để chạy fixture.
- Giữ bí mật thực tế trên máy, không commit `.env` hoặc `.env.local`.
- Mẫu gốc có thể có phần hướng dẫn bắt đầu bằng `//`. Trong `.env` dùng với Docker Compose, đổi các dòng chú thích đó thành `#` hoặc bỏ chúng bằng trình soạn thảo. Không sửa giá trị kết nối đang đúng chỉ để test P1.
- Compose có thể kiểm tra cả biến cấu hình các service khác dù chỉ bật PostgreSQL; nếu báo thiếu biến, hoàn thiện cấu hình local theo mẫu của nhóm. Không cần gửi email hay đăng nhập để thử Products.
- `frontend/.env.example` là mẫu được phép chia sẻ, không chứa bí mật. Frontend mặc định dùng API `http://localhost:3001` và chế độ API khi không cấu hình khác. Nếu đã có cấu hình riêng, kiểm tra không đặt chế độ `mock` hoặc API trỏ dự án khác.

Bộ cổng đã chạy trên máy Trọng:

| Thành phần | Địa chỉ/cách chạy |
| --- | --- |
| PostgreSQL | Docker, host `127.0.0.1:5433` tới container `5432` |
| Backend | npm, `http://localhost:3001` |
| Frontend | npm, `http://localhost:3000` |
| Redis nếu backend cần | Dịch vụ local theo cấu hình của nhóm, thường `6379` |

Nếu dùng cổng khác, backend, frontend, DATABASE_URL và CORS phải khớp. Không mặc định rằng cổng 3000 đang chạy là đúng dự án.

### Khởi động database — tại gốc repository

```powershell
docker compose up -d postgres
docker compose ps postgres
```

Chờ trạng thái `healthy`. Products đọc PostgreSQL; `/health` còn kiểm tra Redis nên lỗi Redis không tự chứng minh Products lỗi. Nếu backend cần Redis, chạy `docker compose up -d redis` khi cổng đã sẵn sàng và cấu hình đúng. Không dùng Redis của dự án khác một cách vô tình.

### Cài và chuẩn bị backend — chỉ cần khi mới lấy code hoặc dependency thay đổi

Chạy từng lệnh; nếu một lệnh lỗi, dừng và xử lý trước lệnh tiếp theo:

```powershell
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
```

Xác nhận log Prisma chỉ tới database **local dành cho review**. Migration tạo/cập nhật cấu trúc, không tự có sản phẩm. Không dùng `migrate reset`. Không chạy `prisma db seed`: seed demo có guard riêng; dùng fixture có phạm vi rõ ràng ở mục 5.

### Chạy backend

Trong thư mục `backend`:

```powershell
npm run start:dev
```

Giữ terminal này mở. Kiểm tra log backend khởi động thành công.

### Chạy frontend — terminal khác

Từ gốc thư mục review:

```powershell
cd frontend
npm ci
npm run dev
```

Chỉ cần `npm ci` lần đầu hoặc khi dependency thay đổi. Không chạy nó trong lúc frontend đang chạy. Mở http://localhost:3000/products sau khi terminal báo Ready.

Những lần mở lại: bật PostgreSQL, chạy `npm run start:dev` trong backend và `npm run dev` trong frontend. Không cần cài lại hoặc nhập fixture lại mỗi lần.

## 5. Dữ liệu kiểm thử độc lập, có thể chạy lại

Chỉ chạy trên PostgreSQL Docker local dành cho review. SQL này thêm/cập nhật đúng tiền tố `REVIEW-P1-W2-` và danh mục `review-p1-week2`, không xóa bảng hay dữ liệu khác. Chạy lại sẽ đặt lại giá/tồn của các sản phẩm review. Dữ liệu nằm trong volume Docker, không tự đi lên Git.

Fixture gồm 16 sản phẩm trong một danh mục, giá 10.000–160.000đ, ba kho (hai hoạt động, một inactive). Sản phẩm 001 có tồn khả dụng 15; 015 chỉ còn hàng ở kho thứ hai; 016 hết hàng. Kho inactive có 50 đơn vị của 001 nhưng không được tính. Tên dùng Unicode escape để tránh mất dấu khi pipe qua Windows PowerShell.

Mở terminal tại **gốc repository**, không ở backend/frontend. Lệnh dùng user/database `warehouse` như mẫu dự án; nếu local dùng tên khác, sửa `-U` và `-d` cho đúng trước khi chạy.

```powershell
@'
BEGIN;
DO $$
DECLARE
  v_category UUID;
  v_w1 UUID;
  v_w2 UUID;
  v_w3 UUID;
  v_product UUID;
  v_suffix TEXT;
  i INTEGER;
BEGIN
  INSERT INTO categories (name, slug, updated_at)
  VALUES (U&'Review P1 - Tu\1EA7n 2', 'review-p1-week2', NOW())
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW()
  RETURNING id INTO v_category;

  INSERT INTO warehouses (code, name, region, is_active, updated_at)
  VALUES ('REVIEW-P1-W2-A', U&'Kho ki\1EC3m th\1EED A', 'LOCAL', true, NOW())
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW()
  RETURNING id INTO v_w1;

  INSERT INTO warehouses (code, name, region, is_active, updated_at)
  VALUES ('REVIEW-P1-W2-B', U&'Kho ki\1EC3m th\1EED B', 'LOCAL', true, NOW())
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, updated_at = NOW()
  RETURNING id INTO v_w2;

  INSERT INTO warehouses (code, name, region, is_active, updated_at)
  VALUES ('REVIEW-P1-W2-INACTIVE', 'Review inactive warehouse', 'LOCAL', false, NOW())
  ON CONFLICT (code) DO UPDATE SET is_active = false, updated_at = NOW()
  RETURNING id INTO v_w3;

  FOR i IN 1..16 LOOP
    v_suffix := lpad(i::text, 3, '0');
    INSERT INTO products
      (sku, name, slug, description, base_price, discount_percent, category_id, image_url, updated_at)
    VALUES
      ('REVIEW-P1-W2-' || v_suffix,
       U&'S\1EA3n ph\1EA9m review ' || v_suffix || CASE WHEN i = 16 THEN ' - HET HANG' ELSE '' END,
       'review-p1-week2-' || v_suffix,
       'Local review fixture for P1 Week 2', i * 10000, 0,
       v_category, '/product-placeholder.svg', NOW())
    ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name, base_price = EXCLUDED.base_price, discount_percent = 0,
      category_id = EXCLUDED.category_id, image_url = EXCLUDED.image_url,
      is_active = true, updated_at = NOW()
    RETURNING id INTO v_product;

    INSERT INTO inventory (product_id, warehouse_id, stock, reserved_stock, updated_at)
    VALUES
      (v_product, v_w1, CASE WHEN i IN (15,16) THEN 0 WHEN i = 1 THEN 12 ELSE 20 END,
       CASE WHEN i = 1 THEN 2 ELSE 0 END, NOW()),
      (v_product, v_w2, CASE WHEN i IN (1,15) THEN 5 ELSE 0 END, 0, NOW()),
      (v_product, v_w3, CASE WHEN i = 1 THEN 50 ELSE 0 END, 0, NOW())
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
      stock = EXCLUDED.stock, reserved_stock = EXCLUDED.reserved_stock, updated_at = NOW();
  END LOOP;
END $$;
COMMIT;
'@ | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U warehouse -d warehouse
```

Mong đợi: `BEGIN`, `DO`, `COMMIT`. Nếu lỗi, không tiếp tục đánh giá UI với dữ liệu chưa đầy đủ; gửi log SQL. Fixture đặt `reserved_stock` trực tiếp để thử công thức đọc tồn, không tạo luồng đặt đơn/stock reservation nghiệp vụ. Không dùng nó để nghiệm thu Orders.

## 6. Kiểm tra API và đối chiếu dữ liệu

Backend phải đang chạy. Các biến `$catalog`, `$reviewProductId` dưới đây chỉ giữ kết quả trong PowerShell, không phải biến môi trường và không ghi file `.env`.

```powershell
$catalog = Invoke-RestMethod 'http://localhost:3001/products?category=review-p1-week2&sort=price-asc&page=1&pageSize=12'
$catalog | ConvertTo-Json -Depth 8
$reviewProductId = $catalog.items[0].id
Invoke-RestMethod "http://localhost:3001/products/$reviewProductId" | ConvertTo-Json -Depth 8
```

Mong đợi: `total=16`, `totalPages=2`, trang 1 có 12 phần tử; sản phẩm đầu SKU `REVIEW-P1-W2-001`, `basePrice="10000.00"`, `availableStock=15`, `isAvailable=true`. `stockByWarehouse` có kho A=10 và B=5; không có kho inactive.

Đối chiếu DB, chỉ đọc:

```powershell
@'
SELECT p.sku, w.code, w.is_active, i.stock, i.reserved_stock, i.available_stock
FROM inventory i
JOIN products p ON p.id = i.product_id
JOIN warehouses w ON w.id = i.warehouse_id
WHERE p.sku IN ('REVIEW-P1-W2-001', 'REVIEW-P1-W2-015', 'REVIEW-P1-W2-016')
ORDER BY p.sku, w.code;
'@ | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U warehouse -d warehouse
```

API thử lỗi: mở từng URL trong trình duyệt hoặc dùng `Invoke-WebRequest`/DevTools Network để xem HTTP status. PowerShell báo lỗi đỏ với 400/404 là bình thường cho các ca cố ý này.

| URL sau `http://localhost:3001` | Mong đợi |
| --- | --- |
| `/products/categories` | 200, có danh mục review |
| `/products/abc` | 400: sai định dạng UUID |
| `/products/11111111-1111-4111-8111-111111111111` | 404 nếu UUID này không có trong DB local |
| `/products?page=0` | 400 |
| `/products?pageSize=101` | 400 |
| `/products?sort=sai` | 400 |
| `/products?category=review-p1-week2&page=999` | 200, items rỗng; không phải 500 |

## 7. Checklist giao diện và nghiệp vụ

Mở http://localhost:3000/products ở cửa sổ riêng tư để giỏ cũ không ảnh hưởng. Chọn danh mục **Review P1 - Tuần 2**, xóa từ khóa cũ. Mỗi dòng ghi `PASS`, `FAIL` hoặc `CHƯA TEST`; đính kèm bằng chứng khi có lỗi.

| ID | Thao tác | Kết quả mong đợi | Kết quả reviewer |
| --- | --- | --- | --- |
| UI01 | Mở danh sách và chi tiết | Tên, giá, ảnh placeholder, mô tả hiển thị; không có lỗi giao diện | CHƯA TEST |
| UI02 | Tìm `REVIEW-P1-W2-001` bằng ô tìm kiếm danh sách | Đúng một sản phẩm; Enter thực hiện tìm | CHƯA TEST |
| UI03 | Tìm `khong-co-san-pham-xyz` | Trạng thái rỗng và thao tác bỏ bộ lọc | CHƯA TEST |
| UI04 | Chuyển danh mục review ↔ tất cả | Danh sách đúng bộ lọc; không lẫn danh mục khác khi chọn review | CHƯA TEST |
| UI05 | Giá tăng dần | Trang 1: 10.000–120.000đ; trang 2: 130.000–160.000đ | CHƯA TEST |
| UI06 | Giá giảm dần | Trang 1: 160.000–50.000đ; trang 2: 40.000–10.000đ | CHƯA TEST |
| UI07 | Chuyển trang 1, 2; tại trang 2 đổi tìm kiếm/sắp xếp | 12 rồi 4 sản phẩm; đổi bộ lọc trở lại trang 1 | CHƯA TEST |
| UI08 | Mở 001 | Kho A=10, B=5, tổng=15; tên kho đúng dấu | CHƯA TEST |
| UI09 | Xem 001 với kho inactive có 50 hàng | Không hiện/cộng kho inactive; tổng không thành 65 | CHƯA TEST |
| UI10 | Mở 015 | A=0, B=5, tổng=5, vẫn thêm được vào giỏ | CHƯA TEST |
| UI11 | Mở 016 và xem card của nó | Tổng=0, hết hàng, không thêm vào giỏ được | CHƯA TEST |
| UI12 | Với giỏ trống, thêm 001 đến 15 đơn vị | Không thêm quá 15 qua thao tác giao diện | CHƯA TEST |
| UI13 | Mở `/cart`, tải lại | Sản phẩm từ API vẫn được lưu, số lượng hợp lý | CHƯA TEST |
| UI14 | Mở `/checkout` ở chế độ API | Thông báo chưa hoàn thiện; không tạo đơn demo giả thành công | CHƯA TEST |
| UI15 | Mở `/products/11111111-1111-4111-8111-111111111111` | Trạng thái không tìm thấy; trang không văng lỗi | CHƯA TEST |
| UI16 | Ctrl+C chỉ terminal backend, tải lại danh sách | Hiện lỗi tải dữ liệu, có Thử lại; timeout khoảng 10 giây nếu kết nối treo | CHƯA TEST |
| UI17 | Bật lại backend bằng `npm run start:dev`, nhấn Thử lại | Danh sách tải thành công | CHƯA TEST |
| UI18 | Thu nhỏ cửa sổ điện thoại, đổi danh mục và trang | Bộ lọc và phân trang vẫn thao tác được | CHƯA TEST |

Bộ fixture trên có các dòng inventory bằng 0 cho sản phẩm hết hàng; nó chưa kiểm thử trường hợp hoàn toàn không có dòng inventory. Ca đó có thể kiểm thêm trên DB review nếu nhóm yêu cầu và phải ghi riêng. Giới hạn giỏ phía frontend không chứng minh chống bán vượt tồn khi nhiều người đặt hàng đồng thời.

## 8. Build và test tự động

Dừng dev server tương ứng trước khi build/cài lại. Chạy từng lệnh riêng và giữ kết quả/exit status.

Tại `backend`:

```powershell
npm run build
npm test -- --runInBand products.spec.ts
```

Tại `frontend`:

```powershell
npm run build
```

Mong đợi build thành công và test Products đạt (bản đã soạn có 14 test). Test này dùng Prisma mock, không thay thế mục 6–7 trên PostgreSQL.

Lint toàn repo từng có lỗi `no-explicit-any` ở `frontend/components/admin/RevenueChart.tsx` ngoài phạm vi P1. Nếu gặp lại, ghi rõ log và đối chiếu nhánh nền trước khi kết luận; không tự coi mọi lỗi lint là lỗi cũ hoặc bỏ qua gate bắt buộc của nhóm. Không chạy `npm audit fix --force` để xử lý sự cố review.

## 9. Các file cần đọc khi review code

| Nhóm | File và mục đích |
| --- | --- |
| API đầu vào | `backend/src/products/products.controller.ts`, `dto/product-query.dto.ts`: route, kiểm tra UUID/query |
| Truy vấn | `backend/src/products/products.service.ts`: lọc hoạt động, giá Decimal, tính tồn, phân trang |
| Đăng ký | `backend/src/products/products.module.ts`, `backend/src/app.module.ts` |
| Test | `backend/src/products/products.spec.ts` |
| Kết nối FE | `frontend/shared/lib/catalogApi.ts`, `frontend/hooks/useCatalog.ts` |
| Danh sách/chi tiết | `frontend/components/storefront/ProductList.tsx`, `ProductDetail.tsx`, `ProductCard.tsx`, `CatalogStatus.tsx` |
| Trang | `frontend/app/(Storefront)/page.tsx`, `products/[id]/page.tsx` |
| Tương thích giỏ | `frontend/store/useCartStore.ts`, `components/storefront/CartView.tsx`, `app/(Storefront)/checkout/page.tsx` |
| Hỗ trợ | `frontend/shared/types/product.ts`, `shared/lib/utils.ts`, `public/product-placeholder.svg` |
| Cấu hình mẫu | `frontend/.env.example`, `frontend/.gitignore`: không đưa bí mật thật lên Git |

P4 nên kiểm tra contract schema, tồn khả dụng và quyền đọc catalog công khai. P3 nên kiểm tra quy ước giá và ranh giới với Pricing/Orders. Người phụ trách tích hợp kiểm tra AppModule, build và xung đột với `project` hiện tại.

## 10. Lỗi thiết lập thường gặp

| Triệu chứng | Cách xử lý |
| --- | --- |
| Compose báo unexpected `/` trong `.env` | Sửa chú thích `//` thành `#` bằng editor trong cấu hình local |
| Cổng 3000/3001/5433/6379 bị chiếm | Chạy `docker ps --format "table {{.Names}}\t{{.Ports}}"`; xác định đúng ứng dụng chiếm cổng rồi dừng nó nếu được phép. Không tắt hàng loạt container hoặc WSL |
| npm ci EPERM với lightningcss | Dừng frontend đang giữ file bằng Ctrl+C, rồi thử cài lại; không chạy dev khi cài thất bại |
| `'next' is not recognized` | Kiểm tra `npm ci` đã thành công trong frontend |
| Không lấy được sản phẩm | Thử trực tiếp API 3001; kiểm tra backend, DATABASE_URL, fixture, URL API frontend và CORS |
| Frontend tự chọn cổng khác | Giải phóng đúng cổng 3000 hoặc thống nhất lại CORS; không chỉ đổi URL trình duyệt rồi bỏ qua cấu hình |
| API trả rỗng | Kiểm tra đúng DB, danh mục và từ khóa; migration không tạo sản phẩm |
| Tên có dấu `?` | Dữ liệu đã mất dấu khi nhập; chạy fixture Unicode escape, không sửa font để che lỗi |
| `/health` báo Redis lỗi | Kiểm tra Redis theo cấu hình nhóm; kiểm tra `/products` riêng để xác định ảnh hưởng tới catalog |

Không dùng `docker compose down -v` vì sẽ xóa volume dữ liệu của compose project. Khi dừng review, Ctrl+C frontend/backend; có thể `docker compose stop postgres` tại đúng thư mục nếu DB không còn được dùng.

## 11. Mẫu ghi kết quả review

Sao chép phần này vào mô tả/comment PR sau khi kiểm tra. Không điền PASS trước khi chạy.

```text
Reviewer:
Ngày:
Nhánh: feature/trong-week2-products
Commit được kiểm tra (git rev-parse HEAD):
Môi trường: Windows / Node ... / npm ... / Docker ...
Database: local dành cho review (không ghi mật khẩu)

Backend build: PASS / FAIL
Products tests: ... / ...
Frontend build: PASS / FAIL
API mục 6: PASS / FAIL / CHƯA TEST
UI01–UI18: liệt kê kết quả từng ca hoặc đính kèm bảng

Lỗi phát hiện:
- Test ID:
- Bước tái hiện:
- Mong đợi:
- Thực tế:
- Ảnh/log (đã che bí mật):

Mục chưa kiểm tra và lý do:
Kết luận: ĐỒNG Ý MERGE / CẦN SỬA / CHƯA ĐỦ BẰNG CHỨNG
```

## 12. Điều kiện gộp vào project

1. Reviewer kiểm tra đúng nhánh/commit và ghi kết quả, các luồng chính đạt.
2. Build/test đạt; lỗi còn lại và giới hạn đã được nhóm chấp nhận rõ ràng.
3. PR chọn **base: `project`**, **compare: `feature/trong-week2-products`**; Files changed chỉ có thay đổi dự kiến, không có `.env` thật hay dữ liệu Docker.
4. Nếu `project` có thay đổi mới gây xung đột hoặc ảnh hưởng contract, giải quyết trên nhánh làm việc và kiểm thử lại phần bị tác động trước khi merge.
5. Người có quyền của nhóm review/merge theo quy trình. Tạo PR chưa đồng nghĩa đã merge.
6. Hoàn thiện tài liệu, kết quả kiểm thử và timeline P1 khi bàn giao; không đánh dấu milestone toàn nhóm chỉ vì P1 đã đạt.

File hướng dẫn này có thể commit riêng tại `docs/p1-week2/TEAM_REVIEW_P1_WEEK2.md` trên cùng nhánh. Commit tài liệu mới sẽ xuất hiện trong PR hiện có; không cần tạo nhánh hoặc PR khác.
