# HƯỚNG DẪN KIỂM THỬ TẢI & TRANH MUA ĐỒNG THỜI (TASK 32: NFR-04.1 & NFR-01)

> **Người phụ trách**: Minh  
> **Phạm vi tài liệu**: Hướng dẫn kỹ thuật chạy kiểm thử tải, phân biệt môi trường/runner và quy trình xác thực không oversell.

---

## 1. Mục tiêu Kiểm thử
- **NFR-04.1 (Zero Oversell)**: Khi hàng trăm người dùng tranh mua đồng thời cùng 1 sản phẩm flash sale với số lượng tồn kho giới hạn, hệ thống đảm bảo:
  - Tồn khả dụng không bao giờ bị âm (`available_stock = stock - reserved_stock >= 0`).
  - Số đơn tạo thành công chính xác bằng tồn kho ban đầu (`orders == initialStock`).
  - Không có giao dịch bán vượt (`oversell = 0`).
  - Trạng thái giữ chỗ (`stock_reservations` ở trạng thái `HOLDING`) khớp chính xác với `reserved_stock`.
- **NFR-01 (API Response Latency)**: Đo độ trễ phản hồi (`min`, `avg`, `med`, `p90`, `p95`, `p99`, `max`, `RPS`) dưới tải đồng thời.

---

## 2. Phân biệt Hai Bộ Runner

Hệ thống cung cấp hai phương thức thực thi tải:

| Đặc tính | k6 Load Test (`k6-oversell.js`) | Node.js Concurrency Runner (`run-concurrency-test.ts`) |
|---|---|---|
| **Mục đích** | Kiểm thử tải chuẩn công nghiệp, đo lường chi tiết phân vị độ trễ (NFR-01) | Smoke test nhanh gọn bằng Node.js thuần, không phụ thuộc cài đặt binary k6 |
| **Công cụ yêu cầu** | Đã cài `k6` CLI trên máy host hoặc Docker | Chỉ cần Node.js và TypeScript (`ts-node`) |
| **Giao thức** | HTTP VU ảo đồng thời cao | `Promise.all` với 100 requests song song |
| **File kích hoạt** | `load-tests/run-k6.ps1` hoặc `load-tests/run-k6.bat` | `npm run test:load:run` (trong thư mục `backend`) |

---

## 3. Quy trình Thực hiện Đầy đủ (Chuẩn 3 Bước)

> [!IMPORTANT]
> **Yêu cầu môi trường**: Database PostgreSQL riêng biệt cho kiểm thử (không dùng chung với DB đang demo nhập liệu thủ công) và backend đang chạy tại port 3001.

### Bước 1: Khởi tạo dữ liệu test (`setup`)
```powershell
cd backend
npm run test:load:setup
```
- Khởi tạo sản phẩm flash sale (`SKU-LOADTEST-OVERSELL`), stock = 10 tại kho active.
- Xóa sạch đơn hàng và reservations cũ của sản phẩm này.
- Tạo hoặc lấy 100 tài khoản khách hàng, sinh 100 JWT Access Token độc lập.
- Xuất file cấu hình `load-tests/test-data.json` kèm `runId` định danh lần chạy.

### Bước 2: Chạy tranh mua đồng thời (`run`)
- **Cách 1 (k6 runner)**:
  ```powershell
  # Từ thư mục gốc hoặc thư mục backend
  npm run test:load:k6
  ```
- **Cách 2 (Node smoke runner)**:
  ```powershell
  cd backend
  npm run test:load:run
  ```
- Kết quả đo lường độ trễ và thống kê mã HTTP trả về sẽ được xuất ra `load-tests/load-test-summary.json`.

### Bước 3: Hậu kiểm Cơ sở dữ liệu (`verify`)
> [!WARNING]
> Cần chạy bước hậu kiểm **trước khi** TTL giữ hàng (15 phút) hết hạn để bản ghi `stock_reservations` trạng thái `HOLDING` chưa bị job dọn dẹp chuyển sang `RELEASED`.

```powershell
cd backend
npm run test:load:verify
```
- Script truy vấn trực tiếp PostgreSQL qua Prisma:
  - Bảng `inventory`: kiểm tra `stock`, `reserved_stock`, `available_stock`.
  - Bảng `order_items` & `orders`: đếm số đơn thực tạo trong DB.
  - Bảng `stock_reservations`: kiểm tra số lượng giữ chỗ `HOLDING`.
- Sử dụng module thuần `oversell-verifier.ts` để đánh giá độc lập:
  - So khớp tính nhất quán giữa số liệu HTTP và số liệu DB.
  - Kiểm tra tính toàn vẹn (invariant checks).
  - Tự động sinh báo cáo kỹ thuật vào `backend/reports/NFR-04.1-NFR-01-OVERSELL-REPORT.md`.
  - **Không bao giờ hardcode PASS** nếu có bất kỳ tiêu chí nào sai lệch hoặc dữ liệu bị thiếu.

---

## 4. Chạy Unit Test Logic Hậu kiểm (Không Cần DB)

Để kiểm chứng tính đúng đắn của logic thẩm định `oversell-verifier` mà không cần bật cơ sở dữ liệu hay chạy tải thật:

```powershell
cd backend
npm run test:oversell
```

Bộ unit test (`load-tests/verify-oversell.spec.ts`) bao gồm 7 kịch bản:
1. Expected 10 nhưng DB = 0 (bắt lỗi báo cáo sai lệch).
2. HTTP báo 10 đơn thành công nhưng DB = 0 đơn.
3. Reserved > stock hoặc available < 0 (phát hiện tồn kho âm).
4. Dữ liệu chuẩn thỏa mãn mọi điều kiện bất biến (PASS, exit code 0).
5. Thiếu `dbData` hoặc lệch `runId` giữa các file (INVALID, exit code 1).
6. Xử lý thiếu metric `p99` -> hiển thị `unavailable` thay vì 0 ms.

