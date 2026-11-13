# Báo cáo kiểm tra bộ API Contract

**Phiên bản:** 0.1.1 · **Mốc yêu cầu nhóm:** 09/10/2026.

Báo cáo sinh bởi `validate_contract.py` sau khi toàn bộ kiểm tra tài liệu bên dưới hoàn tất. PASS ở đây chỉ áp dụng cho tài liệu/fixtures và đối chiếu tĩnh đã liệt kê.

| Kiểm tra đã chạy | Kết quả |
|---|---|
| OpenAPI 3.0.3, YAML không key trùng và cấu trúc chuẩn | PASS |
| 7 operationId riêng, path parameters, security schemes và 25 local refs | PASS |
| 80 fixture request/response khớp schema và OpenAPI; lỗi khớp HTTP status | PASS |
| Cả 6 operation khách có lỗi bắt đổi mật khẩu; callback dùng quyền server riêng | PASS |
| 15 mẫu sai bị schema từ chối; BIGINT > 2^53 dạng chuỗi được giữ | PASS |
| Công thức tiền/phân trang của fixtures và ví dụ reservation nội bộ | PASS |
| Markdown fences và liên kết file nội bộ | PASS |
| Đối chiếu source: 18 model/10 enum, 4 enum contract, chữ ký SQL và các field/constraints liên quan | PASS |

- OpenAPI: 6 đường dẫn, 7 thao tác, 26 schemas.
- Fixtures: 80 request/response examples; mẫu từ chối schema: 15.
- Công cụ: openapi-spec-validator 0.7.2, openapi-schema-validator 0.6.3, PyYAML 6.0.3; tính tiền mẫu bằng Decimal.
- Chữ ký/nội dung SQL được đọc từ file; không thực thi hàm SQL.

## Lưu ý từ source nền

- Source nền thiếu `backend/src/core/filters/http-exception.filter.ts`.
- Source nền thiếu `backend/src/core/interceptors/logging.interceptor.ts`.
- Schema nền chưa có passwordChangeRequired; đây là field auth context đề xuất, cần Auth của Khang cung cấp trạng thái tương đương.

## Chưa được kiểm thử hoặc xác nhận

- Không chạy API thật, JWT/Auth guard, PostgreSQL migrations/seed, transaction, race condition, load test hoặc E2E.
- Không chứng nhận chống oversell/idempotency của backend; các ca triển khai nằm trong stock-reservation-contract.md.
- Các điều kiện nghiệp vụ như productId trùng, so khớp callback, giới hạn BIGINT thực, trạng thái đổi mật khẩu phải được service/guard thực thi; kiểm tra schema mẫu không chứng minh điều đó.
- Cập nhật Auth mới được đọc từ ảnh, chưa kiểm chứng trên source Auth mới.
- Chưa có bằng chứng Khang/Minh/Trọng/Triết đã duyệt các lựa chọn ĐỀ XUẤT.

## Nhận diện bản YAML được kiểm tra

SHA-256: `3e8529fc0c8578e0fb8a4dbb930e46e5e694e6aa918d3761bbd65e14566ba2a3`

Chạy lại bằng hướng dẫn trong README.md sau mỗi thay đổi contract.
