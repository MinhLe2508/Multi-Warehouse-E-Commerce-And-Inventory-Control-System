# F119, F120, F222 và F122 · CNPM

Bản vá dành cho nhánh `project` tại commit `87db396bbdd0376fa74e352fdfc2ff2c4c51ac44`. Gói chứa bốn tệp để đưa vào repo.

| Mục | Tệp | Kết quả |
| --- | --- | --- |
| F119 | `backend/test/fixtures/prepare-e2e.cjs` | Chuẩn bị đúng một Admin, một Staff và hai Customer cho mỗi lượt. Tạo dữ liệu tồn kho, đơn, chat và KB có ID theo lượt và số liệu đối soát. |
| F120 | `backend/test/fixtures/cleanup-e2e.cjs` | Xác nhận manifest, kết nối test và phạm vi bản ghi trước khi dọn. Thực hiện trong giao dịch và chạy lại an toàn. |
| F222 | `docs/qa/role-permissions.md` | Ma trận quyền theo route, trạng thái tài khoản, trường nhạy cảm, socket và các điểm cần nhóm xác nhận. |
| F122 | `backend/test/e2e/admin-data-access.e2e-spec.ts` | Kiểm thử xác thực, phân quyền, doanh thu, giá vốn và quyền chủ sở hữu qua NestJS và PostgreSQL thật. |

## Áp dụng trên máy của Khang

Giải nén ZIP, đặt `$patchDir` thành thư mục giải nén và chạy từ thư mục gốc repo.

```powershell
$patchDir = 'C:\duong-dan\Khang_F119_F120_F122_F222_18-11-2026'
git apply --check "$patchDir\cnpm-e2e.patch"
git apply "$patchDir\cnpm-e2e.patch"
git status --short
```

Các tệp trong `backend` và `docs` của ZIP giữ đường dẫn tương ứng trong repo để Khang có thể xem trực tiếp.

## Chạy kiểm thử

Xem phần chạy trên PostgreSQL kiểm thử trong `docs/qa/role-permissions.md`. Sử dụng database kiểm thử tên `cnpm_e2e_test_*` và các migration hiện có. Jest tạo, kiểm tra và dọn dữ liệu tự động khi có `E2E_TEST_DATABASE_URL`.

## Kết quả đã xác minh ngày 18/11/2026

- PostgreSQL 16.15 áp đủ 4 migration hiện có.
- Bộ `admin-data-access` đạt **11/11**. Mười ca dùng PostgreSQL và một ca kiểm tra cấu hình database.
- Hai script chạy được từ CLI. Mỗi lượt tạo đúng một Admin và một Staff. Dọn theo manifest thành công và lần hai xóa 0 bản ghi. Bài E2E còn kiểm tra kho đối chứng tồn tại sau khi dọn.
- `staff-db` và `categories-db` đạt **9/9**. Build backend và kiểm tra tĩnh các tệp mới đạt.
- Ma trận F222 ghi rõ phần cần thống nhất tiếp về guard đổi mật khẩu trên các route quản trị, quyền Staff theo kho và phạm vi summary tồn kho.

[Commit làm mốc](https://github.com/MinhLe2508/Multi-Warehouse-E-Commerce-And-Inventory-Control-System/commit/87db396bbdd0376fa74e352fdfc2ff2c4c51ac44)
