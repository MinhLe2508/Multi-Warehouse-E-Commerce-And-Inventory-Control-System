# BÁO CÁO KIỂM THỬ TẢI & TRANH MUA ĐỒNG THỜI (CONCURRENCY LOAD TEST REPORT)
## ĐO LƯỜNG VÀ XÁC THỰC NFR-04.1 (ZERO OVERSELL) & NFR-01 (ĐỘ TRỄ PHẢN HỒI API)

- **Người thực hiện**: Minh
- **Nhiệm vụ**: Task 32 (Tuần 6)
- **Thời gian thực hiện**: 15:15:25 17/11/2026
- **Mã lần chạy (Run ID)**: `run_1794903300862_82ce5b`
- **Mục tiêu**: Dùng k6/load-test giả lập hàng trăm phiên tranh mua đồng thời trên cùng 1 sản phẩm hot, đo trực tiếp:
  - **NFR-04.1**: 0 oversell (tuyệt đối không bán quá số lượng khả dụng, không âm kho).
  - **NFR-01**: Độ trễ phản hồi API (min, avg, med, max, p90, p95, p99, RPS).

---

## 1. Môi trường và Kịch bản Kiểm thử

| Tham số | Giá trị |
|---|---|
| **Sản phẩm kiểm thử** | `Sản phẩm Test Concurrency Oversell (10 tồn kho)` (SKU: `SKU-LOADTEST-OVERSELL`) |
| **Product ID** | `d30fd781-d0b7-43ba-9ab0-40c58b3533f5` |
| **Kho xuất hàng** | Kho Trung Tâm Hà Nội (`WH-HN01`) |
| **Tồn kho ban đầu (Stock)** | **10** chiếc |
| **Số lượng người dùng đồng thời (VUs)** | **100** VUs |
| **Cơ chế xử lý đồng thời** | PostgreSQL `FOR UPDATE` trên dòng inventory (khóa theo `id` tăng dần) + Hàm `fn_reserve_stock` + Two-Phase Reservation |

---

## 2. Kết quả Đo lường Trực tiếp NFR-04.1 (Zero Oversell)

### 2.1. Đối soát Số lượng Giao dịch API
- **Tổng số requests**: **100** requests
- **Số đơn tạo thành công (HTTP 201)**: **10** đơn
- **Số yêu cầu bị từ chối (HTTP 409 Conflict)**: **90** requests
- **Số lỗi bất thường (HTTP 500 / Deadlock 40P01)**: **0** (0%)

### 2.2. Đối soát Tính toàn vẹn Cơ sở dữ liệu (Database Invariants)

| Tiêu chí kiểm tra | Giá trị quan sát | Kỳ vọng chuẩn | Kết luận |
|---|---|---|---|
| **Không bán vượt tồn kho (Zero Oversell)** | `10` | `<= 10` | **ĐẠT** ✅ |
| **Tồn kho không âm (available_stock >= 0)** | `0` | `>= 0` | **ĐẠT** ✅ |
| **Nhất quán giữa reserved_stock và bảng reservations** | `10` | `10` | **ĐẠT** ✅ |
| **Số lượng mua thành công đúng bằng stock ban đầu** | `10` | `10` | **ĐẠT** ✅ |
| **Khớp số đơn giữa HTTP 201 và bản ghi DB** | `10` | `10` | **ĐẠT** ✅ |

> **KẾT LUẬN NFR-04.1**: **ĐẠT CHUẨN HOÀN TOÀN (100% PASS)**. Hệ thống ngăn chặn triệt để tình trạng oversell khi có 100 phiên tranh mua đồng thời. Không có bất kỳ đơn hàng nào vượt quá lượng tồn khả dụng, không có bản ghi tồn kho nào bị âm.

---

## 3. Kết quả Đo lường Trực tiếp NFR-01 (Độ trễ Phản hồi API)

| Chỉ số Latency / Throughput | Giá trị đo được | Đánh giá NFR |
|---|---|---|
| **Min Response Time** | `483.0 ms` | Requests đầu tiên phục vụ nhanh |
| **Average Response Time (Avg)** | `1353.5 ms` | Giao dịch ghi CSDL có khóa dòng |
| **Median Response Time (p50)** | `1395.1 ms` | 50% người dùng nhận kết quả dưới mốc này |
| **p90 Response Time** | `1827.6 ms` | 90% giao dịch hoàn tất |
| **p95 Response Time** | `1865.4 ms` | Đạt yêu cầu NFR-01 (< 3000 ms) |
| **p99 Response Time** | `1894.1 ms` | Yêu cầu k6 xuất percentile thực |
| **Max Response Time** | `1899.8 ms` | Không bị timeout |
| **Throughput (RPS)** | `50.8 req/s` | Khả năng đáp ứng tức thời |

---

## 4. Kết luận Tổng thể
- **Trạng thái NFR-04.1**: **PASS**
- **Mã thoát (Exit Code)**: `0`
