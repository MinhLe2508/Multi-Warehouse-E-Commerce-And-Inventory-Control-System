import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { chunkText, ChunkOptions } from './text-chunker';
import { toVectorLiteral } from './vector.util';

export interface IngestDocumentInput {
  title: string;
  docType: string;
  content: string;
  sourceUrl?: string;
  chunkOptions?: ChunkOptions;
}

export interface IngestResult {
  title: string;
  docType: string;
  chunksCreated: number;
  totalTokens: number;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Nạp một tài liệu mới: chunk hóa, sinh embedding qua Voyage AI, và lưu vào kb_documents
   */
  async ingestDocument(input: IngestDocumentInput): Promise<IngestResult> {
    const chunks: string[] = chunkText(input.content, input.chunkOptions);

    if (chunks.length === 0) {
      throw new Error('Nội dung tài liệu rỗng hoặc không thể chunk hóa.');
    }

    this.logger.log(
      `Đang chunk hóa tài liệu "${input.title}" thành ${chunks.length} chunks...`,
    );

    // Sinh embedding đồng loạt cho các chunk bằng Voyage AI (voyage-3)
    const { vectors, totalTokens } = await this.embeddingService.embedDocuments(chunks);

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i];
      const vector = vectors[i];
      const vectorLiteral = toVectorLiteral(vector);
      const estimatedTokens = Math.ceil(text.length / 4);

      // Dùng executeRaw để insert đúng kiểu unsupported("vector(1024)") của pgvector
      await this.prisma.$executeRaw`
        INSERT INTO "kb_documents" (
          "id",
          "title",
          "doc_type",
          "chunk_index",
          "content",
          "embedding",
          "token_count",
          "source_url",
          "is_active",
          "created_at",
          "updated_at"
        ) VALUES (
          gen_random_uuid(),
          ${input.title},
          ${input.docType},
          ${i},
          ${text},
          ${vectorLiteral}::vector,
          ${estimatedTokens},
          ${input.sourceUrl || null},
          true,
          NOW(),
          NOW()
        );
      `;
    }

    this.logger.log(
      `Đã nạp thành công "${input.title}" (${chunks.length} chunks, ~${totalTokens} tokens).`,
    );

    return {
      title: input.title,
      docType: input.docType,
      chunksCreated: chunks.length,
      totalTokens,
    };
  }

  /**
   * Đồng bộ embedding cho các bản ghi kb_documents chưa có vector (embedding IS NULL)
   * Phù hợp cho việc sync các bản ghi đã seed từ trước
   */
  async syncMissingEmbeddings(batchSize = 20): Promise<{ processed: number; remaining: number }> {
    // 1. Lấy danh sách các dòng chưa có embedding
    const unindexedRows = await this.prisma.$queryRaw<Array<{ id: string; content: string }>>`
      SELECT id, content
      FROM "kb_documents"
      WHERE "embedding" IS NULL AND "is_active" = true
      ORDER BY "created_at" ASC
      LIMIT ${batchSize};
    `;

    if (unindexedRows.length === 0) {
      this.logger.log('Tất cả kb_documents đã có embedding đầy đủ.');
      return { processed: 0, remaining: 0 };
    }

    this.logger.log(
      `Tìm thấy ${unindexedRows.length} chunks chưa có vector embedding. Đang gọi Voyage AI...`,
    );

    const contents = unindexedRows.map((r) => r.content);
    const { vectors } = await this.embeddingService.embedDocuments(contents);

    for (let i = 0; i < unindexedRows.length; i++) {
      const row = unindexedRows[i];
      const vectorLiteral = toVectorLiteral(vectors[i]);
      const estimatedTokens = Math.ceil(row.content.length / 4);

      await this.prisma.$executeRaw`
        UPDATE "kb_documents"
        SET "embedding" = ${vectorLiteral}::vector,
            "token_count" = COALESCE("token_count", ${estimatedTokens}),
            "updated_at" = NOW()
        WHERE "id" = ${row.id}::uuid;
      `;
    }

    // Đếm số lượng còn lại
    const remainingCountResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count
      FROM "kb_documents"
      WHERE "embedding" IS NULL AND "is_active" = true;
    `;
    const remaining = Number(remainingCountResult[0]?.count ?? 0);

    this.logger.log(
      `Đã đồng bộ vector cho ${unindexedRows.length} chunks. Còn lại: ${remaining}`,
    );

    return {
      processed: unindexedRows.length,
      remaining,
    };
  }

  /**
   * Lấy thống kê kho tri thức
   */
  async getStats(): Promise<{
    totalChunks: number;
    embeddedChunks: number;
    pendingChunks: number;
    docTypes: Array<{ docType: string; count: number }>;
  }> {
    const totalResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count FROM "kb_documents" WHERE "is_active" = true;
    `;
    const embeddedResult = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint as count FROM "kb_documents" WHERE "is_active" = true AND "embedding" IS NOT NULL;
    `;
    const docTypesResult = await this.prisma.$queryRaw<Array<{ doc_type: string; count: bigint }>>`
      SELECT "doc_type", COUNT(*)::bigint as count
      FROM "kb_documents"
      WHERE "is_active" = true
      GROUP BY "doc_type";
    `;

    const total = Number(totalResult[0]?.count ?? 0);
    const embedded = Number(embeddedResult[0]?.count ?? 0);

    return {
      totalChunks: total,
      embeddedChunks: embedded,
      pendingChunks: total - embedded,
      docTypes: docTypesResult.map((r) => ({
        docType: r.doc_type,
        count: Number(r.count),
      })),
    };
  }
}
