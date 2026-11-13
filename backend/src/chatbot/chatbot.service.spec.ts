import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from './rag/retrieval.service';
import { ChatbotToolsService } from './tools/chatbot-tools.service';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

describe('ChatbotService', () => {
  let service: ChatbotService;
  let prisma: {
    chatSession: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    chatMessage: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let retrievalService: {
    searchKnowledgeBase: jest.Mock;
    formatContextForPrompt: jest.Mock;
  };
  let toolsService: { execute: jest.Mock };

  beforeEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;

    prisma = {
      chatSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        create: jest
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: BigInt(1), ...args.data }),
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    retrievalService = {
      searchKnowledgeBase: jest.fn().mockResolvedValue({
        query: 'q',
        documents: [],
        hasHighConfidence: false,
      }),
      formatContextForPrompt: jest.fn().mockReturnValue('Mock context'),
    };

    toolsService = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: PrismaService, useValue: prisma },
        { provide: RetrievalService, useValue: retrievalService },
        { provide: ChatbotToolsService, useValue: toolsService },
      ],
    }).compile();

    service = module.get<ChatbotService>(ChatbotService);
  });

  it('xử lý chuyển giao nhân viên tư vấn ngay khi phát hiện yêu cầu người thật (FR-BOT-04)', async () => {
    const mockSession = {
      id: 'sess-uuid-1',
      sessionToken: 'test_token_123',
      userId: null,
      escalatedToHuman: false,
      messageCount: 0,
    };

    prisma.chatSession.findUnique.mockResolvedValue(mockSession);
    prisma.chatSession.update.mockResolvedValue({
      ...mockSession,
      escalatedToHuman: true,
    });

    const result = await service.processUserMessage({
      sessionToken: 'test_token_123',
      message: 'Tôi muốn gặp nhân viên chăm sóc khách hàng',
    });

    expect(result.escalatedToHuman).toBe(true);
    expect(result.reply).toContain('kết nối bạn với chuyên viên tư vấn');
    expect(prisma.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ escalatedToHuman: true }),
      }),
    );
    expect(retrievalService.searchKnowledgeBase).not.toHaveBeenCalled();
  });

  it('thực hiện luồng RAG và trả lời dự phòng (fallback) nếu không có tri thức khớp (NFR-04.4)', async () => {
    const mockSession = {
      id: 'sess-uuid-2',
      sessionToken: 'test_token_456',
      userId: null,
      escalatedToHuman: false,
      messageCount: 0,
    };
    prisma.chatSession.findUnique.mockResolvedValue(mockSession);
    prisma.chatSession.update.mockResolvedValue(mockSession);

    const result = await service.processUserMessage({
      sessionToken: 'test_token_456',
      message: 'Kho có bán xe tăng không?',
    });

    expect(result.isFallback).toBe(true);
    expect(result.reply).toContain('chưa tìm thấy thông tin');
    expect(retrievalService.searchKnowledgeBase).toHaveBeenCalledWith(
      'Kho có bán xe tăng không?',
      expect.any(Object),
    );
  });

  describe('Phân quyền phiên chat', () => {
    it('không tái sử dụng sessionToken thuộc về người dùng khác', async () => {
      prisma.chatSession.findUnique.mockResolvedValue({
        id: 'sess-of-b',
        sessionToken: 'token_of_b',
        userId: USER_B,
      });
      prisma.chatSession.create.mockResolvedValue({
        id: 'new',
        sessionToken: 'sess_new',
        userId: USER_A,
      });

      const session = await service.getOrCreateSession('token_of_b', USER_A);

      expect(session.id).toBe('new');
      expect(prisma.chatSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: USER_A }),
      });
      // Token mới do server sinh, không nhận lại token của client
      const created = prisma.chatSession.create.mock.calls[0][0].data;
      expect(created.sessionToken).not.toBe('token_of_b');
    });

    it('getSessionHistory trả null nếu không phải chủ phiên', async () => {
      prisma.chatSession.findUnique.mockResolvedValue({
        sessionToken: 't',
        userId: USER_B,
        messages: [],
      });
      await expect(service.getSessionHistory('t', USER_A)).resolves.toBeNull();
      await expect(
        service.getSessionHistory('t', undefined),
      ).resolves.toBeNull();
    });

    it('escalateSession từ chối khi không phải chủ phiên', async () => {
      prisma.chatSession.findUnique.mockResolvedValue({
        id: 's',
        userId: USER_B,
      });
      await expect(service.escalateSession('t', USER_A)).resolves.toBe(false);
      expect(prisma.chatSession.update).not.toHaveBeenCalled();
    });
  });

  describe('Function calling (STT 27)', () => {
    function attachFakeClaude(responses: unknown[]) {
      const create = jest.fn();
      for (const r of responses) create.mockResolvedValueOnce(r);
      (service as unknown as { anthropicClient: unknown }).anthropicClient = {
        messages: { create },
      };
      return create;
    }

    it('chạy tool lookupOrder với userId/role lấy từ phiên đã xác thực, không từ LLM', async () => {
      const session = {
        id: 'sess-a',
        sessionToken: 'tok-a',
        userId: USER_A,
        escalatedToHuman: false,
      };
      prisma.chatSession.findUnique.mockResolvedValue(session);
      prisma.chatSession.update.mockResolvedValue(session);
      toolsService.execute.mockResolvedValue({
        ok: true,
        data: {
          orders: [
            { orderCode: 'ORD-AAAA1111', statusLabel: 'Đang giao hàng' },
          ],
        },
      });

      const create = attachFakeClaude([
        {
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 20 },
          content: [
            {
              type: 'tool_use',
              id: 'tu_1',
              name: 'lookupOrder',
              input: { userId: USER_B },
            },
          ],
        },
        {
          stop_reason: 'end_turn',
          usage: { input_tokens: 150, output_tokens: 30 },
          content: [
            { type: 'text', text: 'Đơn ORD-AAAA1111 của bạn đang giao hàng.' },
          ],
        },
      ]);

      const result = await service.processUserMessage({
        sessionToken: 'tok-a',
        message: 'Đơn hàng của tôi tới đâu rồi?',
        userId: USER_A,
        role: UserRole.CUSTOMER,
      });

      expect(toolsService.execute).toHaveBeenCalledWith(
        'lookupOrder',
        { userId: USER_B },
        { userId: USER_A, role: UserRole.CUSTOMER },
      );
      expect(result.reply).toContain('ORD-AAAA1111');
      expect(result.isFallback).toBe(false);
      expect(result.tokenUsage).toBe(300);
      expect(result.toolCalls).toEqual([
        { name: 'lookupOrder', input: { userId: USER_B }, ok: true },
      ]);

      // Lần gọi thứ 2 phải mang tool_result gửi lại cho Claude
      const secondMessages = create.mock.calls[1][0].messages;
      const last = secondMessages[secondMessages.length - 1];
      expect(last.role).toBe('user');
      expect(last.content[0]).toMatchObject({
        type: 'tool_result',
        tool_use_id: 'tu_1',
      });

      // tool_calls được lưu vào chat_messages
      const assistantSave = prisma.chatMessage.create.mock.calls.find(
        (c: Array<{ data: { role: string } }>) =>
          c[0].data.role === 'ASSISTANT',
      );
      expect(assistantSave[0].data.toolCalls).toHaveLength(1);
    });

    it('khách vãng lai: tool nhận ctx rỗng (không có userId) dù LLM yêu cầu tra đơn', async () => {
      const session = {
        id: 's',
        sessionToken: 'g',
        userId: null,
        escalatedToHuman: false,
      };
      prisma.chatSession.findUnique.mockResolvedValue(session);
      prisma.chatSession.update.mockResolvedValue(session);
      toolsService.execute.mockResolvedValue({
        ok: false,
        error: 'AUTH_REQUIRED',
        message: '',
      });

      attachFakeClaude([
        {
          stop_reason: 'tool_use',
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'lookupOrder', input: {} },
          ],
        },
        {
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [
            {
              type: 'text',
              text: 'Bạn vui lòng đăng nhập để tra cứu đơn hàng.',
            },
          ],
        },
      ]);

      const result = await service.processUserMessage({
        sessionToken: 'g',
        message: 'Đơn của tôi đâu?',
        role: UserRole.ADMIN, // role không có userId đi kèm -> phải bị bỏ qua
      });

      expect(toolsService.execute).toHaveBeenCalledWith(
        'lookupOrder',
        {},
        {
          userId: undefined,
          role: undefined,
        },
      );
      expect(result.toolCalls[0]).toMatchObject({
        ok: false,
        error: 'AUTH_REQUIRED',
      });
    });

    it('giới hạn số vòng tool-use, vòng cuối không gửi tools', async () => {
      const session = {
        id: 's',
        sessionToken: 'a',
        userId: USER_A,
        escalatedToHuman: false,
      };
      prisma.chatSession.findUnique.mockResolvedValue(session);
      prisma.chatSession.update.mockResolvedValue(session);
      toolsService.execute.mockResolvedValue({ ok: true, data: {} });

      const toolTurn = {
        stop_reason: 'tool_use',
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          {
            type: 'tool_use',
            id: 'x',
            name: 'checkInventory',
            input: { keyword: 'a' },
          },
        ],
      };
      const create = attachFakeClaude([
        toolTurn,
        toolTurn,
        toolTurn,
        {
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
          content: [{ type: 'text', text: 'Còn hàng.' }],
        },
      ]);

      await service.processUserMessage({
        sessionToken: 'a',
        message: 'còn hàng không',
        userId: USER_A,
      });

      expect(create).toHaveBeenCalledTimes(4);
      expect(create.mock.calls[3][0].tools).toBeUndefined();
      expect(create.mock.calls[0][0].tools).toBeDefined();
    });
  });
});
