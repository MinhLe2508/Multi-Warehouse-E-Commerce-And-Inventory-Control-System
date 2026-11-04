import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService, RetrievedDocument } from './rag/retrieval.service';
import {
  CHATBOT_SYSTEM_PROMPT,
  buildAugmentedUserMessage,
  checkHumanEscalationIntent,
  isFallbackResponse,
} from './rag/prompt-templates';
import { randomUUID } from 'crypto';

export interface SendMessageOptions {
  sessionToken?: string;
  message: string;
  userId?: string;
  dynamicContext?: string; // Tích hợp với dữ liệu động từ Internal API khi cần
}

export interface SendMessageResult {
  sessionToken: string;
  reply: string;
  role: 'ASSISTANT';
  isFallback: boolean;
  escalatedToHuman: boolean;
  retrievedDocuments: RetrievedDocument[];
  latencyMs: number;
  tokenUsage?: number;
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private anthropicClient: Anthropic | null = null;
  private readonly defaultModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.defaultModel =
      process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

    if (apiKey && apiKey !== 'dummy_key' && !apiKey.startsWith('mock_')) {
      this.anthropicClient = new Anthropic({ apiKey });
      this.logger.log(`Khởi tạo Anthropic Claude SDK thành công (Model: ${this.defaultModel})`);
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY chưa được cấu hình. Chatbot sẽ chạy ở chế độ mô phỏng/fallback dự phòng.',
      );
    }
  }

  /**
   * Khởi tạo hoặc tìm kiếm phiên hội thoại
   */
  async getOrCreateSession(sessionToken?: string, userId?: string) {
    if (sessionToken) {
      const existing = await this.prisma.chatSession.findUnique({
        where: { sessionToken },
      });
      if (existing) {
        // Nếu user vừa đăng nhập mà session chưa gán userId thì cập nhật
        if (userId && !existing.userId) {
          return await this.prisma.chatSession.update({
            where: { id: existing.id },
            data: { userId },
          });
        }
        return existing;
      }
    }

    // Tạo phiên chat mới
    const token = sessionToken || `sess_${randomUUID()}`;
    return await this.prisma.chatSession.create({
      data: {
        sessionToken: token,
        userId: userId || null,
        messageCount: 0,
        escalatedToHuman: false,
      },
    });
  }

  /**
   * Xử lý luồng Chatbot hoàn chỉnh (Retrieval → Augmentation → Generation)
   */
  async processUserMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const startTime = Date.now();
    const session = await this.getOrCreateSession(options.sessionToken, options.userId);
    const userMessage = options.message.trim();

    // 1. Lưu tin nhắn của USER vào CSDL
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'USER',
        content: userMessage,
      },
    });

    // 2. Kiểm tra ý định kết nối người thật (FR-BOT-04)
    const wantsHuman = checkHumanEscalationIntent(userMessage);
    if (wantsHuman) {
      const escalationReply =
        'Dạ, em đã ghi nhận yêu cầu của quý khách. Em đang kết nối bạn với chuyên viên tư vấn của hệ thống. Quý khách vui lòng đợi trong giây lát ạ!';

      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: {
          escalatedToHuman: true,
          messageCount: { increment: 2 },
        },
      });

      const latencyMs = Date.now() - startTime;
      await this.prisma.chatMessage.create({
        data: {
          sessionId: session.id,
          role: 'ASSISTANT',
          content: escalationReply,
          isFallback: false,
          latencyMs,
        },
      });

      return {
        sessionToken: session.sessionToken,
        reply: escalationReply,
        role: 'ASSISTANT',
        isFallback: false,
        escalatedToHuman: true,
        retrievedDocuments: [],
        latencyMs,
      };
    }

    // 3. Bước RETRIEVAL: Tìm kiếm tri thức trong Knowledge Base (pgvector)
    const retrievalResult = await this.retrievalService.searchKnowledgeBase(
      userMessage,
      { limit: 4, minSimilarity: 0.65 },
    );
    const retrievedDocs = retrievalResult.documents;

    // 4. Lấy lịch sử hội thoại gần nhất (tối đa 6 tin nhắn trước)
    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    recentMessages.reverse();

    const formattedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of recentMessages) {
      if (msg.role === 'USER') {
        formattedHistory.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'ASSISTANT') {
        formattedHistory.push({ role: 'assistant', content: msg.content });
      }
    }

    // 5. Bước AUGMENTATION: Định dạng context & xây dựng Prompt
    const formattedContext = this.retrievalService.formatContextForPrompt(retrievedDocs);
    const augmentedUserPrompt = buildAugmentedUserMessage({
      userQuery: userMessage,
      retrievedContext: formattedContext,
      dynamicContext: options.dynamicContext,
    });

    // 6. Bước GENERATION: Gọi LLM (Claude Haiku API)
    let replyText = '';
    let isFallback = false;
    let tokenUsage = 0;

    if (this.anthropicClient) {
      try {
        // Chuẩn bị tin nhắn cho Claude
        const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        // Thêm history cũ ngoại trừ tin nhắn cuối cùng (vì tin nhắn cuối cùng sẽ thay bằng augmented prompt)
        for (let i = 0; i < formattedHistory.length - 1; i++) {
          claudeMessages.push(formattedHistory[i]);
        }
        claudeMessages.push({ role: 'user', content: augmentedUserPrompt });

        const response = await this.anthropicClient.messages.create({
          model: this.defaultModel,
          max_tokens: 1024,
          temperature: 0.1, // Nhiệt độ thấp hạn chế bịa đặt (NFR-04.4)
          system: CHATBOT_SYSTEM_PROMPT,
          messages: claudeMessages,
        });

        const firstBlock = response.content[0];
        replyText = firstBlock.type === 'text' ? firstBlock.text : '';
        tokenUsage =
          (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

        // Kiểm tra xem LLM có báo không có dữ liệu / fallback không
        isFallback =
          retrievedDocs.length === 0 ||
          !retrievalResult.hasHighConfidence ||
          isFallbackResponse(replyText);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Lỗi khi gọi Anthropic Claude API: ${errorMsg}`);
        replyText =
          'Dạ, hiện tại hệ thống AI đang tạm thời gián đoạn. Tôi sẽ kết nối bạn với chuyên viên tư vấn để hỗ trợ trực tiếp ngay nhé!';
        isFallback = true;
      }
    } else {
      // Chế độ mô phỏng khi chưa gắn key
      if (retrievedDocs.length > 0) {
        replyText = `Dạ, theo chính sách của hệ thống: ${retrievedDocs[0].content}`;
        isFallback = false;
      } else {
        replyText =
          'Dạ, hiện em chưa tìm thấy thông tin chính xác cho câu hỏi này trong hệ thống. Tôi sẽ kết nối bạn với chuyên viên tư vấn để hỗ trợ ngay ạ!';
        isFallback = true;
      }
    }

    const latencyMs = Date.now() - startTime;

    // 7. Lưu tin nhắn của ASSISTANT vào CSDL kèm theo thông tin truy vết RAG
    const savedAssistantMsg = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: replyText,
        retrievedContext: retrievedDocs.length > 0 ? (retrievedDocs as unknown as object) : undefined,
        isFallback,
        latencyMs,
        tokenUsage: tokenUsage > 0 ? tokenUsage : null,
      },
    });

    // Cập nhật session messageCount
    const shouldEscalate = isFallback && session.escalatedToHuman === false && isFallbackResponse(replyText);
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: {
        messageCount: { increment: 2 },
        escalatedToHuman: shouldEscalate ? true : undefined,
      },
    });

    return {
      sessionToken: session.sessionToken,
      reply: savedAssistantMsg.content,
      role: 'ASSISTANT',
      isFallback,
      escalatedToHuman: shouldEscalate || session.escalatedToHuman,
      retrievedDocuments: retrievedDocs,
      latencyMs,
      tokenUsage: tokenUsage > 0 ? tokenUsage : undefined,
    };
  }

  /**
   * Lấy lịch sử tin nhắn của một phiên chat
   */
  async getSessionHistory(sessionToken: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { sessionToken },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return null;
    }

    return {
      sessionToken: session.sessionToken,
      escalatedToHuman: session.escalatedToHuman,
      messageCount: session.messageCount,
      startedAt: session.startedAt,
      messages: session.messages.map((m) => ({
        id: m.id.toString(),
        role: m.role,
        content: m.content,
        isFallback: m.isFallback,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Đánh dấu chuyển phiên chat cho người thật thủ công
   */
  async escalateSession(sessionToken: string) {
    return await this.prisma.chatSession.update({
      where: { sessionToken },
      data: { escalatedToHuman: true },
    });
  }
}

