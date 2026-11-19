# [Trọng] P1 tuần 5 — ChatWidget Storefront

Đã có bản cập nhật API theo commit P5 `4de4cbc`. Nếu đã áp dụng ZIP UI ban đầu,
xem [API-UPDATE.md](API-UPDATE.md) để áp dụng patch bổ sung, không áp dụng lại patch cũ.

Theo timeline, nhiệm vụ 28: bong bóng chat, lịch sử hội thoại, hook `useChatbot`, gọi
`POST /chatbot`, hiển thị trả lời và trạng thái trạng thái CSKH.

## Phạm vi đã làm

- ChatWidget dùng chung cho các trang Storefront; không chèn vào Admin/Staff/Auth.
- Mở/đóng, Escape để đóng, nhãn cho bàn phím/screen reader, khung chat responsive.
- Câu hỏi, trả lời, đang chờ, thử gửi lại, chat mới; chặn gửi trùng khi đang chờ.
- Lịch sử tối đa 50 tin trong `sessionStorage`, tách khách và từng tài khoản, không lưu token.
  Đây là lịch sử của một tab/phiên trình duyệt, không phải đồng bộ lịch sử server hay giữa thiết bị.
- Đổi tài khoản/đăng xuất không hiển thị hội thoại và bản nháp tài khoản cũ.
- Chat mới/unmount/đổi tài khoản hủy request; phản hồi đến trễ không phục hồi tin đã xóa.
- Chịu được storage lỗi/hết dung lượng; không crash hoặc mất khả năng chat trong bộ nhớ.
- Gửi JWT thật khi có phiên, giữ nguyên logic Auth hiện có, không dùng token xem trước.
- Hiển thị phản hồi dạng văn bản thuần. Banner CSKH không giả lập đã tạo ticket.

Không sửa `.env`, schema, seed, backend, lockfile hay phần việc chatbot của P5.

## Trạng thái tích hợp

Đã cập nhật adapter theo backend mới `4de4cbc`: request dùng `sessionToken`, response dùng
`reply`, `escalatedToHuman`, `isFallback`; giới hạn câu hỏi 1.000 ký tự. Xem
[API-CONTRACT.md](API-CONTRACT.md). Chưa nghiệm thu end-to-end với DB/LLM thật.
Phiên bản UI trước đó trên nền `a99d8cd` dùng hợp đồng đề xuất nên cần patch bổ sung này.

## Áp dụng patch

Tại thư mục gốc dự án, trên `project` với working tree sạch:

```powershell
git pull --ff-only origin project
git apply --check "C:\Users\ADMIN\Downloads\Trong_P1_Week5\trong-week5-chatbot.patch"
```

Nếu không lỗi mới chạy:

```powershell
git apply "C:\Users\ADMIN\Downloads\Trong_P1_Week5\trong-week5-chatbot.patch"
git diff --check
git status
```

Nếu patch không áp dụng được do nhóm đã sửa cùng file, không dùng force/ghi đè layout.

## Kiểm tra tự động

Chạy trong `frontend`:

```powershell
node --test tests/chatbot.test.mjs
npm run lint
npm run build
```

Các test kiểm tra hợp đồng HTTP/JWT, không tự retry POST, lỗi mạng/server, dữ liệu sai,
refresh trước gửi, gửi nhanh, lịch sử, retry chủ động, CSKH, storage lỗi, clear và đổi tài khoản
giữa request. Test dùng mock transport, không gọi LLM hay database thật.

## Test giao diện riêng bằng fixture

Fixture là máy chủ kiểm thử riêng, trả câu mẫu được đánh dấu `[KIỂM THỬ GIAO DIỆN]`.
Chỉ chạy khi cổng backend 3001 chưa được dùng; không tắt hay thay thế backend của người khác.
Không cần PostgreSQL, Gmail, tài khoản CUSTOMER hoặc sửa `.env` để thử chat khách với fixture.
Nếu frontend đang cấu hình API URL khác mặc định localhost:3001 thì fixture này không dùng trực tiếp;
cần dùng backend phù hợp với cấu hình hiện tại, không tự thay `.env`.

Terminal 1, tại gốc dự án:

```powershell
node docs/p1-week5/chatbot-fixture.mjs
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Mở URL frontend ghi trong terminal (thường `http://localhost:3000`). Dùng cửa sổ ẩn danh
chưa đăng nhập để tránh phiên xem trước `admin/admin` hoặc `staff/staff`.

| Bước | Thao tác | Kết quả mong đợi |
| --- | --- | --- |
| 1 | Mở Hỗ trợ; gửi một câu bất kỳ | Hiện câu hỏi, đang chờ, rồi câu trả lời có nhãn KIỂM THỬ |
| 2 | Gửi câu tiếp theo; tải lại trang rồi mở chat | Lịch sử còn trong cùng phiên tab |
| 3 | Gửi `cskh` | Hiện đã ghi nhận nhu cầu CSKH, không khẳng định có nhân viên trực tuyến |
| 4 | Gửi `loi` | Hiện lỗi, câu hỏi còn; không tự gửi lại |
| 5 | Gửi câu bình thường sau lỗi, sau đó gửi `fallback` | Chat hoạt động tiếp; câu fallback có nhãn phản hồi dự phòng |
| 6 | Gửi `cham`, bấm Chat mới ngay | Hủy chờ; phản hồi trễ không xuất hiện lại |
| 7 | Thử câu trống, gửi nhanh liên tiếp | Không tạo câu rỗng hoặc hai request đang chờ |
| 8 | Thử màn hình điện thoại, Tab, Escape, Shift+Enter | Khung không tràn, đóng/mở và soạn tin bằng bàn phím được |
| 9 | Tắt fixture, gửi câu hỏi | Báo lỗi kết nối, giữ câu hỏi; không trả câu giả |

Ctrl+C để dừng fixture sau test. Fixture không ghi database và không cung cấp API đăng nhập.

## Nghiệm thu khi P5 sẵn sàng

1. Dừng fixture, chạy backend thật tại `4de4cbc` hoặc bản tương thích mới hơn.
   Trong backend chạy `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`,
   `npm run start:dev` với DB local đã cấu hình; không sửa `.env`.
2. Test chính sách, tiếp tục hội thoại, tình huống ngoài phạm vi và CSKH.
3. Đăng nhập CUSTOMER thật, tra cứu đơn của mình; thử ID hội thoại/đơn của người khác
   phải bị server chặn. Đăng xuất/đổi tài khoản kiểm tra không lộ lịch sử cũ.
4. Kiểm tra Network có JWT đúng, không có `userId`/role/refresh token trong body.
5. Lưu ảnh, request/response đã che token, kết quả và lỗi để làm minh chứng tuần 6.

## Các file P1 thay đổi

- `frontend/app/(Storefront)/layout.tsx`: gắn widget trong Storefront.
- `frontend/components/storefront/ChatWidget.tsx`: giao diện chat.
- `frontend/hooks/useChatbot.ts`: vòng đời và kết nối Auth.
- `frontend/shared/lib/chatbotApi.ts`: adapter HTTP và validation response.
- `frontend/shared/lib/chatSession.ts`: trạng thái, lưu lịch sử, hủy request và retry.
- `frontend/tests/chatbot.test.mjs`: test hành vi và hợp đồng API.
- `docs/p1-week5/`: hướng dẫn, hợp đồng API đã đối chiếu, fixture và kết quả kiểm tra.

## Commit sau khi kiểm tra

Chạy tại gốc dự án:

```powershell
git --literal-pathspecs add -- "frontend/app/(Storefront)/layout.tsx" frontend/components/storefront/ChatWidget.tsx frontend/hooks/useChatbot.ts frontend/shared/lib/chatSession.ts frontend/shared/lib/chatbotApi.ts frontend/tests/chatbot.test.mjs docs/p1-week5
git diff --cached --check
git diff --cached --stat
```

Nếu chỉ có các file tuần 5 dự kiến, tiếp tục:

```powershell
git commit -m "[Trong] - Hoàn thiện giao diện chatbot tuần 5"
git pull --rebase origin project
```

Chỉ khi rebase thành công mới chạy `git push origin project`. Nếu conflict thì dừng xử lý,
không force push. Báo Minh: P1 đã cập nhật adapter theo DTO/response của commit `4de4cbc`;
không báo đã nghiệm thu RAG chỉ dựa trên fixture.
