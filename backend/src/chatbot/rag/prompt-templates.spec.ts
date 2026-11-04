import {
  CHATBOT_SYSTEM_PROMPT,
  buildAugmentedUserMessage,
  checkHumanEscalationIntent,
  isFallbackResponse,
} from './prompt-templates';

describe('prompt-templates', () => {
  describe('checkHumanEscalationIntent (FR-BOT-04)', () => {
    it('nhận diện đúng các câu hỏi yêu cầu gặp người thật / tư vấn viên', () => {
      expect(checkHumanEscalationIntent('Tôi muốn gặp nhân viên tư vấn')).toBe(true);
      expect(checkHumanEscalationIntent('cho tôi gặp người thật đi')).toBe(true);
      expect(checkHumanEscalationIntent('Chuyển máy cho cskh')).toBe(true);
      expect(checkHumanEscalationIntent('i want human support please')).toBe(true);
      expect(checkHumanEscalationIntent('cần người hỗ trợ giải quyết')).toBe(true);
    });

    it('không nhận nhầm các câu hỏi thông thường', () => {
      expect(checkHumanEscalationIntent('Chính sách đổi trả sản phẩm thế nào?')).toBe(false);
      expect(checkHumanEscalationIntent('Phí ship từ kho Hà Nội vào Sài Gòn là bao nhiêu?')).toBe(false);
      expect(checkHumanEscalationIntent('Sản phẩm này còn hàng không?')).toBe(false);
    });
  });

  describe('isFallbackResponse (NFR-04.4)', () => {
    it('nhận diện đúng các câu trả lời mang tính fallback khi thiếu dữ liệu', () => {
      expect(
        isFallbackResponse(
          'Dạ hiện tại hệ thống chưa có thông tin về mặt hàng này. Tôi sẽ kết nối bạn với chuyên viên tư vấn.',
        ),
      ).toBe(true);

      expect(
        isFallbackResponse(
          'Dạ thông tin đơn hàng này chưa được cập nhật trong hệ thống.',
        ),
      ).toBe(true);
    });

    it('không đánh dấu nhầm câu trả lời đã có đầy đủ dữ liệu', () => {
      expect(
        isFallbackResponse(
          'Sản phẩm Chuột Gaming Logitech G102 hiện đang còn 15 chiếc tại kho Hà Nội với giá 350.000đ.',
        ),
      ).toBe(false);
    });
  });

  describe('buildAugmentedUserMessage', () => {
    it('tổng hợp đúng cấu trúc bao gồm ngữ cảnh tri thức và câu hỏi người dùng', () => {
      const prompt = buildAugmentedUserMessage({
        userQuery: 'Chính sách bảo hành ra sao?',
        retrievedContext: '[Tài liệu 1: Chính sách bảo hành]\nBảo hành 12 tháng.',
      });

      expect(prompt).toContain('=== [NGỮ CẢNH TRI THỨC TRUY XUẤT TỪ HỆ THỐNG] ===');
      expect(prompt).toContain('Bảo hành 12 tháng.');
      expect(prompt).toContain('=== [CÂU HỎI CỦA KHÁCH HÀNG] ===');
      expect(prompt).toContain('Chính sách bảo hành ra sao?');
      expect(prompt).toContain('NFR-04.4');
    });
  });

  describe('CHATBOT_SYSTEM_PROMPT', () => {
    it('chứa các chỉ thị nghiêm ngặt chống bịa đặt dữ liệu (NFR-04.4) và chuyển giao (FR-BOT-04)', () => {
      expect(CHATBOT_SYSTEM_PROMPT).toContain('ANTI-HALLUCINATION');
      expect(CHATBOT_SYSTEM_PROMPT).toContain('NFR-04.4');
      expect(CHATBOT_SYSTEM_PROMPT).toContain('FR-BOT-04');
      expect(CHATBOT_SYSTEM_PROMPT).toContain('TUYỆT ĐỐI KHÔNG tự bịa đặt');
    });
  });
});

