# P1 ↔ P5: hợp đồng API chatbot tại 4de4cbc

Đã đối chiếu trực tiếp `backend/src/chatbot/dto/chat.dto.ts`, `chatbot.controller.ts`
và `SendMessageResult` trong `chatbot.service.ts` ngày 04/11/2026.
Backend hiện đã có code RAG (STT 25/26). Đây không còn là hợp đồng đề xuất của bản UI đầu.

## Request thật

`POST /chatbot` (backend cũng nhận `/chatbot/message`). JSON:

```json
{ "message": "Chính sách đổi trả thế nào?", "sessionToken": "sess_server-issued-id" }
```

- Lượt đầu chỉ gửi `message`; các lượt sau dùng `sessionToken` backend trả về.
- Tối đa 1.000 ký tự, không cho câu rỗng sau trim. Không gửi `conversationId` lên HTTP:
  backend đang bật `forbidNonWhitelisted`, trường lạ sẽ bị từ chối.
- Có phiên thật: gửi `Authorization: Bearer <accessToken>`. Khách chưa đăng nhập cũng có thể hỏi.
- Không gửi userId, role, refresh token hoặc token xem trước `mock-*`.
- Giữ URL gốc từ `NEXT_PUBLIC_API_URL` hiện có, mặc định `http://localhost:3001`.
- Không tự retry POST khi timeout/lỗi/401. Timeout 30 giây; request có thể đã được server nhận.

## Response thật

```json
{
  "sessionToken": "sess_server-issued-id",
  "reply": "Câu trả lời",
  "role": "ASSISTANT",
  "isFallback": false,
  "escalatedToHuman": false,
  "retrievedDocuments": [],
  "latencyMs": 250
}
```

`tokenUsage` là tùy chọn. Frontend chỉ lấy nội dung trả lời, sessionToken và hai cờ boolean;
không hiển thị toàn bộ retrievedDocuments/context/metadata.

Adapter `chatbotApi.ts` chuyển response về mô hình nội bộ cũ để không sửa toàn bộ state/UI:

| Trường HTTP thật | Trường nội bộ P1 |
| --- | --- |
| `sessionToken` | `conversationId` (chỉ nội bộ, không gửi tên này lên HTTP) |
| `reply` | `answer` |
| `escalatedToHuman` | `escalateToSupport` |
| `isFallback` | `isFallback` |

UI báo rõ phản hồi dự phòng. Khi escalatedToHuman=true, UI chỉ xác nhận phiên được đánh dấu
cần hỗ trợ; không xác nhận đã có nhân viên trực tuyến hoặc ticket được tiếp nhận.

## Endpoint liên quan

Backend còn có `GET /chatbot/history/:sessionToken` và `POST /chatbot/escalate`.
Bản P1 này tiếp tục dùng lịch sử sessionStorage theo từng tài khoản/tab, không gọi hai endpoint
đó. Câu hỏi yêu cầu gặp nhân viên được service xử lý và trả cờ escalatedToHuman.
Không tự thêm client userId hay gọi Internal API từ frontend.

## Việc còn cần nghiệm thu

Chạy backend thật với DB local đã cấu hình, test hai câu liên tiếp để chắc session được tiếp tục,
trường hợp fallback và yêu cầu CSKH. Nếu không có Anthropic key, service có nhánh dự phòng;
không coi kết quả đó là kiểm thử chất lượng Claude/RAG đầy đủ. Không đổi `.env` để áp dụng patch.

P5 cần review xác thực JWT và quyền trên phiên chat trước khi dùng dữ liệu riêng tư; xem
[P5-REVIEW.md](P5-REVIEW.md). Kiểm thử UI tách tài khoản không chứng minh backend đã phân quyền đúng.
