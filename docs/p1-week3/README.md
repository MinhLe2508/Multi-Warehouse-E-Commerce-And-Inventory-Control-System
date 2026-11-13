# [Trọng] P1 Tuần 3 — Giỏ hàng Storefront

Bản triển khai ngày 16/10/2026, dựa trên `origin/project` tại commit `b34dd2455b2c8ca4a45a7463d0450ad613ef2052`.

## 1. Phân công gốc và phạm vi

Nguồn: `Timeline_MultiWarehouse_Ecommerce(1).xlsx`, sheet `Trang tính1`, dòng 40–47.
Tuần 3: 18/10–25/10/2026. Dòng 44 (STT 16, P1):
“Cart module (BE tùy chọn — carts/cart_items) + trang giỏ hàng FE, đồng bộ CartStore.ts với server hoặc client-side theo quyết định Sprint 1.”

Bản này tiếp tục phương án client-side đang có trong source: Zustand + localStorage, key API `multimart-api-cart`, key mock `multimart-cart`. Không coi đây là bằng chứng nhóm đã phê duyệt phương án tại Sprint 1; cần nhóm xác nhận nếu muốn đổi sang giỏ gắn tài khoản/backend. Giỏ hiện được lưu theo trình duyệt, không đồng bộ nhiều thiết bị/tài khoản hay tự đồng bộ các tab.

Phần của các thành viên khác:
- P4: InventoryService, khóa dòng tồn kho, cập nhật tồn và audit.
- P3: giữ chỗ TTL 15 phút, kiểm thử chống oversell.
- P2: giao diện quản trị tồn kho.
- P5: Redis low-stock và cron giải phóng giữ chỗ.
- P1 Tuần 4 mới kết nối checkout/confirmation và xử lý lỗi 409 khi đặt hàng.

Hoàn thành giỏ P1 không đồng nghĩa milestone chống oversell của cả Tuần 3 đã đạt.

## 2. Chức năng đã triển khai

- Thêm cùng sản phẩm gộp một dòng; giới hạn số lượng theo tồn khả dụng đã nhận.
- Tăng/giảm/xóa một dòng, xác nhận trước khi xóa toàn giỏ.
- Lưu và phục hồi giỏ; loại dữ liệu không hợp lệ, gộp ID trùng, không âm thầm giảm số lượng cũ.
- Khi mở giỏ, danh sách ID thay đổi, quay lại tab hoặc bấm “Kiểm tra lại”: gọi `GET /products/:id` để cập nhật tên, ảnh, giá niêm yết và tồn.
- Giới hạn 6 request đồng thời, timeout 10 giây mỗi request; hủy/loại kết quả request cũ.
- Giá thay đổi có thông báo. Tồn giảm giữ nguyên số lượng khách đã chọn để họ thấy cảnh báo và tự giảm/xóa.
- Sản phẩm bị ẩn/xóa (404): đánh dấu không còn bán, vẫn giữ dòng để khách xóa.
- API lỗi mạng/503: giữ giỏ và hiển thị thử lại; không coi đó là sản phẩm đã bị xóa.
- Tính tạm tính chính xác theo đơn vị 1/100 bằng BigInt, giữ phần thập phân giá từ API.
- localStorage lỗi/hết dung lượng: giỏ vẫn dùng trong bộ nhớ và có cảnh báo.
- Không dùng giỏ client để giữ/trừ tồn kho. Tổng ở đây là giá niêm yết dự kiến; Pricing/Orders của P3 phải tính lại giảm giá, phí và kiểm tra kho trên server.
- Chế độ API chưa cho chuyển sang đặt hàng thật vì Orders chưa được kết nối. Mock checkout cũ vẫn giữ cho demo tuần 1.

## 3. File thay đổi

| File | Mục đích |
|---|---|
| frontend/shared/lib/cartModel.ts | Kiểu CartItem; kiểm tra storage; số tiền decimal; ghép kết quả API; kiểm tra số lượng |
| frontend/store/useCartStore.ts | Thao tác giỏ, persistence và cập nhật catalog |
| frontend/hooks/useCartSync.ts | Làm mới khi mở trang/quay lại tab/bấm nút; hủy request cũ |
| frontend/components/storefront/CartView.tsx | UI giá/tồn mới, cảnh báo, thử lại, tạm tính, xóa giỏ |
| frontend/tests/cart.test.mjs | 9 bài kiểm thử model |
| frontend/tests/cart-store.test.mjs | 7 bài kiểm thử store thật, chỉ thay HTTP bằng fake |
| docs/p1-week3/README.md | Kế hoạch, hướng dẫn, giới hạn và prompt review |

Bản vá không sửa Auth, Admin, CI, .env, schema/migration hay dependency/lockfile. Không thêm backend Cart vì tiếp tục lưu client-side.

## 4. Áp dụng trên Windows

Giải nén gói bàn giao vào ví dụ `D:\Trong_P1_Tuan3_Cart`. Mở terminal tại repo của bạn:

```powershell
git status
git branch --show-current
```

Nếu có thay đổi chưa lưu, commit/stash phù hợp trước khi chuyển nhánh; không chạy reset/clean để xử lý.
Khi working tree sạch:

```powershell
git switch project
git pull --ff-only origin project
git switch -c feature/trong-week3-cart
git apply --check "D:\Trong_P1_Tuan3_Cart\trong-week3-cart.patch"
```

Chỉ khi `--check` không báo lỗi mới áp dụng:

```powershell
git apply "D:\Trong_P1_Tuan3_Cart\trong-week3-cart.patch"
git diff --stat
git status
```

Bản vá dựa trên b34dd24. Nếu nhóm đã sửa cùng file hoặc đã có nhánh này, đừng copy đè/ép áp dụng; gửi kết quả kiểm tra để ghép đúng bản mới. `files/` trong gói chỉ dùng đối chiếu các file đã thay đổi, không phải toàn repo.

## 5. Chạy và kiểm tra

Dùng Node.js 24. Giữ backend/DB đã thiết lập ở Tuần 2. Không cần chạy lại seed hoặc tạo database cho phần giỏ. Backend Products API cần phản hồi để kiểm tra giá/tồn mới.
Trong terminal frontend riêng (dừng dev server cũ trước khi npm ci nếu Windows khóa DLL):

```powershell
cd frontend
npm ci
node --test tests/cart.test.mjs tests/cart-store.test.mjs
npm run lint
npm run build
npm run dev
```

Mở địa chỉ Local được terminal in ra, vào `/products` rồi `/cart`. API mặc định localhost:3001; dùng cấu hình cá nhân đang có. File .env của bạn không nằm trong bản vá.

Kết quả đã thực hiện ở môi trường bàn giao:
- 16/16 bài kiểm thử model/store đạt (Node 24).
- ESLint frontend đạt.
- Build production frontend và kiểm tra TypeScript đạt.
- Kiểm tra git diff --check đạt.
- Chưa chạy UI/E2E trong Chromium: môi trường không có browser, tải binary thất bại.
- Chưa chạy với database thật hay xác nhận GitHub CI hiện tại. Test store dùng HTTP fake để mô phỏng có kiểm soát.
- CI integration thiếu migration ghi nhận ở Tuần 2 vẫn nằm ngoài bản vá này; build frontend đạt không chứng minh CI cả dự án đã đạt.

Node có thể báo MODULE_TYPELESS_PACKAGE_JSON khi chạy test .ts trực tiếp. Đây là cảnh báo cách Node tải module, không cần đổi type của toàn dự án chỉ để tắt cảnh báo.

Checklist nhóm cần chạy thực tế:
1. Thêm một sản phẩm nhiều lần: một dòng, số lượng/tổng đúng.
2. Tăng đến tồn tối đa, không tăng thêm; giảm về 1, xóa dòng và xóa toàn giỏ.
3. Reload: giỏ còn, giá/tồn được kiểm tra lại.
4. Dùng dữ liệu test riêng thay giá/tồn bằng công cụ của nhóm, bấm kiểm tra lại: giá đổi có thông báo; tồn nhỏ hơn lượng chọn có cảnh báo; không tự cắt lượng.
5. Hết hàng ở mọi kho: không tăng số lượng. Ẩn/xóa sản phẩm test: báo không còn bán.
6. Dừng backend: giỏ giữ nguyên, báo không kiểm tra được; mở lại backend rồi thử lại.
7. Trong lúc API chậm, giảm số lượng/xóa dòng: kết quả về không ghi đè lựa chọn hay hồi sinh dòng.
8. Kiểm tra responsive ở 390px và desktop, tiếng Việt/Anh, bàn phím, không lỗi console/hydration.
9. Kiểm tra mock mode nếu nhóm vẫn dùng demo tuần 1.

Chỉ ghi nhận nghiệm thu đầy đủ sau khi checklist thực tế được nhóm xác nhận.

## 6. Prompt để AI review độc lập

```text
Bạn đang review P1 Tuần 3 của Trọng cho Multi-Warehouse E-Commerce & Inventory Control System.
Nguồn phân công: Timeline_MultiWarehouse_Ecommerce(1).xlsx, dòng 44: Cart module (BE tùy chọn) + trang giỏ FE, đồng bộ CartStore với server hoặc client-side theo quyết định Sprint 1.

Đọc docs/p1-week3/README.md, source hiện tại và git diff. Bản này tiếp tục Zustand/localStorage đang có; chỉ lấy giá/tồn mới từ Products API. Hãy:
1. Kiểm tra phạm vi đúng P1, không nhận thay nhiệm vụ Stock Reservation, Inventory hay Payment.
2. Review thêm/gộp/sửa/xóa giỏ, dữ liệu localStorage không tin cậy, lỗi quota, giá decimal, tồn giảm, 404 và mạng lỗi.
3. Review request về sai thứ tự; sửa số lượng/xóa giỏ trong lúc tải; không làm mất giỏ hoặc hồi sinh sản phẩm đã xóa.
4. Kiểm tra UI loading/error/retry và thông báo tồn/giá; kiểm tra mobile, tiếng Việt/Anh, hydration.
5. Chạy node --test tests/cart.test.mjs tests/cart-store.test.mjs, npm run lint, npm run build từ frontend. Thêm test chỉ khi có rủi ro cụ thể còn thiếu.
6. Nếu có backend/database test thật, chạy checklist trong README. Không dùng database chung để sửa dữ liệu thử.
7. Báo lỗi theo mức độ, file, bước tái hiện và đề xuất sửa. Phân biệt test thực sự chạy với test chưa chạy.
Giỏ client không phải nguồn giá cuối cùng và không đảm bảo chống oversell. Chưa bật checkout thật khi Orders/Pricing chưa sẵn sàng. Không tự sửa CI/Auth/schema/.env hoặc push/merge.
```

## 7. Commit sau khi nhóm kiểm tra

```powershell
git add -- frontend/components/storefront/CartView.tsx frontend/store/useCartStore.ts frontend/hooks/useCartSync.ts frontend/shared/lib/cartModel.ts frontend/tests/cart.test.mjs frontend/tests/cart-store.test.mjs docs/p1-week3/README.md
git diff --cached --check
git diff --cached --stat
git commit -m "[Trong] - Complete Week 3 client-side cart and catalog refresh"
git push -u origin feature/trong-week3-cart
```

Đích PR là `project`. Nếu nhóm thống nhất push thẳng thì cần ghép bản mới và kiểm tra theo quy trình nhóm; không force-push. Bộ bàn giao này chưa commit/push/merge lên GitHub.
