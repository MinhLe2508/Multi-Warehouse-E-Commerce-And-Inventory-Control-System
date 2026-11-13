# Kết quả kiểm tra P1 tuần 5

Code nền: `origin/project` tại `a99d8cd`. Ngày kiểm tra: 03/11/2026.
Phạm vi: frontend ChatWidget và HTTP fixture; không thay backend hay `.env`.

## Kết quả đã chạy

| Kiểm tra | Kết quả | Giới hạn |
| --- | --- | --- |
| `node --test tests/chatbot.test.mjs` | 10 pass, 0 fail | Transport/Auth được giả lập, không gọi LLM |
| Các suite Auth, Cart, LiveOrders, Chatbot của P1 | 35 pass, 0 fail, 1 skip | Test live Orders API cũ bị skip vì thiếu fixture riêng; không phải chatbot test bị skip |
| `npm run lint` | Pass | Kiểm tra tĩnh frontend |
| `npm run build` | Pass | Compile, TypeScript và tạo trang production |
| Chromium desktop 1365×900, mobile 375×812 | Pass các luồng dưới đây | Backend chatbot là fixture; Auth refresh giả lập để kiểm tra tách phiên |
| `git diff --check` | Pass | Không lỗi khoảng trắng |

Các suite P1 đã chạy:

```powershell
node --test tests/auth.test.mjs tests/cart.test.mjs tests/cart-store.test.mjs tests/live-orders.test.mjs tests/chatbot.test.mjs
```

Luồng browser đã kiểm tra: mở widget, gửi hai câu liên tiếp cùng conversationId, tải lại lịch sử,
CSKH, lỗi 503 và retry chủ động không nhân đôi câu hỏi trong UI, xóa chat khi request đang chờ,
không hồi sinh phản hồi cũ, chuỗi HTML hiển thị như văn bản, Escape đóng chat, khung mobile không tràn,
hai tài khoản giả lập không thấy lịch sử nhau và trang Login không chứa widget. Không ghi nhận
JavaScript page error trong các luồng này.

Trong quá trình kiểm tra đã phát hiện ô nhập đôi khi không nhận câu tiếp theo sau lần gửi đầu;
đã tách composer và giữ ô nhập có thể soạn nháp trong lúc chờ, chỉ khóa nút Gửi. Chạy lại luồng
nhiều câu trên browser sau sửa đã qua.

## Truy vết nhiệm vụ 28

| Yêu cầu | Nơi thực hiện | Minh chứng |
| --- | --- | --- |
| Bong bóng chat / hội thoại | ChatWidget.tsx + Storefront layout | Browser desktop/mobile |
| Hook gọi chatbot | useChatbot.ts + chatbotApi.ts | HTTP payload/JWT tests |
| Lịch sử hội thoại | chatSession.ts | Reload, bounded history, storage failure tests |
| Reply / CSKH | ChatWidget.tsx + parseReply | Fixture reply và escalation, không thực thi HTML |
| Không lộ chat khác phiên | Scope theo tài khoản, hủy request cũ | Unit race tests + đổi tài khoản giả lập trên browser |

## Chưa nghiệm thu trong lần kiểm tra 03/11/2026

- P5 chưa có `POST /chatbot` thật trong code nền. Hợp đồng JSON đang là đề xuất.
- Chưa kiểm chứng RAG, embedding, function calling, phân quyền conversation/đơn phía server,
  accuracy, latency LLM, rate limit hoặc ticket CSKH thật.
- Khách hỏi FAQ không token và định dạng response cần P5 xác nhận.
- Chưa chạy toàn bộ suite Admin/Inventory trong lần kiểm tra này; phạm vi regression là P1.

## Ghi nhận hỗ trợ AI cho báo cáo

Prompt yêu cầu của Trọng: “vậy làm xong cho tớ tuần 5 bro”, sau đó “Làm cho oke phần cuối này nha”.
AI được dùng để đọc code nền, triển khai UI/hook/adapter, viết test hành vi và hướng dẫn.
Kết quả được đối chiếu bằng ESLint, build/TypeScript, test tự động và thao tác browser với fixture.
Các kiểm tra đó không thay thế kiểm thử backend thật hoặc xác nhận nghiệp vụ của nhóm.

Khi P5 sẵn sàng, cập nhật hồ sơ bằng request/response thật đã che token, ảnh/video và kết quả
từng ca trong README. Không ghi những ca chưa chạy là đã pass.

## Cập nhật tương thích API — 04/11/2026

Đã đối chiếu DTO/controller/service mới của P5 tại `4de4cbc` và đổi:
request `sessionToken`, response `reply`/`escalatedToHuman`/`isFallback`, max 1.000 ký tự.
Các nhận xét phía trên về API chưa tồn tại chỉ mô tả lần kiểm tra cũ ngày 03/11, không còn
đúng với trạng thái code backend hiện tại. Chất lượng RAG/LLM, DB thật và phân quyền server
vẫn chưa được nghiệm thu. Test/fixture đã được chuyển sang đúng định dạng backend mới.

Kết quả sau cập nhật: 10 test chatbot pass; regression P1 35 pass, 1 live checkout test skip;
ESLint và production build pass. Browser với fixture đúng định dạng P5 mới: gửi liên tiếp cùng
sessionToken, giới hạn 1.000 ký tự, fallback/CSKH và tải lại lịch sử đã pass, không page error.
Không chạy DB/Anthropic thật trong lần xác nhận này.
