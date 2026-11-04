import { Test, TestingModule } from '@nestjs/testing';
import { ChatbotService } from './chatbot.service';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService } from './rag/retrieval.service';

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

  beforeEach(async () => {
    prisma = {
      chatSession: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      chatMessage: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    retrievalService = {
      searchKnowledgeBase: jest.fn(),
      formatContextForPrompt: jest.fn().mockReturnValue('Mock context'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: PrismaService, useValue: prisma },
        { provide: RetrievalService, useValue: retrievalService },
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
      messageCount: 2,
    });
    prisma.chatMessage.create.mockResolvedValue({
      id: BigInt(1),
      content: 'Escalation response',
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
    // Không cần gọi retrieval khi đã chắc chắn chuyển giao
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
    prisma.chatMessage.create.mockImplementation((args) =>
      Promise.resolve({ id: BigInt(2), ...args.data }),
    );

    // Không tìm thấy tài liệu phù hợp trong KB
    retrievalService.searchKnowledgeBase.mockResolvedValue({
      query: 'Kho có bán xe tăng không?',
      documents: [],
      hasHighConfidence: false,
    });

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
});

