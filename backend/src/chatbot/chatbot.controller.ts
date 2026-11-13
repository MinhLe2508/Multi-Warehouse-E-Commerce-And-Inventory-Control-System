import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../core/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../core/decorators/current-user.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { ChatbotService } from './chatbot.service';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';
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
  ) {}

  /**
   * Endpoint chính: Gửi tin nhắn đến Chatbot (POST /chatbot hoặc POST /chatbot/message)
   * Hỗ trợ cả khách vãng lai và người dùng đã đăng nhập.
   * userId/role lấy từ JWT đã được JwtStrategy xác minh chữ ký (OptionalJwtAuthGuard),
   * đây là nguồn duy nhất để các tool (lookupOrder, checkInventory) kiểm tra quyền.
   */
  @Post(['', 'message'])
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Body() dto: SendChatMessageDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return await this.chatbotService.processUserMessage({
      sessionToken: dto.sessionToken,
      message: dto.message,
      userId: user?.userId,
      role: user?.role,
    });
  }

  /**
   * Lấy lịch sử hội thoại của 1 session (GET /chatbot/history/:sessionToken)
   * Chỉ chủ phiên được xem.
   */
  @Get('history/:sessionToken')
  @UseGuards(OptionalJwtAuthGuard)
  async getHistory(
    @Param('sessionToken') sessionToken: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const history = await this.chatbotService.getSessionHistory(
      sessionToken,
      user?.userId,
    );
    if (!history) {
      throw new NotFoundException('Không tìm thấy phiên chat.');
    }
    return history;
  }

  /**
   * Khách hàng yêu cầu chuyển tiếp sang nhân viên (POST /chatbot/escalate)
   */
  @Post('escalate')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async escalate(
    @Body() dto: EscalateSessionDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const ok = await this.chatbotService.escalateSession(
      dto.sessionToken,
      user?.userId,
    );
    if (!ok) {
      throw new NotFoundException('Không tìm thấy phiên chat.');
    }
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
