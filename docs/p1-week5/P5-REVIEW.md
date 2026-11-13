# Ghi chú review backend gửi Minh (P5)

Đọc code tại `4de4cbc`; patch P1 không tự sửa backend.

1. `ChatbotController.sendMessage` dùng `jwtService.decode()` để lấy sub/id.
   Decode không xác minh chữ ký hay hạn token. Cần verify JWT/guard phù hợp trước khi coi
   userId là danh tính đã xác thực, đặc biệt trước khi nối tra cứu đơn/tồn kho theo quyền.
2. `getOrCreateSession` trả phiên hiện có theo sessionToken mà chưa đối chiếu userId của
   phiên với user đang hỏi. History/escalate cũng truy cập theo token mà không có kiểm tra
   chủ sở hữu tài khoản trong controller hiện tại. Với chat khách, cần xác định rõ sessionToken
   là capability bí mật; với phiên đã thuộc user, cần chính sách quyền cụ thể phía server.
3. STT 27 function calling và quyền Internal API cần test riêng. Có RAG controller/service
   không đồng nghĩa đã có đủ tra cứu đơn thật hoặc cơ chế nhân viên tiếp nhận yêu cầu CSKH.

Frontend tách lịch sử theo tài khoản và không gửi userId từ client, nhưng các kiểm tra đó
không thay thế xác thực/phân quyền server. Đây là các điểm cần nhóm review trước nghiệm thu
với dữ liệu riêng tư; không phải lỗi có thể sửa chỉ bằng đổi giao diện P1.
