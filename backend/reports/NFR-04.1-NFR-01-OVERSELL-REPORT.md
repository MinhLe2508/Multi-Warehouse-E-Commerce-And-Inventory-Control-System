# BÁO CÁO KIỂM THỬ TẢI & TRANH MUA ĐỒNG THỜI (CONCURRENCY LOAD TEST REPORT)
## ĐO LƯỜNG VÀ XÁC THỰC NFR-04.1 (ZERO OVERSELL) & NFR-01 (ĐỘ TRỄ PHẢN HỒI API)

- **Người thực hiện**: Minh
- **Nhiệm vụ**: Task 32 (Tuần 6)
- **Thời gian thực hiện**: 10:10:16 12/11/2026
- **Mục tiêu**: Dùng k6/load-test giả lập hàng trăm phiên tranh mua đồng thời trên cùng 1 sản phẩm hot, đo trực tiếp:
  - **NFR-04.1**: 0 oversell (tuyệt đối không bán quá số lượng khả dụng, không âm kho).
  - **NFR-01**: Độ trễ phản hồi API (min, avg, med, max, p90, p95, p99, RPS).

---

## 1. Môi trường và Kịch bản Kiểm thử

| Tham số | Giá trị |
|---|---|
| **Sản phẩm kiểm thử** | `Sản phẩm Test Concurrency Oversell (10 tồn kho)` (SKU: `SKU-LOADTEST-OVERSELL`) |
| **Product ID** | `d30fd781-d0b7-43ba-9ab0-40c58b3533f5` |
| **Kho xuất hàng** | Kho Trung Tâm Hà Nội (`WH-HN01`, Miền Bắc) |
| **Tồn kho ban đầu (Stock)** | **10** chiếc |
| **Tồn đang giữ ban đầu (Reserved)** | **0** chiếc |
| **Tồn khả dụng ban đầu (Available)** | **10** chiếc |
| **Số lượng người dùng đồng thời (VUs)** | **100** VUs (mỗi VU dùng 1 tài khoản Customer với JWT Bearer Token riêng biệt) |
| **Hành vi mỗi VU** | Gửi yêu cầu `POST /orders` mua đúng **1** chiếc sản phẩm |
| **Cơ chế xử lý đồng thời** | PostgreSQL `FOR UPDATE` trên dòng inventory (khóa theo `id` tăng dần) + Hàm `fn_reserve_stock` + Two-Phase Reservation |

---

## 2. Kết quả Đo lường Trực tiếp NFR-04.1 (Zero Oversell)

### 2.1. Đối soát Số lượng Giao dịch API
- **Tổng số requests tranh mua đồng thời**: **100** requests
- **Số đơn tạo thành công (HTTP 201 Created)**: **10** đơn (= đúng số lượng tồn ban đầu: 10)
- **Số yêu cầu bị từ chối do hết hàng (HTTP 409 Conflict - INSUFFICIENT_STOCK)**: **90** requests
- **Số lỗi hệ thống bất thường (HTTP 500 / Deadlock 40P01 / Timeout)**: **0** (0%)
- **Tỉ lệ Oversell**: **0%** (**0 oversell**)

### 2.2. Đối soát Tính toàn vẹn Cơ sở dữ liệu (Database Invariant Verification)

| Chỉ số kiểm tra | Giá trị thực tế | Kỳ vọng chuẩn | Kết luận |
|---|---|---|---|
| **Inventory Stock** | `10` | `10` | **ĐẠT** ✅ |
| **Inventory Reserved Stock** | `10` | `10` | **ĐẠT** ✅ |
| **Available Stock (`stock - reserved`)** | `0` | `0` (Không âm) | **ĐẠT** ✅ |
| **Số đơn hàng tạo mới trong DB** | `10` | `10` | **ĐẠT** ✅ |
| **Tổng số lượng sản phẩm đặt mua** | `10` | `10` | **ĐẠT** ✅ |
| **Số bản ghi giữ chỗ (`HOLDING`)** | `10` | `10` | **ĐẠT** ✅ |
| **Tổng quantity trong reservations** | `10` | `10` | **ĐẠT** ✅ |
| **Lỗi Deadlock (40P01)** | `0` | `0` | **ĐẠT** ✅ |

> **KẾT LUẬN NFR-04.1**: **ĐẠT CHUẨN HOÀN TOÀN (100% PASS)**. Hệ thống ngăn chặn triệt để tình trạng oversell khi có 100 phiên tranh mua đồng thời. Không có bất kỳ đơn hàng nào vượt quá lượng tồn khả dụng, không có bản ghi tồn kho nào bị âm.

---

## 3. Kết quả Đo lường Trực tiếp NFR-01 (Độ trễ Phản hồi API)

Bảng phân phối độ trễ của API `POST /orders` dưới áp lực 100 requests đồng thời:

| Chỉ số Latency / Throughput | Giá trị đo được | Đánh giá NFR |
|---|---|---|
| **Min Response Time** | `533.3 ms` | Rất nhanh cho các requests được phục vụ đầu tiên |
| **Average Response Time (Avg)** | `1201.1 ms` | Phù hợp với giao dịch ghi cơ sở dữ liệu có khóa hàng |
| **Median Response Time (p50)** | `1229.6 ms` | 50% người dùng nhận kết quả dưới mốc này |
| **p90 Response Time** | `1470.9 ms` | Phản hồi mượt mà cho 90% giao dịch |
| **p95 Response Time** | `1489.5 ms` | Đạt yêu cầu NFR-01 (< 3000 ms) |
| **p99 Response Time** | `1506.6 ms` | Request cuối cùng trong hàng đợi hoàn tất an toàn |
| **Max Response Time** | `1511.8 ms` | Không bị timeout (mức timeout tối đa là 30s) |
| **Throughput (RPS)** | `63.5 req/s` | Xử lý hoàn toàn trong 1 đợt spike đồng thời |

---

## 4. Phân tích Kỹ thuật & Cơ chế Bảo vệ

1. **Cơ chế Khóa dòng Tồn kho (`FOR UPDATE` với `id` tăng dần)**:
   - Khi 100 transactions đồng thời yêu cầu giữ chỗ sản phẩm, `OrdersService` gọi `lockInventories()` sắp xếp `inventoryId` tăng dần.
   - Tránh triệt để Deadlock 40P01 giữa các luồng giao dịch đồng thời.
   - Ngăn chặn triệt để race condition: Các transaction đến sau phải chờ transaction trước nhả khóa, đọc lại số dư khả dụng mới nhất (`stock - reserved_stock`) thay vì số dư cũ chưa khóa.

2. **Xử lý Hết hàng Nhanh Chóng (`Fail-fast 409 Conflict`)**:
   - Khi 10 đơn đầu tiên đã chiếm đủ 10 suất tồn kho (`reserved_stock = 10`), các transaction tiếp theo ngay khi lấy được khóa sẽ nhận thấy `availableStock = 0`.
   - Ngay lập tức ném ngoại lệ `ConflictException('INSUFFICIENT_STOCK')`, giải phóng khóa ngay mà không cần ghi log thừa hay tạo bản ghi rác.

3. **Giao dịch Hai pha (Two-Phase Stock Reservation)**:
   - Các đơn hàng thành công được cấp trạng thái `PENDING_PAYMENT` và giữ chỗ trong bảng `stock_reservations` với trạng thái `HOLDING`.
   - Đảm bảo tính nhất quán tuyệt đối giữa dữ liệu đơn hàng và kho bãi.

---

## 5. Tổng kết Trạng thái Task 32
- [x] Tạo script giả lập k6 và runner concurrency 100 VUs tranh mua đồng thời trên 1 sản phẩm.
- [x] Đo trực tiếp NFR-04.1: Đạt chuẩn 0 oversell, không âm kho, 10 thành công, 90 từ chối.
- [x] Đo trực tiếp NFR-01: Thu thập đầy đủ các mốc phân vị độ trễ (min, avg, p50, p90, p95, p99, RPS).
- [x] Hoàn thiện tài liệu nghiệm thu kỹ thuật và đối soát dữ liệu cơ sở dữ liệu.
