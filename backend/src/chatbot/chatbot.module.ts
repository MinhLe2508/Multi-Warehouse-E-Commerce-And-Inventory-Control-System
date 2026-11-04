import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { EmbeddingService } from './rag/embedding.service';
import { KnowledgeBaseService } from './rag/knowledge-base.service';
import { RetrievalService } from './rag/retrieval.service';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_ACCESS_SECRET || 'secret',
      }),
    }),
  ],
  controllers: [ChatbotController],
  providers: [
    EmbeddingService,
    KnowledgeBaseService,
    RetrievalService,
    ChatbotService,
  ],
  exports: [
    EmbeddingService,
    KnowledgeBaseService,
    RetrievalService,
    ChatbotService,
  ],
})
export class ChatbotModule {}

