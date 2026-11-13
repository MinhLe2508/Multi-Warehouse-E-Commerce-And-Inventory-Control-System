// =============================================================================
// ChatbotToolsDefinition (STT 27): khai báo các "function" cho Claude gọi (tool use).
//
// NGUYÊN TẮC PHÂN QUYỀN (quan trọng nhất của STT 27):
// - lookupOrder(userId): userId KHÔNG phải tham số do LLM truyền vào.
//   userId luôn lấy từ JWT đã được server xác minh (ToolExecutionContext),
//   nên dù người dùng có "prompt injection" kiểu "tra đơn của user X" thì
//   tool vẫn chỉ trả về đơn của chính người đang hỏi.
// - checkInventory(productId): dữ liệu tồn kho công khai một phần.
//   Khách/khách vãng lai chỉ thấy tình trạng còn hàng tổng hợp,
//   ADMIN/WAREHOUSE_STAFF mới thấy số liệu chi tiết từng kho.
//
// Mọi input từ LLM được coi là KHÔNG tin cậy -> validate lại ở ChatbotToolsService.
// =============================================================================

import type Anthropic from '@anthropic-ai/sdk';

export const TOOL_LOOKUP_ORDER = 'lookupOrder';
export const TOOL_CHECK_INVENTORY = 'checkInventory';
export const TOOL_BROWSE_CATEGORY = 'browseCategory';

export type ChatbotToolName =
  | typeof TOOL_LOOKUP_ORDER
  | typeof TOOL_CHECK_INVENTORY
  | typeof TOOL_BROWSE_CATEGORY;

export const CHATBOT_TOOL_NAMES: readonly ChatbotToolName[] = [
  TOOL_LOOKUP_ORDER,
  TOOL_CHECK_INVENTORY,
  TOOL_BROWSE_CATEGORY,
];

// Số đơn tối đa trả về một lần, tránh đổ quá nhiều token vào prompt (CON-07).
export const LOOKUP_ORDER_MAX_LIMIT = 5;

export const CHATBOT_TOOLS: Anthropic.Tool[] = [
  {
    name: TOOL_LOOKUP_ORDER,
    description:
      'Tra cứu đơn hàng CỦA CHÍNH người dùng đang chat (người dùng được hệ thống xác định qua đăng nhập, ' +
      'bạn KHÔNG cần và KHÔNG được truyền userId). Dùng khi khách hỏi về trạng thái đơn, đơn gần đây, ' +
      'tổng tiền hoặc sản phẩm trong đơn. Nếu khách nêu mã đơn (dạng "ORD-" + 20 ký tự chữ/số, ví dụ "ORD-1A2B3C4D5E6F7A8B9C0D") thì truyền orderCode. ' +
      'Nếu kết quả trả về error=AUTH_REQUIRED thì hãy đề nghị khách đăng nhập; nếu NOT_FOUND thì nói không tìm thấy đơn, ' +
      'tuyệt đối không tự bịa thông tin đơn hàng.',
    input_schema: {
      type: 'object',
      properties: {
        orderCode: {
          type: 'string',
          description: 'Mã đơn hàng khách cung cấp (không bắt buộc).',
        },
        limit: {
          type: 'integer',
          description: `Số đơn gần nhất cần lấy khi không có orderCode (1-${LOOKUP_ORDER_MAX_LIMIT}, mặc định 3).`,
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_CHECK_INVENTORY,
    description:
      'Kiểm tra tình trạng tồn kho thực tế của MỘT sản phẩm trên các kho. ' +
      'Truyền productId (UUID) nếu đã biết; nếu chỉ biết tên hoặc mã SKU thì truyền keyword. ' +
      'Chỉ được trả lời số lượng/tình trạng đúng như kết quả tool trả về, không được tự suy đoán.',
    input_schema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'UUID của sản phẩm.',
        },
        keyword: {
          type: 'string',
          description: 'Tên hoặc SKU sản phẩm (dùng khi không có productId).',
        },
      },
      required: [],
    },
  },
  {
    name: TOOL_BROWSE_CATEGORY,
    description:
      'Tra cứu danh sách các mặt hàng/sản phẩm đang bán theo Danh mục sản phẩm (Category), KHO HÀNG, hoặc LỌC THEO KHOẢNG GIÁ. ' +
      'Ví dụ: "Thiết bị đeo thông minh", "kho TP.HCM còn những mặt hàng nào", "kho Hà Nội còn gì", "sản phẩm có giá dưới 20 triệu", "laptop dưới 15tr", "tai nghe từ 500k đến 2 triệu". ' +
      'Hỗ trợ kết hợp: categoryName, warehouse (tên kho/khu vực: TP.HCM, Hà Nội, Đà Nẵng, Miền Bắc, Miền Trung, Miền Nam), minPrice, maxPrice.',
    input_schema: {
      type: 'object',
      properties: {
        categoryName: {
          type: 'string',
          description:
            'Tên hoặc từ khóa danh mục (ví dụ: "thiết bị đeo thông minh", "điện thoại", "âm thanh", "laptop", "phụ kiện").',
        },
        warehouse: {
          type: 'string',
          description:
            'Tên kho hoặc khu vực cần tra cứu tồn kho (ví dụ: "TP.HCM", "Hà Nội", "Đà Nẵng", "Miền Bắc", "Miền Trung", "Miền Nam").',
        },
        minPrice: {
          type: 'number',
          description:
            'Giá tối thiểu tính bằng VND (ví dụ: 5000000 cho 5 triệu).',
        },
        maxPrice: {
          type: 'number',
          description:
            'Giá tối đa tính bằng VND (ví dụ: 20000000 cho 20 triệu).',
        },
        limit: {
          type: 'integer',
          description: 'Số lượng sản phẩm tối đa cần lấy (1-10, mặc định 5).',
        },
      },
      required: [],
    },
  },
];
