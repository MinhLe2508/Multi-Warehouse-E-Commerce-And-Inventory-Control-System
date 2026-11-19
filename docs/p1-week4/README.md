# [Trọng] Tuần 4 – Checkout
Đăng nhập CUSTOMER trên môi trường kiểm thử, thêm sản phẩm còn hàng vào giỏ. Chọn Thanh toán, nhập nơi nhận, chọn thẻ/ví mô phỏng và xác nhận đặt đơn. Tổng tiền và tồn kho do backend quyết định.

1. Thử giao dịch bị từ chối: đơn vẫn PENDING_PAYMENT. Duyệt lại trên cùng mã đơn, tải lại trang và kiểm tra CONFIRMED.
2. Hai khách cùng chuẩn bị đặt đơn có sản phẩm chỉ còn một đơn vị. Khách đầu đặt trước, khách còn lại nhận 409 và vẫn giữ giỏ hàng.
3. Chạy trong frontend: node --test tests/live-orders.test.mjs, npm run lint, npm run build. Test HTTP tùy chọn chỉ bật với fixture dùng một lần (backend 5301, checkoutdemo, SKU DEMO tồn 2). Test thủ công dùng DB local, không dùng DB vận hành.
