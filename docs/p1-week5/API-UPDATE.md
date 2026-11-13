# Cập nhật sau khi đã áp dụng ZIP P1 tuần 5 đầu tiên

Chỉ dành cho trường hợp đã pull backend `4de4cbc` và áp dụng `trong-week5-chatbot.patch`
như log của Trọng. Không áp dụng lại patch đầu hoặc ghi đè toàn bộ project.

1. Tải `trong-week5-api-update.patch` vào Downloads.
2. Ở thư mục gốc dự án, chạy:

```powershell
git apply --check "C:\Users\ADMIN\Downloads\trong-week5-api-update.patch"
```

Nếu không lỗi mới chạy:

```powershell
git apply "C:\Users\ADMIN\Downloads\trong-week5-api-update.patch"
git diff --check
cd frontend
node --test tests/chatbot.test.mjs
npm run lint
npm run build
```

3. Test chat: có thể chạy backend thật với DB local hiện có (không cần tài khoản để hỏi chính sách),
hoặc dùng fixture như README. Fixture đã đổi đúng schema mới và vẫn gắn nhãn KIỂM THỬ.
4. Từ thư mục gốc dùng các lệnh stage/commit trong README để commit toàn bộ phần P1 tuần 5
một lần; patch bổ sung này không đụng code backend của Minh.

Các thay đổi so với bản đầu:

- 1.000 ký tự thay vì 2.000.
- HTTP body `{message, sessionToken?}` thay vì `{message, conversationId?}`.
- Response `reply`, `sessionToken`, `isFallback`, `escalatedToHuman` được chuyển về model UI.
- Hiện nhãn phản hồi dự phòng và ghi nhận nhu cầu CSKH.
- Cập nhật test, fixture và tài liệu; bổ sung ghi chú review JWT/quyền phiên để P5 xử lý.
