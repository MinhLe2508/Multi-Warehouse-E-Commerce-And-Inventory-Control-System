import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingService } from './rag/embedding.service';
import { KnowledgeBaseService } from './rag/knowledge-base.service';
import { RetrievalService } from './rag/retrieval.service';
import { ChatbotToolsService } from './tools/chatbot-tools.service';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';

// Xác thực JWT dùng lại JwtStrategy ('jwt') do AuthModule đăng ký với Passport,
// nên module này không cần tự cấu hình JwtModule/secret riêng.
@Module({
  imports: [PrismaModule],
  controllers: [ChatbotController],
  providers: [
    EmbeddingService,
    KnowledgeBaseService,
    RetrievalService,
    ChatbotToolsService,
    ChatbotService,
  ],
  exports: [
    EmbeddingService,
    KnowledgeBaseService,
    RetrievalService,
    ChatbotToolsService,
    ChatbotService,
  ],
})
export class ChatbotModule {}
