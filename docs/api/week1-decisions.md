# Quyết định và điểm review — tuần 1 của Huy

**Phiên bản:** 0.1.1 · **Cập nhật:** 09/10/2026.  
**Phạm vi:** API Contract Orders, Payments, Stock Reservation; cập nhật phụ thuộc Auth từ trao đổi nhóm.  
**Trạng thái bàn giao:** Tài liệu để nhóm review, chưa xác nhận nhóm đã phê duyệt toàn bộ.

## 1. Phân loại bằng chứng

| Nhãn | Ý nghĩa |
|---|---|
| SOURCE | Đã đọc thấy trong ZIP commit `2cc0677fd6fd1a0253f400a71a2f71d1d01ff505` |
| NHÓM | Huy xác nhận hoặc ảnh cập nhật nhóm thể hiện yêu cầu/quyết định; không đồng nghĩa đã có code |
| ĐỀ XUẤT | Lựa chọn cụ thể trong bộ contract này để frontend/backend cùng review |

Không lấy screenshot thay cho source code mới. Ba ảnh 09/10 chỉ thay đổi yêu cầu tích hợp liên quan; schema và SQL hiện vẫn căn cứ bản ZIP 08/10.

## 2. Nguồn đã xác định

| ID | Nội dung | Nhãn |
|---|---|---|
| S01 | Timeline giao Huy soạn API Orders/Payments/Stock Reservation tuần 1; deadline 11/10/2026 | SOURCE: timeline |
| S02 | Khang chọn `fn_reserve_stock()` | NHÓM: Huy thông báo trong hội thoại |
| S03 | Hàm nhận BIGINT, UUID, INTEGER, INTEGER DEFAULT 15; trả BIGINT reservation ID | SOURCE: migration thứ hai |
| S04 | Hàm tự tăng reserved_stock và insert HOLDING, chưa ghi audit/gắn OrderItem/commit/release | SOURCE |
| S05 | 18 model, 10 enum; tiền Decimal(14,2), ID inventory/reservation BIGINT | SOURCE |
| S06 | UserRole gồm CUSTOMER, WAREHOUSE_STAFF, ADMIN; không có enum STAFF | SOURCE |
| S07 | transaction_ref UNIQUE và partial UNIQUE một SUCCESS payment/order | SOURCE |
| S08 | available_stock generated; CHECK tồn kho và deferred trigger consistency | SOURCE |
| S09 | ZIP chưa có Auth/Orders/Payments controllers, hai file filter/interceptor đang bị import nhưng thiếu | SOURCE |
| S10 | `AppModule.imports` rỗng; PrismaModule có file nhưng chưa đăng ký vào ứng dụng | SOURCE |

## 3. Các ảnh ngày 09/10 có thuộc phần Huy không?

| Cập nhật trong ảnh | Liên quan phần Huy | Xử lý trong bộ tài liệu |
|---|---|---|
| Customer/Staff phải đổi mật khẩu lần đầu trước khi dùng chức năng khác | **Có, trực tiếp ở quyền truy cập API** | Tất cả 6 operation dành cho CUSTOMER yêu cầu hoàn tất đổi mật khẩu; thêm response 403 PASSWORD_CHANGE_REQUIRED |
| Admin tạo Staff, Customer đăng ký, email có thông tin đăng nhập | Phụ thuộc Auth | Ghi đầu vào Auth; không tạo endpoint đăng ký/nhân viên trong phần Huy |
| Tên đăng nhập lấy phần trước @ của email | Chỉ liên quan nhận diện người dùng | Orders vẫn dùng users.id UUID từ server, không dùng username/email làm order owner |
| Quản trị có thể khóa/mở khóa tài khoản nhân viên | Liên quan cơ chế Auth chung | Đề xuất ACCOUNT_INACTIVE khi Auth không cho hoạt động; cách biểu diễn locked/inactive do Khang quyết định |
| Khang nhận phần email bằng Nodemailer | Không phải nhiệm vụ Huy triển khai | Không thêm Nodemailer/dependency/mailer vào bộ bàn giao |
| Reset mật khẩu theo cơ chế nhóm đã chọn và chấp nhận hạn chế ở mức đồ án | Thuộc Auth | Ghi ranh giới; không tự thay quy trình reset hoặc đưa mật khẩu vào API đơn hàng |
| Thông tin cá nhân, avatar, quản trị nhân viên | Ngoài phạm vi Orders/Payments/Reservation tuần 1 | Không bổ sung API mới cho các phần này |
| Commit theo mẫu `[Tên] - Nhiệm vụ hoặc các file đã sửa/code` | **Có, trực tiếp ở bàn giao** | README dùng `[Huy] - Soạn API Contract Orders Payments Stock Reservation tuần 1` |

Nguồn ảnh: `image(2).png`, `image(3).png`, `image(4).png`. Ảnh đầu có cách gọi Customer/Staff/Admin theo giao diện; chưa có thông báo đổi enum nên giữ UserRole từ schema. Nội dung email được nói là “xác thực” nhưng chưa có chi tiết link/token; không suy diễn thành kiểm tra EMAIL_NOT_VERIFIED.

## 4. Phương án nhất quán để nhóm review

| ID | Quyết định trong bản dự thảo | Cơ sở/lý do | Cần review |
|---|---|---|---|
| D01 | HTTP camelCase, route không prefix, JSON trực tiếp; list có items/pagination | main.ts hiện chưa đặt prefix; cần frontend có một định dạng duy nhất | Minh, Trọng |
| D02 | Tiền chuỗi 2 số lẻ, BIGINT chuỗi, UUID string, thời gian ISO 8601 | Bám kiểu DB và tránh mất chính xác JSON | Huy, Khang |
| D03 | Khách chỉ xem/thao tác đơn của mình; khác chủ trả 404; role không CUSTOMER trả 403 | Không lộ resource người khác; admin có API riêng của Triết | Khang, Triết |
| D04 | InventoryService wrapper sở hữu SQL, StockReservationService điều phối cùng tx | Dung hòa NT-08 và mục 10.2 PDF; wrapper chưa có code | Khang, Huy |
| D05 | Ưu tiên region, rồi warehouse.code/id; phân bổ tham lam có tách kho; reserve toàn đơn theo id tăng dần | Cụ thể hóa chọn kho, bảo đảm có thể mock đa kho | Khang, Trọng |
| D06 | VND; phí ship 0; basePrice snapshot, giảm giá theo từng dòng HALF_UP 2 số | Chưa có Pricing service; tuân CHECK tổng tiền | Huy, nhóm |
| D07 | Tạo đơn chưa có idempotency key; payment PENDING cùng method được trả lại dưới khóa Order | Không giả định có bảng/cột idempotency; hạn chế giao dịch chờ trùng | Huy, Khang |
| D08 | Khóa Order → Payment nếu cần → Inventory tăng dần → Reservation tăng dần; cleanup lấy Order SKIP LOCKED | Phối hợp payment/cancel/cleanup; điều chỉnh cụ thể cần Minh review | Khang, Minh |
| D09 | quantityDelta audit là Δstock thực; Δreserved thể hiện bằng before/after | Làm rõ trường “lượng thay đổi” chưa đủ cụ thể trong tài liệu DB | Khang |
| D10 | Callback local/test có secret server riêng, đối chiếu tuple và dấu callback đã chấp nhận | Không cho browser tự báo SUCCESS; tránh nhầm duplicate với hệ thống cancel | Minh, Huy |
| D11 | FAILED payment giữ HOLDING đến deadline gốc; có thể thử payment mới; không gia hạn | Quy tắc retry cụ thể; không tiêu hao giữ chỗ bằng lỗi thanh toán giả lập | Huy, nhóm |
| D12 | COD trả 422 trong contract mock 0.1; không giả định COD đã có quy trình | Schema có COD, chưa có nghiệp vụ về lúc giữ/trừ kho và thu tiền | Nhóm |
| D13 | GET payment bổ sung để frontend tra khi request trễ; GET không đổi trạng thái | Frontend cần biết kết quả mà không gửi callback bằng secret | Trọng, Huy |
| D14 | 50 productId khác nhau, quantity 1..100; trùng productId trả 400 | Giới hạn đề xuất API, không phải hạn mức tối đa của DB | Trọng, Huy |
| D15 | Auth context đề xuất userId/role/isActive/passwordChangeRequired; guard chặn mọi route khách nếu chưa đổi mật khẩu | Yêu cầu nhóm 09/10; tên field/error là giao diện đề xuất | Khang, Minh |
| D16 | Callback/cleanup dùng quyền server, không dùng phiên đổi mật khẩu của khách | Không bỏ sót callback hoặc giữ hàng mãi vì tài khoản đổi trạng thái | Huy, Khang, Minh |

Các phương án trên đã được áp dụng đồng bộ trong YAML và tài liệu nội bộ để có bản review cụ thể. Việc đánh dấu ĐỀ XUẤT không để trống đặc tả; nó phân biệt thiết kế đã viết với sự phê duyệt của nhóm.

## 5. Những điểm cần phản hồi trước khi code

1. **Khang:** chốt wrapper owner/chữ ký TypeScript dùng tx, cách gắn OrderItem và audit; xác nhận các field/claim Auth để biết đã đổi mật khẩu và tài khoản còn hoạt động. Schema ZIP chưa có passwordChangeRequired/username/emailVerified.
2. **Minh:** bổ sung filter/interceptor còn thiếu trong bản ZIP; chốt error envelope, secret callback và thứ tự khóa cleanup. Các thiếu hụt này không ngăn review YAML.
3. **Trọng:** kiểm tra request/response mẫu, phân bổ nhiều kho, lỗi 409 và 403 PASSWORD_CHANGE_REQUIRED; khi gặp 403 này chuyển về luồng đổi mật khẩu của Auth, không gửi lại POST tự động.
4. **Triết:** giữ API quản trị riêng; xác nhận cách thay đổi role/trạng thái tài khoản được guard phản ánh vào API khách.
5. **Cả nhóm:** xác nhận D05/D06/D11/D12 và source Auth mới trước khi ghép code. Nếu nhóm đổi lựa chọn, sửa contract một lần rồi thông báo phiên bản mới.

Đăng ký, email Nodemailer, username/reset password, avatar và quản lý nhân viên không được giao sang Huy bởi bộ tài liệu này.

## 6. Checklist bàn giao

- [x] Đọc ZIP, timeline và cập nhật nhóm 09/10.
- [x] Soạn 7 operation HTTP và contract nội bộ SQL.
- [x] Phân biệt dữ kiện source, yêu cầu nhóm và lựa chọn đề xuất.
- [x] Bổ sung bảo vệ API khi chưa đổi mật khẩu lần đầu.
- [x] Có JSON mẫu và hướng dẫn dùng/kiểm tra.
- [ ] Nhóm review/phê duyệt lựa chọn đề xuất.
- [ ] Ghép source Auth mới và triển khai service trong các tuần tương ứng.
- [ ] Chạy kiểm thử database đồng thời và E2E sau khi có backend nghiệp vụ.

Kết quả kiểm tra **tài liệu** thực tế nằm trong `validation-report.md`. Chưa thực hiện push/merge hoặc cập nhật timeline thay Huy.
