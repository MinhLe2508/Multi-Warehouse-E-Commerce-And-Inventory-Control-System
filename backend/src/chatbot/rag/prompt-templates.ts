/**
 * PromptTemplates cho AI Chatbot RAG
 * Đáp ứng nghiêm ngặt tiêu chuẩn NFR-04.4 (Chống bịa dữ liệu - Anti-Hallucination)
 * và FR-BOT-04 (Chuyển giao chuyên viên CSKH khi thiếu dữ liệu hoặc theo yêu cầu)
 */

export const CHATBOT_SYSTEM_PROMPT = `
Bạn là Trợ lý AI Chăm sóc Khách hàng chính thức của Hệ thống Thương mại Điện tử Đa Kho (Multi-Warehouse E-Commerce).
Nhiệm vụ của bạn là hỗ trợ khách hàng tra cứu chính sách, hướng dẫn mua sắm, theo dõi đơn hàng và giải đáp thắc mắc về sản phẩm/kho hàng.

=== NGUYÊN TẮC BẮT BUỘC (ANTI-HALLUCINATION - NFR-04.4) ===
1. TÍNH CHÂN THỰC TUYỆT ĐỐI (GROUNDEDNESS):
   - Bạn CHỈ ĐƯỢC PHÉP trả lời dựa trên thông tin thực tế được cung cấp trong phần [NGỮ CẢNH TRI THỨC] và [DỮ LIỆU ĐỘNG] đính kèm bên dưới.
   - TUYỆT ĐỐI KHÔNG tự bịa đặt, suy diễn, hoặc tạo ra bất kỳ thông tin nào sau đây:
     * Mã đơn hàng, trạng thái đơn hàng, ngày giao dự kiến không có trong dữ liệu.
     * Số lượng tồn kho, tên kho, địa chỉ kho, chính sách giá không được ghi nhận.
     * Các chính sách hoàn tiền, đổi trả, bảo hành khác với quy định được cung cấp.

2. QUY TẮC XỬ LÝ KHI THIẾU THÔNG TIN (FALLBACK RULE - NFR-04.4 & FR-BOT-04):
   - Nếu câu hỏi của khách hàng KHÔNG THỂ trả lời được dựa trên [NGỮ CẢNH TRI THỨC] được cung cấp, hoặc độ tương đồng quá thấp:
     * Bạn PHẢI thẳng thắn thừa nhận hiện chưa có đủ thông tin cụ thể về vấn đề này.
     * TUYỆT ĐỐI KHÔNG đoán mò hoặc trả lời chung chung mang tính khẳng định.
     * Luôn hướng dẫn khách hàng liên hệ chuyên viên CSKH hoặc cung cấp câu phản hồi chứa từ khóa chuyển tiếp: "Tôi sẽ kết nối bạn với chuyên viên tư vấn để được hỗ trợ chính xác nhất."

3. YÊU CẦU GẶP NGƯỜI THẬT (ESCALATION RULE - FR-BOT-04):
   - Khi khách hàng dùng các từ khóa yêu cầu gặp người thật (ví dụ: "gặp nhân viên", "gặp người thật", "gặp tư vấn viên", "chuyển máy", "liên hệ tổng đài viên", "chăm sóc khách hàng", "cần người hỗ trợ"):
     * Ngay lập tức phản hồi lịch sự xác nhận kết nối: "Dạ, em đã ghi nhận yêu cầu của quý khách. Em đang kết nối bạn với chuyên viên tư vấn của hệ thống. Quý khách vui lòng đợi trong giây lát ạ!"

4. PHONG CÁCH GIAO TIẾP:
   - Thân thiện, lịch sự, chuyên nghiệp, xưng hô "em" hoặc "Trợ lý ảo" và gọi khách là "quý khách" hoặc "bạn".
   - Ngắn gọn, súc tích, đi thẳng vào trọng tâm câu hỏi.
`.trim();

export interface BuildPromptInput {
  userQuery: string;
  retrievedContext: string;
  dynamicContext?: string; // Dữ liệu đơn hàng hoặc tồn kho động (nếu có)
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Xây dựng user message hoàn chỉnh bao gồm ngữ cảnh tri thức và câu hỏi
 */
export function buildAugmentedUserMessage(input: BuildPromptInput): string {
  const parts: string[] = [];

  parts.push('=== [NGỮ CẢNH TRI THỨC TRUY XUẤT TỪ HỆ THỐNG] ===');
  parts.push(input.retrievedContext || 'Không có tài liệu tri thức nào khớp.');

  if (input.dynamicContext) {
    parts.push('\n=== [DỮ LIỆU ĐỘNG THỰC TẾ (ĐƠN HÀNG / TỒN KHO)] ===');
    parts.push(input.dynamicContext);
  }

  parts.push('\n=== [CÂU HỎI CỦA KHÁCH HÀNG] ===');
  parts.push(input.userQuery);

  parts.push(
    '\n(Nhắc nhở: Trả lời chỉ dựa vào ngữ cảnh trên. Nếu không đủ dữ liệu, hãy từ chối và đề nghị kết nối chuyên viên tư vấn theo NFR-04.4)',
  );

  return parts.join('\n');
}

/**
 * Các cụm từ người dùng yêu cầu chuyển gặp nhân viên (Human Escalation)
 */
export const HUMAN_ESCALATION_KEYWORDS = [
  'gặp nhân viên',
  'gặp người thật',
  'gặp tư vấn viên',
  'nói chuyện với người',
  'chuyển máy',
  'liên hệ hotline',
  'gọi tổng đài',
  'gặp cskh',
  'chăm sóc khách hàng',
  'hỗ trợ viên',
  'nhân viên hỗ trợ',
  'người hỗ trợ',
  'tư vấn viên',
  'tổng đài viên',
  'agent',
  'human support',
  'real person',
];

/**
 * Kiểm tra xem người dùng có yêu cầu gặp người thật không
 */
export function checkHumanEscalationIntent(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return HUMAN_ESCALATION_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Kiểm tra xem câu trả lời của AI có mang nội dung fallback / không biết / đề nghị gặp CSKH không
 */
export function isFallbackResponse(responseText: string): boolean {
  const normalized = responseText.toLowerCase();
  const fallbackSignatures = [
    'chuyên viên tư vấn',
    'chưa có thông tin',
    'không tìm thấy thông tin',
    'kết nối bạn với chuyên viên',
    'liên hệ bộ phận cskh',
    'chưa được cập nhật trong hệ thống',
  ];

  return fallbackSignatures.some((sig) => normalized.includes(sig));
}
