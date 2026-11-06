import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService, RetrievedDocument } from './rag/retrieval.service';
import {
  CHATBOT_SYSTEM_PROMPT,
  buildAugmentedUserMessage,
  checkHumanEscalationIntent,
  isFallbackResponse,
} from './rag/prompt-templates';
import { CHATBOT_TOOLS } from './tools/chatbot-tools.definition';
import {
  ChatbotToolsService,
  ToolExecutionContext,
} from './tools/chatbot-tools.service';
import { randomUUID } from 'crypto';

export interface SendMessageOptions {
  sessionToken?: string;
  message: string;
  userId?: string;
  role?: UserRole;
  dynamicContext?: string; // Tích hợp với dữ liệu động từ Internal API khi cần
}

// Bản ghi truy vết 1 lần gọi tool, lưu vào chat_messages.tool_calls
export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  error?: string;
}

export interface SendMessageResult {
  sessionToken: string;
  reply: string;
  role: 'ASSISTANT';
  isFallback: boolean;
  escalatedToHuman: boolean;
  retrievedDocuments: RetrievedDocument[];
  toolCalls: ToolCallRecord[];
  latencyMs: number;
  tokenUsage?: number;
}

interface GenerationResult {
  replyText: string;
  tokenUsage: number;
  toolCalls: ToolCallRecord[];
}

// Giới hạn số vòng tool-use mỗi câu hỏi để chống vòng lặp vô hạn / tốn token (CON-07)
const MAX_TOOL_ROUNDS = 3;

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private anthropicClient: Anthropic | null = null;
  private readonly defaultModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly toolsService: ChatbotToolsService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.defaultModel =
      process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

    if (apiKey && apiKey !== 'dummy_key' && !apiKey.startsWith('mock_')) {
      this.anthropicClient = new Anthropic({ apiKey });
      this.logger.log(
        `Khởi tạo Anthropic Claude SDK thành công (Model: ${this.defaultModel})`,
      );
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY chưa được cấu hình. Chatbot sẽ chạy ở chế độ mô phỏng/fallback dự phòng.',
      );
    }
  }

  /**
   * Khởi tạo hoặc tìm kiếm phiên hội thoại.
   * Phân quyền: chỉ được dùng lại session của chính mình. Session đã gắn với user khác
   * (hoặc gắn với user nhưng request là khách vãng lai) -> tạo session mới, không tái sử dụng.
   */
  async getOrCreateSession(sessionToken?: string, userId?: string) {
    if (sessionToken) {
      const existing = await this.prisma.chatSession.findUnique({
        where: { sessionToken },
      });
      if (existing) {
        if (!existing.userId) {
          // Khách vãng lai vừa đăng nhập -> gắn session vào tài khoản
          if (userId) {
            return await this.prisma.chatSession.update({
              where: { id: existing.id },
              data: { userId },
            });
          }
          return existing;
        }
        if (existing.userId === userId) {
          return existing;
        }
        this.logger.warn(
          'Bỏ qua sessionToken không thuộc người dùng hiện tại, tạo phiên mới.',
        );
      }
    }

    // Không nhận lại token do client gửi nếu token đó đã thuộc người khác
    return await this.prisma.chatSession.create({
      data: {
        sessionToken: `sess_${randomUUID()}`,
        userId: userId || null,
        messageCount: 0,
        escalatedToHuman: false,
      },
    });
  }

  /**
   * Xử lý luồng Chatbot hoàn chỉnh (Retrieval → Augmentation → Generation + Function Calling)
   */
  async processUserMessage(
    options: SendMessageOptions,
  ): Promise<SendMessageResult> {
    const startTime = Date.now();
    const session = await this.getOrCreateSession(
      options.sessionToken,
      options.userId,
    );
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
        toolCalls: [],
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

    const formattedHistory: Array<{
      role: 'user' | 'assistant';
      content: string;
    }> = [];
    for (const msg of recentMessages) {
      if (msg.role === 'USER') {
        formattedHistory.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'ASSISTANT') {
        formattedHistory.push({ role: 'assistant', content: msg.content });
      }
    }

    // 5. Bước AUGMENTATION: Định dạng context & xây dựng Prompt
    const formattedContext =
      this.retrievalService.formatContextForPrompt(retrievedDocs);
    const augmentedUserPrompt = buildAugmentedUserMessage({
      userQuery: userMessage,
      retrievedContext: formattedContext,
      dynamicContext: options.dynamicContext,
    });

    // Ngữ cảnh phân quyền cho tool: lấy từ JWT đã xác minh, KHÔNG từ nội dung chat
    const toolCtx: ToolExecutionContext = {
      userId: session.userId ?? undefined,
      role: session.userId ? options.role : undefined,
    };

    // 6. Bước GENERATION: Gọi LLM (Claude Haiku API) kèm function calling
    let replyText = '';
    let isFallback = false;
    let tokenUsage = 0;
    let toolCalls: ToolCallRecord[] = [];

    if (this.anthropicClient) {
      try {
        // Thêm history cũ ngoại trừ tin nhắn cuối (sẽ thay bằng augmented prompt)
        const claudeMessages: Anthropic.MessageParam[] = formattedHistory
          .slice(0, -1)
          .map((m) => ({ role: m.role, content: m.content }));
        claudeMessages.push({ role: 'user', content: augmentedUserPrompt });

        const generation = await this.generateWithTools(
          this.anthropicClient,
          claudeMessages,
          toolCtx,
        );
        replyText = generation.replyText;
        tokenUsage = generation.tokenUsage;
        toolCalls = generation.toolCalls;

        // Có dữ liệu động hợp lệ từ tool thì không coi là thiếu context
        const hasToolData = toolCalls.some((t) => t.ok);
        isFallback = hasToolData
          ? isFallbackResponse(replyText)
          : retrievedDocs.length === 0 ||
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

    if (!replyText.trim()) {
      replyText =
        'Dạ, em chưa có đủ thông tin để trả lời chính xác. Tôi sẽ kết nối bạn với chuyên viên tư vấn để được hỗ trợ chính xác nhất.';
      isFallback = true;
    }

    const latencyMs = Date.now() - startTime;

    // 7. Lưu tin nhắn của ASSISTANT vào CSDL kèm thông tin truy vết RAG + tool calls
    const savedAssistantMsg = await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'ASSISTANT',
        content: replyText,
        retrievedContext:
          retrievedDocs.length > 0
            ? (retrievedDocs as unknown as Prisma.InputJsonValue)
            : undefined,
        toolCalls:
          toolCalls.length > 0
            ? (toolCalls as unknown as Prisma.InputJsonValue)
            : undefined,
        isFallback,
        latencyMs,
        tokenUsage: tokenUsage > 0 ? tokenUsage : null,
      },
    });

    // Cập nhật session messageCount
    const shouldEscalate =
      isFallback &&
      session.escalatedToHuman === false &&
      isFallbackResponse(replyText);
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
      toolCalls,
      latencyMs,
      tokenUsage: tokenUsage > 0 ? tokenUsage : undefined,
    };
  }

  /**
   * Vòng lặp function calling với Claude:
   * gọi model -> nếu stop_reason = tool_use thì chạy tool (đã kiểm quyền) -> gửi tool_result -> lặp lại.
   */
  private async generateWithTools(
    client: Anthropic,
    messages: Anthropic.MessageParam[],
    ctx: ToolExecutionContext,
  ): Promise<GenerationResult> {
    const toolCalls: ToolCallRecord[] = [];
    let tokenUsage = 0;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // Vòng cuối không cho gọi tool nữa, buộc model trả lời bằng dữ liệu đã có
      const allowTools = round < MAX_TOOL_ROUNDS;
      const response = await client.messages.create({
        model: this.defaultModel,
        max_tokens: 1024,
        temperature: 0.1, // Nhiệt độ thấp hạn chế bịa đặt (NFR-04.4)
        system: CHATBOT_SYSTEM_PROMPT,
        messages,
        ...(allowTools ? { tools: CHATBOT_TOOLS } : {}),
      });

      tokenUsage +=
        (response.usage?.input_tokens ?? 0) +
        (response.usage?.output_tokens ?? 0);

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const replyText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return { replyText, tokenUsage, toolCalls };
      }

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const result = await this.toolsService.execute(
          use.name,
          use.input,
          ctx,
        );
        toolCalls.push({
          name: use.name,
          input: use.input,
          ok: result.ok,
          ...(result.ok ? {} : { error: result.error }),
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
          ...(result.ok ? {} : { is_error: true }),
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { replyText: '', tokenUsage, toolCalls };
  }

  /**
   * Lấy lịch sử tin nhắn của một phiên chat — chỉ chủ phiên mới xem được.
   * Phiên của khách vãng lai (userId = null) chỉ cần biết sessionToken.
   */
  async getSessionHistory(sessionToken: string, userId?: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { sessionToken },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session || !this.canAccessSession(session.userId, userId)) {
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
   * Đánh dấu chuyển phiên chat cho người thật thủ công — chỉ chủ phiên.
   */
  async escalateSession(
    sessionToken: string,
    userId?: string,
  ): Promise<boolean> {
    const session = await this.prisma.chatSession.findUnique({
      where: { sessionToken },
      select: { id: true, userId: true },
    });
    if (!session || !this.canAccessSession(session.userId, userId)) {
      return false;
    }
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { escalatedToHuman: true },
    });
    return true;
  }

  private canAccessSession(ownerId: string | null, userId?: string): boolean {
    return ownerId === null || ownerId === userId;
  }
}
