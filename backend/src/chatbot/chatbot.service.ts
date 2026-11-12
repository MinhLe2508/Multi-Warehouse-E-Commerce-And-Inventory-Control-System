import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import {
  GoogleGenAI,
  Type,
  type GenerateContentConfig,
  type Tool as GeminiTool,
  type Content as GeminiContent,
  type Part as GeminiPart,
} from '@google/genai';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RetrievalService, RetrievedDocument } from './rag/retrieval.service';
import {
  CHATBOT_SYSTEM_PROMPT,
  buildAugmentedUserMessage,
  checkHumanEscalationIntent,
  isFallbackResponse,
} from './rag/prompt-templates';
import {
  CHATBOT_TOOLS,
  TOOL_LOOKUP_ORDER,
  TOOL_CHECK_INVENTORY,
  TOOL_BROWSE_CATEGORY,
} from './tools/chatbot-tools.definition';
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
  private geminiClient: GoogleGenAI | null = null;
  private readonly defaultModel: string;
  private defaultGeminiModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrievalService: RetrievalService,
    private readonly toolsService: ChatbotToolsService,
  ) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const geminiKey = (
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    )?.trim();

    this.defaultModel =
      process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';
    this.defaultGeminiModel = process.env.GEMINI_MODEL || 'gemini-flash-latest';

    if (
      anthropicKey &&
      anthropicKey.startsWith('sk-ant-') &&
      !anthropicKey.startsWith('mock_')
    ) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      this.logger.log(
        `Khởi tạo Anthropic Claude SDK thành công (Model: ${this.defaultModel})`,
      );
    }

    if (
      geminiKey &&
      geminiKey.startsWith('AIza') &&
      !geminiKey.startsWith('mock_')
    ) {
      this.geminiClient = new GoogleGenAI({ apiKey: geminiKey });
      this.logger.log(
        `Khởi tạo Google Gemini SDK thành công (Model: ${this.defaultGeminiModel})`,
      );
    }

    if (!this.anthropicClient && !this.geminiClient) {
      this.logger.log(
        'Khởi tạo Bộ xử lý RAG (Voyage AI + pgvector) & Function Calling nội bộ thành công.',
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
      { limit: 4, minSimilarity: 0.45 },
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

    // 6. Bước GENERATION: Gọi LLM (Anthropic Claude hoặc Google Gemini)
    let replyText = '';
    let isFallback = false;
    let tokenUsage = 0;
    let toolCalls: ToolCallRecord[] = [];

    if (this.anthropicClient) {
      try {
        const claudeMessages: Anthropic.MessageParam[] = formattedHistory
          .slice(0, -1)
          .map((m) => ({ role: m.role, content: m.content }));
        claudeMessages.push({ role: 'user', content: augmentedUserPrompt });

        const generation = await this.generateWithClaudeTools(
          this.anthropicClient,
          claudeMessages,
          toolCtx,
        );
        replyText = generation.replyText;
        tokenUsage = generation.tokenUsage;
        toolCalls = generation.toolCalls;

        const hasToolData = toolCalls.some((t) => t.ok);
        isFallback = hasToolData
          ? isFallbackResponse(replyText)
          : retrievedDocs.length === 0 ||
            !retrievalResult.hasHighConfidence ||
            isFallbackResponse(replyText);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Anthropic Claude API tạm thời không phản hồi (${errorMsg}), chuyển sang bộ xử lý RAG + Tool nội bộ.`,
        );
        const localGen = await this.generateSmartLocalResponse(
          userMessage,
          retrievedDocs,
          toolCtx,
        );
        replyText = localGen.replyText;
        isFallback = localGen.isFallback;
        toolCalls = localGen.toolCalls;
      }
    } else if (this.geminiClient) {
      try {
        const generation = await this.generateWithGemini(
          this.geminiClient,
          augmentedUserPrompt,
          toolCtx,
        );
        replyText = generation.replyText;
        tokenUsage = generation.tokenUsage;
        toolCalls = generation.toolCalls;

        const hasToolData = toolCalls.some((t) => t.ok);
        isFallback = hasToolData
          ? isFallbackResponse(replyText)
          : retrievedDocs.length === 0 ||
            !retrievalResult.hasHighConfidence ||
            isFallbackResponse(replyText);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Google Gemini API không khả dụng (${errorMsg}), chuyển hẳn sang bộ xử lý RAG + Tool nội bộ tốc độ cao.`,
        );
        this.geminiClient = null;
        const localGen = await this.generateSmartLocalResponse(
          userMessage,
          retrievedDocs,
          toolCtx,
        );
        replyText = localGen.replyText;
        isFallback = localGen.isFallback;
        toolCalls = localGen.toolCalls;
      }
    } else {
      // Bộ xử lý RAG + Function Calling nội bộ khi chạy độc lập
      const localGen = await this.generateSmartLocalResponse(
        userMessage,
        retrievedDocs,
        toolCtx,
      );
      replyText = localGen.replyText;
      isFallback = localGen.isFallback;
      toolCalls = localGen.toolCalls;
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
      escalatedToHuman: shouldEscalate,
      retrievedDocuments: retrievedDocs,
      toolCalls,
      latencyMs,
      tokenUsage: tokenUsage > 0 ? tokenUsage : undefined,
    };
  }

  /**
   * Sinh câu trả lời qua Google Gemini API kèm hỗ trợ function calling
   */
  private async generateWithGemini(
    ai: GoogleGenAI,
    prompt: string,
    toolCtx: ToolExecutionContext,
  ): Promise<GenerationResult> {
    const toolCalls: ToolCallRecord[] = [];
    let tokenUsage = 0;

    const geminiTools: GeminiTool[] = [
      {
        functionDeclarations: [
          {
            name: TOOL_LOOKUP_ORDER,
            description:
              'Tra cứu đơn hàng CỦA CHÍNH người dùng đang chat. Dùng khi khách hỏi về trạng thái đơn, đơn gần đây, tổng tiền hoặc sản phẩm trong đơn. Nếu khách nêu mã đơn (dạng "ORD-...") thì truyền orderCode.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                orderCode: {
                  type: Type.STRING,
                  description: 'Mã đơn hàng khách cung cấp (không bắt buộc).',
                },
                limit: {
                  type: Type.INTEGER,
                  description:
                    'Số đơn gần nhất cần lấy khi không có orderCode (1-5, mặc định 3).',
                },
              },
            },
          },
          {
            name: TOOL_CHECK_INVENTORY,
            description:
              'Kiểm tra tình trạng tồn kho thực tế của MỘT sản phẩm trên các kho. Truyền productId nếu đã biết; nếu chỉ biết tên hoặc mã SKU thì truyền keyword.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                productId: {
                  type: Type.STRING,
                  description: 'UUID của sản phẩm.',
                },
                keyword: {
                  type: Type.STRING,
                  description:
                    'Tên hoặc SKU sản phẩm (dùng khi không có productId).',
                },
              },
            },
          },
          {
            name: TOOL_BROWSE_CATEGORY,
            description:
              'Tra cứu danh sách các sản phẩm đang bán theo Danh mục sản phẩm (Category). Dùng khi khách hỏi trong danh mục X có những sản phẩm nào, hoặc nhóm hàng X gồm những mặt hàng nào.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                categoryName: {
                  type: Type.STRING,
                  description:
                    'Tên hoặc từ khóa danh mục (ví dụ: "thiết bị đeo thông minh", "điện thoại", "âm thanh", "laptop", "phụ kiện").',
                },
                limit: {
                  type: Type.INTEGER,
                  description: 'Số lượng sản phẩm cần lấy (1-10, mặc định 5).',
                },
              },
            },
          },
        ],
      },
    ];

    const contents: GeminiContent[] = [
      { role: 'user', parts: [{ text: prompt }] },
    ];

    const candidateModels = [
      this.defaultGeminiModel,
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-pro-latest',
    ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const allowTools = round < MAX_TOOL_ROUNDS;
      const config: GenerateContentConfig = {
        systemInstruction: CHATBOT_SYSTEM_PROMPT,
        temperature: 0.1,
        ...(allowTools ? { tools: geminiTools } : {}),
      };

      let response: Awaited<
        ReturnType<typeof ai.models.generateContent>
      > | null = null;
      for (let i = 0; i < candidateModels.length; i++) {
        const modelName = candidateModels[i];
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config,
          });
          if (modelName !== this.defaultGeminiModel) {
            this.defaultGeminiModel = modelName;
            this.logger.log(
              `Tự động chuyển sang Google Gemini model: ${modelName}`,
            );
          }
          break;
        } catch (modelErr: unknown) {
          const errMsg =
            modelErr instanceof Error ? modelErr.message : String(modelErr);
          const suggestedMatch = errMsg.match(
            /use\s+models\/([a-zA-Z0-9._-]+)/i,
          );
          if (
            suggestedMatch?.[1] &&
            !candidateModels.includes(suggestedMatch[1])
          ) {
            candidateModels.splice(i + 1, 0, suggestedMatch[1]);
          }
          if (i < candidateModels.length - 1) {
            this.logger.warn(
              `Model ${modelName} không khả dụng, thử model tiếp theo (${candidateModels[i + 1]})...`,
            );
            continue;
          }
          throw modelErr;
        }
      }

      if (!response) {
        throw new Error('Không thể khởi tạo phản hồi từ Gemini API.');
      }

      tokenUsage += response.usageMetadata?.totalTokenCount ?? 0;
      const fnCalls = response.functionCalls;

      if (!fnCalls || fnCalls.length === 0) {
        const replyText = response.text || '';
        return { replyText, tokenUsage, toolCalls };
      }

      contents.push({
        role: 'model',
        parts: fnCalls.map((fc) => ({
          functionCall: {
            name: fc.name || '',
            args: fc.args,
          },
        })),
      });

      const responseParts: GeminiPart[] = [];
      for (const call of fnCalls) {
        const name = call.name || '';
        const args = (call.args as Record<string, unknown>) || {};
        const result = await this.toolsService.execute(name, args, toolCtx);
        toolCalls.push({
          name,
          input: args,
          ok: result.ok,
          ...(result.ok ? {} : { error: result.error }),
        });
        responseParts.push({
          functionResponse: {
            name,
            response: result as unknown as Record<string, unknown>,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: responseParts,
      });
    }

    return { replyText: '', tokenUsage, toolCalls };
  }

  /**
   * Bộ xử lý RAG + Function Calling nội bộ (đảm bảo STT 25, 26, 27 luôn hoạt động
   * chính xác dựa trên pgvector embeddings và ChatbotToolsService ngay cả khi LLM ngoài bị giới hạn)
   */
  private async generateSmartLocalResponse(
    userMessage: string,
    retrievedDocs: RetrievedDocument[],
    toolCtx: ToolExecutionContext,
  ): Promise<{
    replyText: string;
    isFallback: boolean;
    toolCalls: ToolCallRecord[];
  }> {
    const toolCalls: ToolCallRecord[] = [];
    const normalized = userMessage.trim();

    // 1. Kiểm tra ý định tra cứu đơn hàng (STT 27 - lookupOrder)
    const hasOrderCode = /\b(ORD-[A-Z0-9]{4,28})\b/i.test(normalized);
    const isPersonalOrderLookup =
      /(tra\s*cứu.*đơn|kiểm\s*tra.*đơn|xem.*đơn|đơn\s*(?:hàng)?\s*của\s*(?:tôi|mình|em|bạn)|đơn\s*(?:hàng)?\s*(?:gần\s*đây|mới\s*nhất|vừa\s*đặt)|lịch\s*sử\s*mua|tình\s*trạng\s*đơn)/i.test(
        normalized,
      ) &&
      !/(làm\s*sao|cách\s*(?:nào|để)|hướng\s*dẫn|chính\s*sách|quy\s*định|bao\s*nhiêu|miễn\s*phí|điều\s*kiện)/i.test(
        normalized,
      );
    const isOrderQuery = hasOrderCode || isPersonalOrderLookup;

    if (isOrderQuery) {
      const codeMatch = normalized.match(/\b(ORD-[A-Z0-9]{4,28})\b/i);
      const orderInput: Record<string, unknown> = codeMatch
        ? { orderCode: codeMatch[1].toUpperCase() }
        : { limit: 3 };
      const orderRes = await this.toolsService.execute(
        TOOL_LOOKUP_ORDER,
        orderInput,
        toolCtx,
      );

      if (orderRes && typeof orderRes === 'object' && 'ok' in orderRes) {
        toolCalls.push({
          name: TOOL_LOOKUP_ORDER,
          input: orderInput,
          ok: orderRes.ok,
          ...(orderRes.ok ? {} : { error: orderRes.error }),
        });

        if (!orderRes.ok) {
          if (orderRes.error === 'AUTH_REQUIRED') {
            return {
              replyText:
                'Dạ, để tra cứu thông tin và trạng thái đơn hàng, quý khách vui lòng đăng nhập vào tài khoản trước nhé!',
              isFallback: false,
              toolCalls,
            };
          }
          if (orderRes.error === 'NOT_FOUND') {
            return {
              replyText:
                'Dạ, hiện em không tìm thấy đơn hàng nào khớp với yêu cầu trong tài khoản của quý khách ạ.',
              isFallback: false,
              toolCalls,
            };
          }
          return {
            replyText:
              orderRes.message ||
              'Dạ, hiện chưa thể tra cứu thông tin đơn hàng lúc này.',
            isFallback: false,
            toolCalls,
          };
        }

        const data = orderRes.data as {
          orders?: Array<{
            orderCode: string;
            statusLabel: string;
            grandTotal: string;
            currency: string;
            shippingRegion?: string;
            items?: Array<{ productName: string; quantity: number }>;
          }>;
        };
        const orders = data?.orders ?? [];
        const lines = orders.map((o, idx) => {
          const itemsText = (o.items ?? [])
            .map((i) => `${i.productName} (x${i.quantity})`)
            .join(', ');
          const formattedTotal = Number(o.grandTotal).toLocaleString('vi-VN');
          return `${idx + 1}. Mã đơn **${o.orderCode}** — Trạng thái: **${o.statusLabel}** — Tổng tiền: **${formattedTotal} ${o.currency || 'VND'}**${itemsText ? `\n   • Sản phẩm: ${itemsText}` : ''}`;
        });

        return {
          replyText: `Dạ, kết quả tra cứu đơn hàng của quý khách trên hệ thống:\n\n${lines.join('\n\n')}`,
          isFallback: false,
          toolCalls,
        };
      }
    }

    // 2. Kiểm tra ý định tra cứu sản phẩm theo Danh mục (browseCategory)
    const categoryKeywords = [
      {
        key: 'Thiết bị đeo thông minh',
        patterns: [
          /thiết\s*bị\s*đeo/i,
          /đeo\s*thông\s*minh/i,
          /đồng\s*hồ\s*thông\s*minh/i,
          /vòng\s*đeo\s*tay/i,
          /smart\s*watch/i,
        ],
      },
      {
        key: 'Điện thoại & Máy tính bảng',
        patterns: [
          /điện\s*thoại/i,
          /smartphone/i,
          /máy\s*tính\s*bảng/i,
          /tablet/i,
          /ipad/i,
        ],
      },
      {
        key: 'Laptop & Máy tính',
        patterns: [
          /laptop/i,
          /máy\s*tính\s*xách\s*tay/i,
          /máy\s*vi\s*tính/i,
          /máy\s*tính\s*để\s*bàn/i,
          /\bpc\b/i,
        ],
      },
      {
        key: 'Âm thanh',
        patterns: [
          /âm\s*thanh/i,
          /loa/i,
          /tai\s*nghe/i,
          /headphone/i,
          /earphone/i,
        ],
      },
      {
        key: 'Phụ kiện công nghệ',
        patterns: [
          /phụ\s*kiện/i,
          /cáp\s*sạc/i,
          /sạc\s*dự\s*phòng/i,
          /bàn\s*phím/i,
          /chuột/i,
        ],
      },
    ];

    const isListingCategoryIntent =
      /(gồm\s*(những)?\s*sản\s*phẩm\s*nào|có\s*(những)?\s*sản\s*phẩm\s*nào|có\s*(những)?\s*mặt\s*hàng\s*nào|bán\s*(những)?\s*(sản\s*phẩm|mặt\s*hàng)\s*nào|danh\s*mục|danh\s*sách\s*(sản\s*phẩm|mặt\s*hàng)|những\s*món\s*nào|những\s*gì|mặt\s*hàng\s*nào)/i.test(
        normalized,
      );

    const matchedCategory = categoryKeywords.find((c) =>
      c.patterns.some((p) => p.test(normalized)),
    );

    // Nếu người dùng hỏi liệt kê sản phẩm của danh mục hoặc hỏi trực tiếp danh mục
    if (
      matchedCategory &&
      (isListingCategoryIntent ||
        !normalized.match(/model\s*\d+|\bsku-\d+\b/i))
    ) {
      const browseRes = await this.toolsService.execute(
        TOOL_BROWSE_CATEGORY,
        { categoryName: matchedCategory.key, limit: 5 },
        toolCtx,
      );

      if (browseRes && browseRes.ok) {
        toolCalls.push({
          name: TOOL_BROWSE_CATEGORY,
          input: { categoryName: matchedCategory.key },
          ok: true,
        });

        const catData = browseRes.data as {
          categoryName: string;
          totalProductsFound: number;
          products: Array<{
            name: string;
            sku: string;
            formattedPrice: string;
            totalAvailable: number;
            status: string;
          }>;
        };

        const itemsText = catData.products
          .map(
            (p) =>
              `• **${p.name}** (Mã SKU: \`${p.sku}\`): Giá **${p.formattedPrice}** — Trạng thái: **${p.status}** (Khả dụng: **${p.totalAvailable}** sản phẩm)`,
          )
          .join('\n');

        return {
          replyText:
            `Dạ, trong danh mục **${catData.categoryName}**, hệ thống MultiMart hiện có các sản phẩm tiêu biểu sau:\n\n` +
            itemsText +
            `\n\nQuý khách quan tâm sản phẩm nào có thể nhắn em tên hoặc mã SKU để em kiểm tra chi tiết lượng tồn kho từng khu vực nhé!`,
          isFallback: false,
          toolCalls,
        };
      }
    }

    // 3. Kiểm tra ý định tra cứu tồn kho sản phẩm (STT 27 - checkInventory)
    const hasStockKeyword =
      /(còn\s*hàng|hết\s*hàng|tồn\s*kho|có\s*hàng|kiểm\s*tra\s*kho|\bsku-\d+\b|còn\s*không|trong\s*kho)/i.test(
        normalized,
      );
    const knownPrefixes = [
      'Điện thoại thông minh',
      'Điện thoại',
      'Máy tính bảng',
      'Laptop văn phòng',
      'Laptop đồ họa',
      'Laptop',
      'Tai nghe không dây',
      'Tai nghe',
      'Loa Bluetooth',
      'Loa',
      'Đồng hồ thông minh',
      'Đồng hồ',
      'Vòng đeo tay',
      'Sạc dự phòng',
      'Cáp sạc',
      'Bàn phím cơ',
      'Bàn phím',
      'Chuột không dây',
      'Chuột',
      'Màn hình máy tính',
      'Màn hình',
      'Máy chiếu',
      'Ổ cứng',
      'Thẻ nhớ',
      'Camera',
      'Đèn LED',
      'Ổ cắm',
      'Robot hút bụi',
    ];
    const matchedPrefix = knownPrefixes.find((p) =>
      normalized.toLowerCase().includes(p.toLowerCase()),
    );

    if (
      (hasStockKeyword || matchedPrefix) &&
      (retrievedDocs.length === 0 || hasStockKeyword)
    ) {
      const candidateKeywords: string[] = [];
      const skuMatch = normalized.match(/\b(SKU-\d+)\b/i);
      if (skuMatch) {
        candidateKeywords.push(skuMatch[1].toUpperCase());
      }

      const cleanedKeyword = normalized
        .replace(
          /(cho\s*(tôi|mình|em)\s*hỏi|shop\s*ơi|kiểm\s*tra\s*tồn\s*kho|tình\s*trạng\s*tồn\s*kho|tồn\s*kho|còn\s*hàng\s*không|có\s*hàng\s*không|còn\s*hàng|hết\s*hàng|còn\s*không|sản\s*phẩm|trong\s*kho|ở\s*kho|ạ|nhé|\?|!|\.)/gi,
          ' ',
        )
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanedKeyword && cleanedKeyword.length >= 2) {
        candidateKeywords.push(cleanedKeyword);
      }
      if (matchedPrefix && !candidateKeywords.includes(matchedPrefix)) {
        candidateKeywords.push(matchedPrefix);
      }

      for (const kw of candidateKeywords) {
        const invRes = await this.toolsService.execute(
          TOOL_CHECK_INVENTORY,
          { keyword: kw },
          toolCtx,
        );
        if (!invRes || typeof invRes !== 'object' || !('ok' in invRes)) {
          break;
        }
        if (invRes.ok) {
          toolCalls.push({
            name: TOOL_CHECK_INVENTORY,
            input: { keyword: kw },
            ok: true,
          });
          const invData = invRes.data as {
            sku: string;
            name: string;
            totalAvailable: number;
            overallStatus: string;
            regions?: Array<{ region: string; status: string }>;
            warehouses?: Array<{
              warehouseName: string;
              region: string;
              stock: number;
              reservedStock: number;
              availableStock: number;
            }>;
          };
          const statusVi =
            invData.overallStatus === 'IN_STOCK' ? 'Còn hàng' : 'Hết hàng';
          let details = '';
          if (invData.warehouses && invData.warehouses.length > 0) {
            details =
              '\n• Chi tiết từng kho:\n' +
              invData.warehouses
                .map(
                  (w) =>
                    `  - ${w.warehouseName} (${w.region}): Khả dụng ${w.availableStock} (Tồn: ${w.stock}, Giữ chỗ: ${w.reservedStock})`,
                )
                .join('\n');
          } else if (invData.regions && invData.regions.length > 0) {
            details =
              '\n• Tình trạng theo khu vực:\n' +
              invData.regions
                .map(
                  (r) =>
                    `  - Khu vực ${r.region}: ${r.status === 'IN_STOCK' ? 'Còn hàng' : 'Tạm hết hàng'}`,
                )
                .join('\n');
          }

          return {
            replyText:
              `Dạ, thông tin tồn kho thực tế của sản phẩm **${invData.name}** (Mã SKU: \`${invData.sku}\`) trên hệ thống:\n` +
              `• Trạng thái chung: **${statusVi}** (Tổng số lượng khả dụng: **${invData.totalAvailable}** sản phẩm)` +
              details,
            isFallback: false,
            toolCalls,
          };
        }
      }
    }

    // 3. Nếu có tài liệu RAG từ pgvector (STT 25 & 26)
    if (retrievedDocs.length > 0) {
      const topDoc = retrievedDocs[0];
      const extraChunks = retrievedDocs
        .slice(1, 2)
        .filter((d) => d.similarity >= 0.5 && d.content !== topDoc.content)
        .map((d) => d.content);
      const combinedContent = [topDoc.content, ...extraChunks].join('\n\n');

      return {
        replyText: `Dạ, theo quy định trong **${topDoc.title}** của hệ thống MultiMart:\n\n${combinedContent}`,
        isFallback: false,
        toolCalls,
      };
    }

    // 4. Không có dữ liệu tin cậy -> Phản hồi dự phòng chống ảo giác (NFR-04.4 & FR-BOT-04)
    return {
      replyText:
        'Dạ, hiện em chưa tìm thấy thông tin chính xác cho câu hỏi này trong hệ thống. Tôi sẽ kết nối bạn với chuyên viên tư vấn để hỗ trợ ngay ạ!',
      isFallback: true,
      toolCalls,
    };
  }

  /**
   * Vòng lặp function calling với Claude:
   * gọi model -> nếu stop_reason = tool_use thì chạy tool (đã kiểm quyền) -> gửi tool_result -> lặp lại.
   */
  private async generateWithClaudeTools(
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
