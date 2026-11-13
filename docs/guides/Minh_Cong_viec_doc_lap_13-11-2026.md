# Công việc Minh có thể làm độc lập

Ngày đối chiếu: 13/11/2026. Mã local được kiểm tra: nhánh `project`, commit `8760669965c01751d881a9ed8e467dfa69449bb7`.

Tài liệu này chọn những phần Minh có thể bắt đầu và tự kiểm tra mà không cần đợi thành viên khác sửa code. Đây là danh sách công việc, chưa phải kết quả đã triển khai hoặc nghiệm thu.

Nguồn phân công:

- `D:/MinhDangHocCode/CNPM/Project/CNPM_Ke_hoan_thien_13-11-2026.docx`.
- `D:/MinhDangHocCode/CNPM/Project/CNPM_Phan_cong_theo_file_13-11-2026.xlsx`, sheet `Phan_cong_file` và `Nghiem_thu`.

Hai nguồn trên lập theo commit `5461a97`, khác mã local. Mã F dưới đây dùng để truy vết yêu cầu; chỉ những phần được mô tả trong tài liệu này thuộc phạm vi làm độc lập. Không mặc định toàn bộ một mã F đều độc lập.

## 1. Phạm vi để không ảnh hưởng phần của người khác

Minh có thể tự làm các công cụ chấm điểm, xử lý kết quả kiểm thử, unit test cô lập và tài liệu thuộc phần mình. Không cần đợi Huy, Khang, Triết hoặc Trọng hoàn thành module của họ.

Điều kiện giữ phạm vi:

- Không đổi API, DTO công khai, tên tool, payload socket, enum hoặc chính sách nghiệp vụ.
- Không sửa schema, migration, seed và dữ liệu PostgreSQL dùng chung/demo.
- Không chạy setup/load/cleanup/sync KB trên DB chung khi làm các mục dưới đây.
- Không sửa giao diện, hook hoặc store frontend của Trọng/Triết.
- Không thay đổi workflow CI/CD đang dùng chung, Compose, scripts chung hoặc dependency chỉ để phục vụ công việc cô lập.
- Khi sửa công cụ hiện có, giữ tương thích với caller; bổ sung field tùy chọn nếu cần. Nếu bắt buộc đổi interface, tách phần đó sang việc phối hợp.
- Có thể làm trên nhánh riêng theo tiền tố `codex/`; ghép vào nhánh nhóm sau review như quy trình chung.

Không có thay đổi code nào bảo đảm tuyệt đối không ảnh hưởng sau khi ghép. Danh sách này giảm phụ thuộc bằng cách giới hạn thay đổi vào công cụ/test/tài liệu và yêu cầu kiểm tra tương thích trước bàn giao.

## 2. Danh sách ưu tiên

| Thứ tự | Việc độc lập | Mã liên quan | Cần đợi ai trước khi bắt đầu? | Điểm dừng |
| --- | --- | --- | --- | --- |
| 1 | Tách và kiểm thử logic kết luận load test | F209, F218 | Không | Có verdict đúng từ fixture; chưa tuyên bố hệ thống đạt NFR |
| 2 | Chuẩn hóa parser số liệu và kiểm tra cùng lần chạy | F110–F111, F114, F218 | Không | Kiểm chứng bằng dữ liệu giả; chưa chạy tải vào DB chung |
| 3 | Nâng chất lượng grader chatbot | F101, F103 | Không | Bắt đủ facts sai/mâu thuẫn/rò rỉ trong fixture |
| 4 | Chuẩn bị bộ câu hỏi và phản ví dụ chatbot | F093, F100, F219 | Không với fixture kỹ thuật | Nội dung policy chưa chốt để PENDING_POLICY |
| 5 | Hoàn thiện định dạng báo cáo eval | F092, F102, F104 | Không với formatter và fixture | Chưa thay báo cáo nghiệm thu bằng dữ liệu giả |
| 6 | Bổ sung unit test chatbot không dùng dịch vụ thật | F088, F096, F098, F100 | Không | Test chạy bằng mock; lỗi phát hiện được ghi lại |
| 7 | Viết hướng dẫn và danh mục cấu hình | F091, F112, F128, F130, F134, F139 | Không với bản nháp | Chưa ghi fresh setup/PASS hoặc release đã đạt |

## 3. Chi tiết việc cần làm

### 3.1. Sửa logic kết luận của load test

Mã liên quan: F209, F218; phục vụ N34 và N35.

File chính:

- `load-tests/verify-oversell.ts`.
- `load-tests/verify-oversell.spec.ts` — tạo mới theo kế hoạch.
- Có thể thêm module hàm thuần trong `load-tests/` để test verdict không khởi động Nest hoặc kết nối DB.

Công việc:

- [ ] Tách phần tính kết luận khỏi phần đọc DB và ghi file.
- [ ] Mỗi kiểm tra có `expected`, `observed`, `passed` và lý do khi thiếu dữ liệu.
- [ ] Dùng cùng một kết quả để sinh Markdown/JSON và quyết định exit code.
- [ ] Bỏ kết luận PASS cố định trong nội dung báo cáo.
- [ ] Thiếu số liệu hoặc sai identity lần chạy phải trả FAIL/INVALID theo quy ước rõ ràng.
- [ ] Kiểm tra đủ số lượng order, quantity, reservation và các invariant tồn kho theo dữ liệu đầu vào; không chỉ đếm HTTP thành công.
- [ ] Dữ liệu chưa có trong pipeline được ghi là thiếu, không tự đặt bằng 0 hoặc suy ra đạt.

Fixture bắt buộc:

| Fixture | Kết quả phải có |
| --- | --- |
| Expected 10, nhưng reserved/orders/HOLDING đều 0 | FAIL hoặc INVALID; không có kết luận đạt chung |
| HTTP báo thành công nhưng hậu kiểm DB không khớp | FAIL hoặc INVALID |
| Reserved lớn hơn stock hoặc available âm | FAIL |
| Đủ dữ liệu và mọi invariant khớp | PASS cho fixture đó |
| Thiếu dữ liệu bắt buộc hoặc trộn hai run | INVALID hoặc FAIL, exit khác 0 |

Hoàn thành độc lập khi unit test chứng minh logic đúng. Việc chạy lại hệ thống thật để đóng F113/F114 thực hiện sau tích hợp, không thuộc mục này.

### 3.2. Chuẩn hóa xử lý metrics và identity của lần chạy

Mã liên quan: phần công cụ của F110, F111, F114, F218.

- [ ] Viết parser có thể kiểm thử bằng fixture cho summary k6/Node đang có.
- [ ] Phân biệt metric không có với metric đo được bằng 0; thiếu p99 hiển thị `unavailable`.
- [ ] Kiểm tra `runId`, SHA, runner và manifest khi đối chiếu các nguồn kết quả.
- [ ] Nếu file cũ thiếu identity, ghi rõ không đủ điều kiện ghép vào lần chạy hiện hành.
- [ ] Kiểm tra tổng success + conflict dự kiến + lỗi ngoài dự kiến khớp tổng request.
- [ ] Chuẩn bị cách trình bày latency success riêng với HTTP 409 khi nguồn có dữ liệu tương ứng.
- [ ] Không tự đặt ngưỡng độ trễ thành yêu cầu SRS khi chưa xác nhận nguồn.
- [ ] Lưu fixture ở thư mục test rõ ràng; không ghi đè `load-test-summary.json` hoặc manifest thực.

Hoàn thành độc lập khi parser và formatter có test cho dữ liệu đủ, thiếu, sai kiểu và khác run. Chuyển callers, đổi npm scripts, chạy k6 thật và hợp nhất hai bộ runner là bước tích hợp riêng.

### 3.3. Nâng chất lượng grader chatbot

Mã liên quan: F101, F103.

File chính:

- `backend/src/chatbot/eval/chatbot-eval.grader.ts`.
- `backend/src/chatbot/eval/chatbot-eval.spec.ts`.
- Chỉ mở rộng kiểu expectation trong `chatbot-eval.cases.ts` khi giữ tương thích với các case cũ.

- [ ] Bổ sung tiêu chí bắt buộc đủ facts, thay vì có một từ khóa đúng là đạt.
- [ ] Bắt câu trả lời chứa facts đúng nhưng kèm số tiền, trạng thái hoặc thông tin mâu thuẫn.
- [ ] Bắt dữ liệu đơn người khác và thông tin không được phép xuất hiện trong fixture.
- [ ] Kiểm tra tool evidence, fallback và escalation bằng expectation rõ ràng.
- [ ] Tạo phản ví dụ: trả lời có từ khóa đúng nhưng sai dữ liệu vẫn phải FAIL.
- [ ] Giữ nguyên nội dung policy và ngưỡng nghiệp vụ chưa được nhóm chốt; dùng facts giả có nhãn fixture để test grader.
- [ ] Giữ caller hiện tại hoạt động; cập nhật test liên quan của bộ eval nếu mở rộng kiểu nội bộ.

Hoàn thành độc lập khi grader vượt qua test đúng/sai bằng dữ liệu tổng hợp. Không cần gọi LLM, Redis hoặc PostgreSQL.

### 3.4. Chuẩn bị câu hỏi, paraphrase và phản ví dụ

Mã liên quan: phần chuẩn bị test của F093, F100, F219.

- [ ] Câu hỏi yêu cầu xem đơn không thuộc người hỏi.
- [ ] Khách chưa đăng nhập yêu cầu tra cứu đơn.
- [ ] Câu hỏi nhiều lượt như “đơn đó”, nhưng session không có ngữ cảnh đủ.
- [ ] Đổi tài khoản rồi dùng session của tài khoản cũ.
- [ ] Prompt injection yêu cầu bỏ qua quyền hoặc tiết lộ thông tin.
- [ ] Tham số tool sai kiểu, minPrice lớn hơn maxPrice hoặc UUID không hợp lệ.
- [ ] Paraphrase ngoài các câu mẫu đã dùng để phát triển chatbot.
- [ ] Case provider lỗi, retrieval rỗng và fallback.

Mỗi case cần có ID, fixture đầu vào, facts được phép trả, điều cấm, expected behavior và lý do. Case phụ thuộc COD/phí ship/chính sách chưa thống nhất đánh dấu `PENDING_POLICY`, không tự quyết đáp án.

Không nhét câu trả lời của bộ kiểm thử vào prompt/runtime để làm đẹp điểm. Có thể tạo tài liệu case hoặc fixture mới trước; chạy HTTP/provider thật là bước sau.

### 3.5. Hoàn thiện formatter báo cáo eval

Mã liên quan: phần formatter của F092, F102, F104.

File chính: `backend/src/chatbot/eval/chatbot-eval.report.ts` và test liên quan.

- [ ] Thiết kế metadata gồm runId, SHA, phiên bản dataset, thời gian và cấu hình mode thực tế.
- [ ] Phân biệt rõ local, keyword, vector và provider thật; không đoán mode khi thiếu dữ liệu.
- [ ] Xuất đủ expected/observed/checks và latency để đối chiếu cách chấm.
- [ ] Markdown và JSON của cùng lần chạy dùng chung kết quả tổng hợp.
- [ ] Có test cho FAIL, dữ liệu thiếu và câu trả lời chứa ký tự cần escape trong bảng Markdown.
- [ ] Loại secret/token khỏi dữ liệu xuất; dùng fixture giả khi thử formatter.

Giữ tương thích với runner hiện tại. Nếu runner cần đổi interface bắt buộc, ghi phần tích hợp riêng. Không thay `backend/reports/chatbot-eval/latest.md` hoặc tạo `latest.json` bằng fixture rồi coi đó là bằng chứng nghiệm thu.

### 3.6. Bổ sung unit test chatbot cô lập

Mã liên quan: phần test của F088, F096, F098, F100.

- [ ] Retrieval: query rỗng, không có tài liệu, provider lỗi, vector sai chiều và metadata nguồn/mode.
- [ ] Tools: anonymous, owner/other user, tham số không hợp lệ và lỗi dependency; mock service theo interface hiện có.
- [ ] Chatbot: session khác owner, timeout và fallback.
- [ ] KB: chuẩn bị test re-ingest, thay đổi nội dung và lỗi giữa chừng bằng mock; những test yêu cầu hành vi chưa triển khai phải ghi rõ đang FAIL/chưa hoàn thành.
- [ ] Test không tự kết nối dịch vụ thật hoặc sửa dữ liệu dùng chung.

Chỉ sửa helper nội bộ khi cần và giữ interface. Refactor sang InternalOrdersService, đổi persistence KB hoặc đổi hành vi runtime phải được tách sang gói phối hợp tương ứng. Unit/mock không phải bằng chứng khóa, rollback hay ownership qua HTTP thật.

Lệnh kiểm tra ví dụ từ thư mục `backend`:

```powershell
npm test -- --runInBand --runTestsByPath src/chatbot/eval/chatbot-eval.spec.ts
```

Chạy thêm đúng các spec đã thay đổi. Không cần bật app hoặc DB để kiểm tra grader thuần hàm.

### 3.7. Viết tài liệu chuẩn bị

Mã liên quan: phần tài liệu của F091, F112, F128, F130, F134, F139.

Để tránh xung đột file dùng chung, có thể viết bản nháp riêng trong `docs/guides/` trước.

- [ ] Hướng dẫn load test: DB test riêng, setup → chạy tải → verify trước TTL → lưu bằng chứng; phân biệt Node smoke với k6.
- [ ] Danh mục biến môi trường chatbot lấy từ source, mục đích, mode và fallback; không chép giá trị secret.
- [ ] Hướng dẫn unit test/eval, phân biệt service eval với HTTP E2E.
- [ ] Checklist bằng chứng: SHA, runId, command, cấu hình, actual, PASS/FAIL/INVALID/BLOCKED và đường dẫn log.
- [ ] Sơ đồ bản nháp cho PubSub/Socket/RAG hiện có; phần dự kiến được ghi rõ chưa ghép.
- [ ] Danh sách giới hạn và việc còn phụ thuộc thành viên khác.

Không ghi “fresh clone chạy thành công”, “đã release” hoặc “đã đạt NFR” nếu chưa kiểm chứng. Chốt README gốc, env mẫu, sơ đồ release và checklist hoàn tất sau khi nhóm ghép bản cuối.

## 4. Những việc chưa đưa vào phạm vi độc lập

| Việc | Người cần phối hợp | Lý do |
| --- | --- | --- |
| Sửa error envelope dùng chung F005–F006 | Huy, Trọng | Backend và frontend phải thống nhất code lỗi |
| Đổi cleanup F015–F016 sang hết hạn toàn đơn | Huy, Khang | Phụ thuộc expiration service, thứ tự khóa và đăng ký module |
| Thêm inventory.changed, đổi gateway/Alerts | Huy, Khang, Triết | Publisher, transaction, quyền và consumer phải cùng contract |
| Tái sử dụng InternalOrdersService trong chatbot | Huy | Thống nhất lookup/ownership, import/export và DI |
| Sửa policy COD/phí ship, seed hoặc re-ingest KB thật | Trọng, Khang và người chốt nghiệp vụ | Phải khớp checkout; có thay đổi dữ liệu |
| Thêm schema/index hoặc đổi embedding model | Khang | Liên quan migration, vector dimension và re-embed |
| Đổi Compose, CI/CD, package scripts hoặc dependency chung | Các chủ module liên quan | Có thể ảnh hưởng cách cả nhóm chạy/build/test |
| Hợp nhất runner và chuyển caller về load-tests/ | Huy, Khang khi rà tích hợp | Đụng scripts, đường dẫn và fixture DB; chỉ phần logic thuần được làm độc lập trước |
| Chạy load test, DB race hoặc E2E nghiệm thu | Huy, Khang; Triết/Trọng theo luồng | Cần bản tích hợp ổn định, DB test riêng và fixture thống nhất |
| Chạy eval cuối, sinh báo cáo nghiệm thu | Huy/Trọng/Khang theo phụ thuộc | Cần tools, history, policy, KB và cấu hình cuối |
| Merge main, freeze, publish hoặc ghi việc đã nghiệm thu | Cả nhóm/người rà | Là bước xác nhận và bàn giao chung |

## 5. Thứ tự làm đề xuất và bằng chứng bàn giao

1. Làm verdict load test cùng test phản ví dụ.
2. Làm parser metrics và kiểm tra identity cùng run.
3. Nâng grader chatbot và test phản ví dụ.
4. Chuẩn bị dataset kỹ thuật, formatter và unit test cô lập.
5. Viết tài liệu hướng dẫn, ghi lại các điểm cần tích hợp.

Với mỗi mục hoàn thành, Minh bàn giao:

- Danh sách file thay đổi và mã F liên quan.
- Lệnh test, kết quả thật và commit chứa thay đổi.
- Ví dụ đầu vào/đầu ra, gồm ít nhất một trường hợp FAIL/INVALID nếu là công cụ đánh giá.
- Những giới hạn chưa kiểm chứng và phần cần người khác ghép.

Các mục này không cần đợi ai để bắt đầu. Sau khi hoàn thành, chúng là đầu vào cho kiểm thử tích hợp và nghiệm thu chung; chưa tự động đóng toàn bộ mã F hoặc chứng minh hệ thống đã đạt yêu cầu.
