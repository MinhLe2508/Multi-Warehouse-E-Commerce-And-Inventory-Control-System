import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { toVectorLiteral } from './vector.util';

export interface RetrievedDocument {
  id: string;
  title: string;
  docType: string;
  chunkIndex: number;
  content: string;
  sourceUrl?: string | null;
  similarity: number;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number; // Ngưỡng tương đồng tối thiểu (0.0 - 1.0), mặc định 0.65
  docType?: string;
}

export interface RetrievalResult {
  query: string;
  documents: RetrievedDocument[];
  hasHighConfidence: boolean; // Có ít nhất 1 tài liệu vượt ngưỡng tự tin cao (>= 0.75)
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  // Ngưỡng tương đồng cosine mặc định cho kết quả RAG hữu ích
  private readonly DEFAULT_MIN_SIMILARITY = 0.65;
  // Ngưỡng tự tin cao (High Confidence)
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.75;

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Truy vấn các đoạn tri thức tương đồng ngữ nghĩa bằng pgvector cosine similarity
   */
  async searchKnowledgeBase(
    query: string,
    options?: SearchOptions,
  ): Promise<RetrievalResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return { query, documents: [], hasHighConfidence: false };
    }

    const limit = options?.limit ?? 4;
    const minSimilarity = options?.minSimilarity ?? this.DEFAULT_MIN_SIMILARITY;

    try {
      // 1. Sinh embedding vector cho câu truy vấn (input_type: query)
      const queryEmbedding =
        await this.embeddingService.embedQuery(trimmedQuery);
      const vectorLiteral = toVectorLiteral(queryEmbedding);

      // 2. Truy vấn pgvector với cosine distance operator (<=>)
      // Lưu ý: 1 - (embedding <=> query_vec) chính là cosine similarity
      let rows: Array<{
        id: string;
        title: string;
        docType: string;
        chunkIndex: number;
        content: string;
        sourceUrl: string | null;
        similarity: number;
      }>;

      if (options?.docType) {
        rows = await this.prisma.$queryRaw<typeof rows>`
          SELECT 
            "id",
            "title",
            "doc_type" AS "docType",
            "chunk_index" AS "chunkIndex",
            "content",
            "source_url" AS "sourceUrl",
            (1 - ("embedding" <=> ${vectorLiteral}::vector))::float8 AS "similarity"
          FROM "kb_documents"
          WHERE "is_active" = true
            AND "embedding" IS NOT NULL
            AND "doc_type" = ${options.docType}
            AND (1 - ("embedding" <=> ${vectorLiteral}::vector)) >= ${minSimilarity}
          ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
          LIMIT ${limit};
        `;
      } else {
        rows = await this.prisma.$queryRaw<typeof rows>`
          SELECT 
            "id",
            "title",
            "doc_type" AS "docType",
            "chunk_index" AS "chunkIndex",
            "content",
            "source_url" AS "sourceUrl",
            (1 - ("embedding" <=> ${vectorLiteral}::vector))::float8 AS "similarity"
          FROM "kb_documents"
          WHERE "is_active" = true
            AND "embedding" IS NOT NULL
            AND (1 - ("embedding" <=> ${vectorLiteral}::vector)) >= ${minSimilarity}
          ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
          LIMIT ${limit};
        `;
      }

      const documents: RetrievedDocument[] = (rows || []).map((r) => ({
        id: r.id,
        title: r.title,
        docType: r.docType,
        chunkIndex: r.chunkIndex,
        content: r.content,
        sourceUrl: r.sourceUrl,
        similarity: Number(r.similarity),
      }));

      const hasHighConfidence = documents.some(
        (d) => d.similarity >= this.HIGH_CONFIDENCE_THRESHOLD,
      );

      this.logger.debug(
        `RAG Search "${trimmedQuery.substring(0, 40)}...": tìm thấy ${documents.length} docs (max similarity: ${documents[0]?.similarity?.toFixed(3) ?? 'N/A'})`,
      );

      return {
        query: trimmedQuery,
        documents,
        hasHighConfidence,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi khi tìm kiếm tri thức RAG: ${msg}`);
      // Fallback mềm: không crash ứng dụng nếu vector DB có sự cố
      return {
        query: trimmedQuery,
        documents: [],
        hasHighConfidence: false,
      };
    }
  }

  /**
   * Định dạng danh sách document thành chuỗi context cho prompt của LLM
   */
  formatContextForPrompt(documents: RetrievedDocument[]): string {
    if (!documents || documents.length === 0) {
      return 'KHÔNG CÓ DỮ LIỆU TÀI LIỆU NỘI BỘ PHÙ HỢP VỚI CÂU HỎI NÀY.';
    }

    return documents
      .map((doc, idx) => {
        const header = `[Tài liệu ${idx + 1}: ${doc.title} (${doc.docType}) | Độ phù hợp: ${(doc.similarity * 100).toFixed(1)}%]`;
        return `${header}\n${doc.content}`;
      })
      .join('\n\n---\n\n');
  }
}
