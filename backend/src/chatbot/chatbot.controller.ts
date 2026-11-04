import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { ChatbotService } from './chatbot.service';
import { KnowledgeBaseService } from './rag/knowledge-base.service';
import {
  EscalateSessionDto,
  IngestKbDocumentDto,
  SendChatMessageDto,
} from './dto/chat.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(
    private readonly chatbotService: ChatbotService,
    private readonly kbService: KnowledgeBaseService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Endpoint chính: Gửi tin nhắn đến Chatbot (POST /chatbot hoặc POST /chatbot/message)
   * Hỗ trợ cả khách vãng lai và người dùng đã đăng nhập (tự động giải mã Bearer token nếu có)
   */
  @Post(['', 'message'])
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Body() dto: SendChatMessageDto,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = this.jwtService.decode(token) as { sub?: string; id?: string };
        userId = decoded?.sub || decoded?.id;
      } catch {
        // Bỏ qua nếu token không hợp lệ (xử lý như khách vãng lai)
      }
    }

    return await this.chatbotService.processUserMessage({
      sessionToken: dto.sessionToken,
      message: dto.message,
      userId,
    });
  }

  /**
   * Lấy lịch sử hội thoại của 1 session (GET /chatbot/history/:sessionToken)
   */
  @Get('history/:sessionToken')
  async getHistory(@Param('sessionToken') sessionToken: string) {
    return await this.chatbotService.getSessionHistory(sessionToken);
  }

  /**
   * Khách hàng yêu cầu chuyển tiếp sang nhân viên (POST /chatbot/escalate)
   */
  @Post('escalate')
  @HttpCode(HttpStatus.OK)
  async escalate(@Body() dto: EscalateSessionDto) {
    await this.chatbotService.escalateSession(dto.sessionToken);
    return {
      success: true,
      message: 'Đã chuyển tiếp phiên chat tới chuyên viên tư vấn hỗ trợ.',
    };
  }

  /**
   * ADMIN: Nạp tài liệu mới vào Knowledge Base (POST /chatbot/kb/ingest)
   */
  @Post('kb/ingest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async ingestDocument(@Body() dto: IngestKbDocumentDto) {
    return await this.kbService.ingestDocument({
      title: dto.title,
      docType: dto.docType,
      content: dto.content,
      sourceUrl: dto.sourceUrl,
    });
  }

  /**
   * ADMIN: Đồng bộ embeddings cho các tài liệu chưa có vector (POST /chatbot/kb/sync-embeddings)
   */
  @Post('kb/sync-embeddings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async syncEmbeddings() {
    return await this.kbService.syncMissingEmbeddings(50);
  }

  /**
   * ADMIN: Thống kê tình trạng kho tri thức (GET /chatbot/kb/stats)
   */
  @Get('kb/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getKbStats() {
    return await this.kbService.getStats();
  }
}

