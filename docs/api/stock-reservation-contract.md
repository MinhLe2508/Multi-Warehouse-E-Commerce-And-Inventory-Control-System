# Stock Reservation — contract nội bộ 0.1.1

**Chủ phần tài liệu:** Huy · **Phối hợp:** Khang (Inventory/DB), Minh (cleanup).  
**Trạng thái:** Bản dự thảo đủ nội dung để review. Chữ ký SQL và hành vi mục 2 đã có trong source; các giao diện service, chính sách và chuyển trạng thái còn lại là thiết kế đề xuất, chưa triển khai hoặc được nhóm duyệt.

Nguồn: ZIP nhánh `project`, commit `2cc0677fd6fd1a0253f400a71a2f71d1d01ff505`; schema Prisma, hai migration và tài liệu `Documents/Ngày 04-10 đến 11-10/Thiết kế CSDL và ERD.pdf`. Huy xác nhận Khang chọn `fn_reserve_stock()`.

**Cập nhật 09/10/2026:** đã đối chiếu ba ảnh `image(2).png`, `image(3).png`, `image(4).png`. Thay đổi liên quan: chặn API khách khi chưa đổi mật khẩu lần đầu; phối hợp trạng thái tài khoản từ Auth. Chưa nhận source Auth mới, không coi nội dung chat là code đã triển khai. Chữ ký SQL giữ nguyên vì ảnh không thông báo đổi hàm/DB reservation.

## 1. Phạm vi và ranh giới

Reservation là giữ tạm một lượng hàng cho đơn đang chờ thanh toán. Không có endpoint khách hàng để tăng/giảm giữ chỗ. HTTP Orders/Payments được mô tả riêng trong `openapi.yaml`.

| Thành phần | Trách nhiệm đề xuất | Phụ trách theo timeline |
|---|---|---|
| OrdersService | Xác thực quyền, tính giá snapshot, chọn/phân bổ kho, tạo đơn, mở transaction | Huy |
| StockReservationService | Điều phối toàn bộ reservation của một đơn; liên kết OrderItem, hạn đơn, trạng thái | Huy |
| InventoryService | Sở hữu truy vấn ghi inventory, wrapper gọi SQL và ghi inventory audit | Khang; cần thống nhất wrapper |
| PaymentsService | Tạo payment, xác thực/đối chiếu callback, điều phối commit giữ chỗ | Huy |
| ReservationCleanupJob | Tìm đơn có reservation hết hạn, gọi expire qua service | Minh |

**Lựa chọn thiết kế D04:** OrdersService → StockReservationService → InventoryService wrapper → `fn_reserve_stock`, dùng cùng transaction. Đây là một giao diện dự kiến cần Khang review; không khẳng định `InventoryService` đã có trong ZIP. NT-08 trong PDF ưu tiên quyền sở hữu inventory của P4, trong khi mục 10.2 cho P3 gọi SQL trực tiếp. Wrapper là cách đề xuất để dùng hàm đã chọn và vẫn giữ ranh giới module. Không triển khai thêm một thuật toán giữ chỗ bằng TypeScript chạy song song với SQL.

## 2. Hàm SQL đã tồn tại

Vị trí: `backend/prisma/migrations/20261008012516_manual_constraints_and_functions/migration.sql`.

```sql
fn_reserve_stock(
    p_inventory_id BIGINT,
    p_order_id UUID,
    p_quantity INTEGER,
    p_ttl_minutes INTEGER DEFAULT 15
) RETURNS BIGINT
```

| Đầu vào/ra | Điều kiện và ý nghĩa |
|---|---|
| `p_inventory_id` | ID dương của inventory. Đây là BIGINT, không phải UUID sản phẩm hoặc kho |
| `p_order_id` | UUID của Order đã tồn tại, kể cả vừa tạo trong cùng transaction |
| `p_quantity` | Số nguyên dương; caller validate trước khi gọi |
| `p_ttl_minutes` | Bản contract dùng 15; không cho khách truyền tùy ý. SQL có default 15, chưa tự kiểm tra TTL dương |
| Kết quả | Một BIGINT: `stock_reservations.id`; không phải object và không phải lượng tồn còn lại |

Hàm thực hiện theo source:

1. `SELECT available_stock ... FOR UPDATE` trên một dòng inventory.
2. Dòng không tồn tại: raise `INVENTORY_NOT_FOUND`, SQLSTATE `P0002`.
3. Không đủ hàng: raise thông báo bắt đầu `INSUFFICIENT_STOCK:`, SQLSTATE `23514`.
4. Tăng `reserved_stock` thêm quantity; giữ nguyên `stock`.
5. Tạo reservation `HOLDING`, `expires_at = NOW() + make_interval(mins => TTL)`, có `updated_at = NOW()`.
6. Trả ID reservation.

`available_stock` do migration đầu tạo thành `GENERATED ALWAYS AS (stock - reserved_stock) STORED`. Không insert/update trực tiếp cột này; Prisma đặt tên thuộc tính là `availableStock`.

### Hàm không làm các việc sau

- Tạo/kiểm tra chủ đơn, chọn kho, kiểm tra trạng thái đơn, tính giá, ghi OrderItem.
- Gán `order_item_id`, cập nhật `orders.reservation_expires_at`, ghi audit.
- Commit/release/expire reservation, trừ kho thực, xử lý payment hoặc lịch sử đơn.
- Sắp xếp nhiều inventory hay mở transaction bao trùm toàn đơn.
- Chống gọi reserve lặp sau lần thành công. Hai lần gọi có thể giữ hai lần nếu còn hàng.

**Không tăng `reserved_stock` hoặc insert reservation thêm lần nữa ở service sau khi gọi SQL.** Không coi `order_item_id` null là lỗi SQL: schema cho phép null, service sẽ liên kết trước khi commit luồng tạo đơn.

## 3. Giao diện service đề xuất cho tuần triển khai

Tên/type sau là contract thiết kế, chưa phải class/file đã có. `tx` là transaction client do caller truyền; service con không mở transaction mới và không dùng PrismaClient gốc để ghi ngoài `tx`.

```ts
type ReservationAllocation = {
  orderItemId: string;       // UUID
  inventoryId: bigint;      // số nguyên chính xác trong backend
  quantity: number;
};

type ReservedItem = {
  reservationId: bigint;
  orderItemId: string;
  inventoryId: bigint;
  quantity: number;
  expiresAt: Date;
};

// TransactionClient là placeholder cho kiểu tx thực tế của Prisma trong dự án.
reserveForOrder(tx: TransactionClient, orderId: string,
  allocations: ReservationAllocation[], actorId: string): Promise<ReservedItem[]>;

commitForOrder(tx: TransactionClient, orderId: string,
  actorId: string | null): Promise<void>;

releaseForOrder(tx: TransactionClient, orderId: string,
  actorId: string | null): Promise<void>;

expireForOrder(tx: TransactionClient, orderId: string): Promise<void>;
```

Phần wrapper của Khang cần cung cấp khả năng gọi `fn_reserve_stock(tx, inventoryId, orderId, quantity, 15)` và khả năng cập nhật inventory + audit khi commit/release/expire. Tên wrapper TypeScript có thể khác tên SQL; chữ ký SQL không thay đổi vì tài liệu này.

`reserveForOrder` trả dữ liệu bằng cách đọc reservation vừa tạo trong cùng transaction, không giả định SQL tự trả đầy đủ các field. Mỗi allocation tương ứng một OrderItem và một reservation; không cho hai allocation cùng inventory trong một đơn ở bản 0.1. ProductId trùng ở request bị từ chối trước đó. Không có UNIQUE ràng buộc quan hệ một-một này trong DB, service phải giữ quy tắc.

Tại biên JSON, inventory/reservation ID chuyển thành chuỗi bằng `.toString()`; giới hạn BIGINT dương <= `9223372036854775807`. Không `Number(bigint)` và không JSON.stringify trực tiếp bigint.

## 4. Tạo đơn và giữ chỗ nguyên tử

### 4.1. Tiền điều kiện

- Authenticated CUSTOMER, tài khoản hoạt động và đã hoàn tất đổi mật khẩu lần đầu; userId lấy từ auth context do server xác minh, không từ body. Chưa đổi mật khẩu → 403 PASSWORD_CHANGE_REQUIRED trước mọi thao tác giữ chỗ. Xem giao diện Auth đề xuất bên dưới.
- 1–50 productId khác nhau; quantity mỗi sản phẩm 1–100. Đây là giới hạn đề xuất API.
- Product và Warehouse phải active. Inventory phù hợp productId/warehouseId của OrderItem.
- Shipping fields được trim, kiểm tra độ dài/định dạng trước khi bắt đầu transaction.

### 4.2. Giá và phân bổ kho đề xuất D05/D06

- Chỉ VND trong bản 0.1; dùng Decimal để tính, không dùng số thực nhị phân.
- Product basePrice là unitPrice snapshot. Ưu tiên kho có region khớp shippingRegion đã trim (so khớp chuỗi chính xác), rồi warehouse.code tăng dần, rồi inventory.id theo số.
- Phân bổ tham lam vào các kho đủ lượng khả dụng; cho phép một sản phẩm tách qua nhiều kho. Mỗi phần tạo một OrderItem với warehouseId và inventoryId thật.
- Việc đọc availableStock để lập phân bổ chưa bảo đảm giữ được hàng. SQL kiểm tra lại dưới khóa; nếu bị khách khác giữ mất hàng thì rollback và trả 409. Không tự đổi kế hoạch phân bổ giữa chừng để tiếp tục commit một phần.
- `discountAmount = ROUND_HALF_UP(unitPrice × quantity × discountPercent / 100, 2)` cho từng dòng sau phân bổ. `lineTotal = unitPrice × quantity - discountAmount`.
- `subtotal = SUM(unitPrice × quantity)`, `discountTotal = SUM(discountAmount)`, `shippingFee = 0.00`, `grandTotal = subtotal - discountTotal + shippingFee`.
- Số tiền phải nằm trong NUMERIC(14,2); overflow hoặc tổng âm bị từ chối, không cắt/tràn số. Chia nhiều dòng có thể làm kết quả làm tròn chênh so với tính trên tổng sản phẩm; bản 0.1 lấy tổng các dòng làm chuẩn. Đơn đã tạo giữ giá snapshot.
- Đơn tổng 0 vẫn có thể được biểu diễn trong schema Orders, nhưng createPayment trả 409 ORDER_NOT_PAYABLE; nhóm cần quyết định chính sách đơn miễn phí trước khi hỗ trợ thanh toán loại đơn đó.

### 4.3. Trình tự trong một transaction

1. Tạo Order PENDING_PAYMENT, mã orderCode duy nhất tối đa 32 ký tự; lưu snapshot và các OrderItem.
2. Sắp allocations theo **inventoryId tăng dần theo số**, không theo chuỗi và không chỉ theo thứ tự kho ưu tiên.
3. Với từng allocation, wrapper gọi SQL qua cùng `tx`, TTL 15. Chạy lần lượt, không Promise.all các truy vấn khóa.
4. Liên kết reservation trả về với orderItemId đúng order và inventory; ghi audit RESERVE qua inventory owner.
5. Đọc expiresAt từ reservation làm nguồn; trong một transaction với cùng TTL, SQL `NOW()` cho cùng mốc. Đặt `orders.reservationExpiresAt` bằng hạn chung; nếu dữ liệu có hạn khác nhau, dùng hạn sớm nhất và coi là điểm cần điều tra.
6. Kiểm tra thời hạn thực tế trước khi hoàn tất nếu transaction kéo dài: chưa trả đơn giữ chỗ thành công khi hạn đã hết. Trường hợp này rollback, trả 409 RESERVATION_EXPIRED.
7. Ghi OrderStatusHistory từ null → PENDING_PAYMENT, actor là khách tạo đơn.
8. Commit; chỉ sau commit mới trả HTTP 201. Lỗi ở bất kỳ bước nào phải lan ra ngoài transaction để rollback cả Order/Items/Reservations/Audit/History.

SQL giữ chỗ bắt đầu tính TTL bằng `NOW()` của transaction. Thời gian chờ khóa có thể làm giảm thời gian thực còn lại; không hứa frontend luôn còn đủ 15 phút kể từ lúc nhận response. Dùng expiresAt tuyệt đối để đếm ngược, server luôn là bên quyết định hết hạn.

### 4.4. Retry

Lỗi DB trước commit phải rollback, không để reservation hoặc order mồ côi. Retry transaction, nếu triển khai, phải được giới hạn và tạo lại toàn bộ phần chưa commit. Không retry riêng một lời gọi reserve đã thành công.

POST `/orders` chưa có idempotency key bền vững trong schema: hai POST riêng có thể tạo hai đơn. Khi timeout chưa biết đã commit chưa, frontend kiểm tra danh sách/chi tiết đơn trước; không tự gửi lại vô hạn. Idempotency cho tạo đơn là đề xuất nâng cấp riêng, không được tuyên bố đã có chỉ vì payment có UNIQUE transactionRef.

## 5. Trạng thái, cập nhật kho và audit

| Thao tác | Tiền trạng thái | Hậu trạng thái | Δstock | ΔreservedStock |
|---|---|---|---:|---:|
| Reserve q | Chưa có reservation | HOLDING | 0 | +q |
| Commit q | HOLDING, còn hạn | COMMITTED | -q | -q |
| Khách hủy q | HOLDING, còn hạn | RELEASED | 0 | -q |
| Hết hạn q | HOLDING, hết hạn | EXPIRED | 0 | -q |

Terminal reservation không trở lại HOLDING. COMMITTED không thể release như reservation chưa trả tiền; hoàn hàng/refund ngoài phạm vi bản này. Cập nhật stock và reservedStock của một inventory trong **cùng câu UPDATE** khi commit để không vi phạm CHECK trung gian. Gộp quantity theo inventory, khóa và cập nhật theo thứ tự số tăng dần.

- Commit: set committedAt, giữ releasedAt null.
- Release/expire: set releasedAt, giữ committedAt null.
- Gọi lại thao tác đã hoàn tất với cùng ý nghĩa là no-op trên inventory/reservation/audit. Trạng thái terminal khác ý nghĩa phải báo xung đột, không tự trừ/hoàn tiếp.
- Sau một giao dịch hoàn tất, mục tiêu bất biến là `0 <= reservedStock <= stock` và `reservedStock = SUM(quantity WHERE status=HOLDING)` cho inventory.
- Trigger hiện có chỉ chặn chiều `SUM(HOLDING.quantity) > reservedStock` khi INSERT/UPDATE reservation, deferred đến commit; không bảo vệ đủ mọi chiều/sự kiện. Không dùng trigger làm bằng chứng rằng mọi logic đã đúng.

Mỗi lần inventory đổi: ghi inventory_audit_log với stockBefore/After, reservedBefore/After, reason (RESERVE/COMMIT/RELEASE/EXPIRE), referenceType=`ORDER`, referenceId=orderId, actorId phù hợp. Đề xuất D09: quantityDelta là thay đổi **stock thực** (`stockAfter-stockBefore`); với reserve/release/expire bằng 0, lượng giữ chỗ thể hiện ở reservedBefore/After. Với hệ thống cleanup, actorId=null. Không ghi audit lần hai cho thao tác lặp không đổi dữ liệu.

OrderStatusHistory ghi đúng chuyển trạng thái thực: null→PENDING_PAYMENT, PENDING_PAYMENT→CONFIRMED hoặc →CANCELLED. Không tạo bản ghi fromStatus=toStatus (migration có CHECK). SHIPPING/DELIVERED thuộc API admin tuần sau, chỉ được đọc trong contract HTTP khách.

## 6. Payment, hủy và cleanup phối hợp thế nào?

### 6.1. Thứ tự khóa đề xuất D08

Mọi luồng tác động một đơn theo cùng thứ tự: **Order → Payment liên quan (nếu có) → Inventory tăng dần → Reservation tăng dần**. Khóa được giữ đến transaction kết thúc. Reserve tạo reservation mới sau khi khóa inventory.

Khi callback đến, có thể đọc ref để tìm order trước, sau đó lấy khóa theo thứ tự trên và đọc/đối chiếu lại. Cleanup không khóa reservation trước rồi quay ngược khóa Order. Worker có thể tìm candidate order bằng EXISTS reservation quá hạn, lấy **Order FOR UPDATE SKIP LOCKED** rồi xử lý một đơn; chỉ coi kết quả đã khóa/kiểm tra lại là có hiệu lực. Đây là điều chỉnh đề xuất cần Minh/Khang review so với cách quét/khóa reservation trong timeline.

Mục đích là giảm chu kỳ khóa giữa các luồng; không tuyên bố loại bỏ mọi deadlock toàn hệ thống. Transaction bị DB hủy do deadlock không được chuyển thành kết quả thành công; retry nếu có phải giới hạn và theo quy tắc mục 4.4.

### 6.2. Khởi tạo payment

Khóa Order; xác thực chủ đơn và PENDING_PAYMENT còn hạn, toàn bộ reservation cần thiết HOLDING, grandTotal > 0. Kiểm tra thời gian thực **sau khi lấy khóa** bằng clock_timestamp() hoặc nguồn thời gian server tương đương; không chỉ dùng NOW() tại đầu transaction đã chờ lâu.

Nếu có payment SUCCESS → 409 ALREADY_PAID. Nếu có PENDING đúng method/amount/currency → 200 trả lại; PENDING khác method → 409 PAYMENT_IN_PROGRESS. Nếu chỉ có FAILED và còn đủ điều kiện, tạo payment mới/ref mới, 201; không gia hạn reservation. Khóa Order làm các lần tạo cạnh tranh tuần tự; DB chưa có UNIQUE riêng cho PENDING.

### 6.3. Xác thực callback

Đề xuất D10: route mock chỉ bật ở local/test khi có secret riêng `MOCK_PAYMENT_CALLBACK_SECRET`; so với `X-Mock-Callback-Token`. Không dùng JWT_SECRET, không phát secret cho browser và không bật route khi thiếu cấu hình. Chưa có cấu hình này trong ZIP.

Sau xác thực token, validate body; tìm payment theo transactionRef; đối chiếu orderId, amount, currency với bản đã lưu. Không tin giá trong callback để sửa amount. Không tồn tại trả 404; tuple lệch trả 409 PAYMENT_MISMATCH. FAILURE reason thiếu được chuẩn hóa MOCK_DECLINED; SUCCESS không được gửi failureReason.

### 6.4. Callback mới và callback lặp

Lưu dấu callback đã chấp nhận vào gatewayResponse, đề xuất JSON `{source: "MOCK_CALLBACK", payload: {...các trường đã chuẩn hóa...}}`. Không lưu token/header nhạy cảm vào JSON này.

1. **Đã có callback được chấp nhận, cùng payload chuẩn hóa:** tăng callbackCount và updatedAt; trả 200 duplicate=true. Thực hiện kiểm tra này trước kiểm tra TTL hiện tại, vì callback SUCCESS lặp sau hạn không được trừ kho lại hoặc báo thất bại giả. orderStatus trả trạng thái hiện tại.
2. **Đã có callback được chấp nhận nhưng khác status/reason:** 409 CALLBACK_CONFLICT. Tuple amount/order/currency lệch luôn là PAYMENT_MISMATCH. Không tăng callbackCount ở request bị từ chối.
3. **Payment bị đánh FAILED bởi cancel/cleanup, không có dấu callback đã chấp nhận:** callback đến muộn bị từ chối; không coi đó là duplicate gateway.
4. **Callback mới:** sau khi khóa và đối chiếu lại, cần đơn PENDING_PAYMENT và mọi reservation HOLDING, còn hạn tại thời điểm quyết định dưới khóa.
5. **SUCCESS:** cùng một transaction cập nhật payment SUCCESS/processedAt, commit các reservation, trừ tồn thực và giữ chỗ, đặt order CONFIRMED/confirmedAt, ghi history/audit.
6. **FAILED:** cập nhật payment FAILED/processedAt/failureReason; order vẫn PENDING_PAYMENT và giữ chỗ còn đến hạn gốc. Khách có thể tạo payment mới. Không giải phóng giữ chỗ ngay trong chính sách bản 0.1.

callbackCount tăng đúng một cho mỗi callback hợp lệ được chấp nhận, kể cả duplicate. Không tăng với token sai, body sai, mismatch, xung đột hoặc callback quá hạn bị từ chối. processedAt của lần xử lý đầu không đổi trên duplicate.

UNIQUE transaction_ref và partial UNIQUE payment SUCCESS/order đã có trong migration, nhưng không tự ngăn một UPDATE/service trừ kho hai lần. Logic trạng thái, khóa và transaction ở trên vẫn bắt buộc khi triển khai.

### 6.5. Hủy và hết hạn

- Khách hủy PENDING_PAYMENT còn hạn: release toàn bộ HOLDING, order CANCELLED, reason khách gửi hoặc CUSTOMER_CANCELLED.
- Khách hủy PENDING_PAYMENT quá hạn: dùng expire, order CANCELLED/reason RESERVATION_EXPIRED. Trả 200 trạng thái cuối; không biến mất hàng đã hết hạn thành thao tác thanh toán được.
- Đơn đã CANCELLED: trả 200 hiện tại, không sửa reason hoặc tạo audit/history mới.
- CONFIRMED/SHIPPING/DELIVERED: khách không được hủy qua route này, 409 INVALID_ORDER_STATE.
- Cleanup chạy mỗi phút theo timeline. Mỗi đơn xử lý trong transaction riêng, kiểm tra dưới khóa; chỉ HOLDING quá hạn chuyển EXPIRED. Đơn vẫn PENDING_PAYMENT chuyển CANCELLED. Payment PENDING chuyển FAILED, reason RESERVATION_EXPIRED, processedAt theo thời điểm xử lý, callbackCount không đổi.
- Nếu callback đã thắng khóa và commit thành công: cleanup không expire COMMITTED/đơn CONFIRMED. Nếu cleanup thắng: callback mới nhận RESERVATION_EXPIRED/INVALID_ORDER_STATE và không phục hồi giữ chỗ.
- GET không tự dọn dữ liệu; giữa thời điểm expiresAt và lượt cleanup có thể còn HOLDING hết hạn trong DB. Quyền thanh toán vẫn bị chặn bằng thời gian thực.

COD có enum nhưng chưa có luồng tương ứng: bản 0.1 trả 422 khi tạo COD, thay vì tự xác nhận đã thu tiền. Refund và cổng thanh toán thật ngoài phạm vi tài liệu mock.

## 7. Lỗi và transaction

| Nguồn | Ánh xạ đề xuất | Ghi chú |
|---|---|---|
| P0002 + INVENTORY_NOT_FOUND | 404 INVENTORY_NOT_FOUND | Inventory được lựa chọn không còn tồn tại |
| 23514 + thông báo INSUFFICIENT_STOCK | 409 INSUFFICIENT_STOCK | Rollback toàn bộ thao tác tạo đơn |
| Request thiếu/sai kiểu/range | 400 VALIDATION_ERROR | Validate trước SQL |
| Order UUID không tồn tại / FK lỗi nội bộ | 404 khi resource khách yêu cầu không tồn tại; 500 nếu do lỗi điều phối nội bộ | Không biến mọi FK thành cùng một lỗi thiếu hàng |
| 23514 constraint/consistency khác | Phân loại theo constraint; lỗi bất biến nội bộ → 500 INTERNAL_ERROR | Tuyệt đối không map toàn bộ 23514 sang thiếu hàng |
| Reservation quá hạn | 409 RESERVATION_EXPIRED | Không commit lại terminal reservation |
| Lỗi driver/deadlock/khác chưa xử lý | 500 INTERNAL_ERROR, log server | Không lộ SQL/stack; retry phải có giới hạn |

Prisma có thể bọc SQLSTATE trong metadata lỗi raw query. Khi triển khai cần kiểm tra lỗi thực từ adapter hiện dùng; không mặc định `error.code` trực tiếp bằng 23514. Các lỗi trả 409 phải thoát transaction đúng cách, không bắt rồi trả object khiến phần trước vô tình commit.

## 8. Ca nghiệm thu thiết kế và kế hoạch test triển khai

Các ca sau là yêu cầu kiểm thử tuần triển khai, **chưa chạy với database trong bộ bàn giao này**.

| ID | Tình huống | Điều cần chứng minh khi code |
|---|---|---|
| R01 | Hai transaction tranh 1 đơn vị | Một giữ được, một 409, stock không âm, chỉ một HOLDING |
| R02 | Đơn nhiều sản phẩm có một dòng thiếu | Không có Order/OrderItem/reservation/audit dở dang sau rollback |
| R03 | Quantity 0, âm, số lẻ; TTL không hợp lệ | API/service từ chối; SQL không được dùng để bỏ qua validate |
| R04 | Inventory không có / Order UUID không hợp lệ | Lỗi đúng; không commit reservedStock dở |
| R05 | Cùng callback SUCCESS gửi song song | Chỉ một commit kho/history, callbackCount phản ánh callback chấp nhận |
| R06 | Callback cũ lặp sau expiry/SHIPPING | 200 duplicate, không lặp tác động kho |
| R07 | Callback SUCCESS khác tuple hoặc đổi kết quả | 409, không đổi kết quả đã chấp nhận |
| R08 | Callback tranh khóa với cleanup/cancel | Một trạng thái cuối hợp lệ; không double release/commit |
| R09 | Cleanup chạy hai lần | Lần hai không giảm reservedStock hoặc ghi audit thêm |
| R10 | Gọi reserve đã thành công lần nữa | Không được giả định idempotent; service không phát sinh lời gọi lặp |
| R11 | Một sản phẩm tách hai kho | OrderItems, reservations, audit và tổng tiền khớp phân bổ |
| R12 | ID BIGINT lớn hơn 2^53 | JSON giữ chính xác dạng chuỗi |
| R13 | Callback chờ khóa qua deadline | Dùng thời gian thực sau khóa, từ chối thanh toán quá hạn |
| R14 | Partial UNIQUE một payment SUCCESS/order | Callback/giao dịch cạnh tranh không xác nhận hai lần |
| R15 | CUSTOMER đăng nhập lần đầu chưa đổi mật khẩu | Các API khách trả 403 PASSWORD_CHANGE_REQUIRED; không tạo order/payment/reservation |
| R16 | Trạng thái tài khoản đổi sau khi token đã phát | Auth/Guard kiểm tra trạng thái hiệu lực; không dùng claim cũ để bỏ qua chặn |

Các kiểm tra đã thực hiện cho bản **tài liệu** được ghi riêng trong `validation-report.md`.

## 9. Giao tiếp với Auth sau cập nhật nhóm 09/10

Theo ảnh, Khang phụ trách tạo tài khoản/đăng nhập, email bằng Nodemailer và bắt đổi mật khẩu lần đầu cho Customer/Staff. Huy dùng kết quả Auth, không làm lại đăng ký, gửi email, reset mật khẩu hoặc quản trị nhân viên.

Auth/Guard cần cung cấp ngữ cảnh đã xác thực, đề xuất gồm userId (UUID users.id), role (enum thật), isActive và passwordChangeRequired. Đây là hợp đồng tích hợp, **không phải các field mới đã có trong Prisma**. Source cũ có isActive nhưng chưa có passwordChangeRequired, username hoặc trạng thái xác minh email. Khang quyết định cách lưu/cấp token và migration cần thiết.

Thứ tự xử lý đề xuất ở route khách: xác thực token → trạng thái hoạt động → yêu cầu đổi mật khẩu → role CUSTOMER → quyền sở hữu resource → nghiệp vụ. Không được biết userId từ tên đăng nhập trước dấu @ rồi tự dùng tên đó làm khóa đơn; luôn giữ UUID ổn định. Auth cần xử lý việc trùng tên trước @, không thuộc Orders.

Token dùng cho phiên đổi mật khẩu đầu tiên không đủ quyền gọi Orders/Payments. Sau đổi mật khẩu, Auth phải cấp quyền/token phù hợp hoặc làm trạng thái mới có hiệu lực; service không suy đoán việc đổi mật khẩu bằng cách so sánh với mật khẩu mặc định. Nếu Auth chưa cung cấp được trạng thái cần thiết thì chưa bật quyền nghiệp vụ chỉ để bỏ qua bước này. GET đơn và GET payment cũng bị chặn trong phiên đổi mật khẩu, theo thông báo nhóm chưa được dùng chức năng khác.

Trạng thái khóa/vô hiệu hóa tài khoản phải được Auth xác minh theo cơ chế chung (tra trạng thái hoặc vô hiệu token khi đổi trạng thái); tên field/API cụ thể chờ Khang xác nhận. Mã ACCOUNT_INACTIVE là đề xuất response, không tự đồng nhất mọi loại khóa với một cột mới trong DB.

Callback mock và cleanup là tác vụ server, không phải hành động tương tác bằng token của Customer: không áp cờ đổi mật khẩu của người mua để chặn việc ghi nhận một callback hợp lệ hoặc giải phóng giữ chỗ hết hạn. Các tác vụ này vẫn kiểm tra quyền service, order/payment/reservation và deadline như mục 6.

Ảnh nói gửi email có thông tin đăng nhập, nhưng chưa mô tả link/token xác minh. Không tự thêm EMAIL_NOT_VERIFIED hoặc yêu cầu xác minh email vào Orders khi chưa được nhóm xác nhận. Nhóm đã ghi nhận hạn chế của cơ chế mật khẩu mặc định trong phạm vi đồ án; bộ contract không thay đổi thiết kế Auth đó, cũng không đưa mật khẩu/token vào response đơn hàng hay dữ liệu mock.
