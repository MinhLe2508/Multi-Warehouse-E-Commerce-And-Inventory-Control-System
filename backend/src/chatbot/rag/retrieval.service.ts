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

  // Ngưỡng tương đồng cosine mặc định cho kết quả RAG hữu ích (Voyage-3 với tiếng Việt dao động 0.40 - 0.70)
  private readonly DEFAULT_MIN_SIMILARITY = 0.45;
  // Ngưỡng tự tin cao (High Confidence)
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.58;

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
          ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
          LIMIT ${limit};
        `;
      }

      const allDocs: RetrievedDocument[] = (rows || []).map((r) => ({
        id: r.id,
        title: r.title,
        docType: r.docType,
        chunkIndex: r.chunkIndex,
        content: r.content,
        sourceUrl: r.sourceUrl,
        similarity: Number(r.similarity),
      }));

      const topSimilarity = allDocs[0]?.similarity;
      // Lọc các document đạt ngưỡng tối thiểu
      const documents = allDocs.filter((d) => d.similarity >= minSimilarity);

      const hasHighConfidence = documents.some(
        (d) => d.similarity >= this.HIGH_CONFIDENCE_THRESHOLD,
      );

      this.logger.debug(
        `RAG Search "${trimmedQuery.substring(0, 40)}...": top similarity: ${topSimilarity?.toFixed(3) ?? 'N/A'}, giữ lại ${documents.length}/${allDocs.length} docs (ngưỡng: ${minSimilarity})`,
      );

      return {
        query: trimmedQuery,
        documents,
        hasHighConfidence,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi khi tìm kiếm tri thức RAG: ${msg}`);

      // Nếu Voyage AI bị giới hạn tần suất (429 Free Tier) hoặc mất mạng tạm thời,
      // fallback sang tìm kiếm toàn văn (keyword) trên bảng kb_documents trong < 20ms
      const keywordDocs = await this.fallbackKeywordSearch(trimmedQuery, limit);
      if (keywordDocs.length > 0) {
        return {
          query: trimmedQuery,
          documents: keywordDocs,
          hasHighConfidence: true,
        };
      }

      // Fallback mềm: không crash ứng dụng nếu vector DB có sự cố
      return {
        query: trimmedQuery,
        documents: [],
        hasHighConfidence: false,
      };
    }
  }

  /**
   * Tìm kiếm dự phòng siêu tốc trên PostgreSQL khi dịch vụ tạo vector gặp giới hạn rate-limit
   */
  private async fallbackKeywordSearch(
    query: string,
    limit: number,
  ): Promise<RetrievedDocument[]> {
    if (
      !this.prisma.kbDocument ||
      typeof this.prisma.kbDocument.findMany !== 'function'
    ) {
      return [];
    }

    const lower = query.toLowerCase();

    // Danh mục chủ đề tri thức đặc trưng của hệ thống (dùng từ khóa/cụm từ cụ thể theo domain)
    const specificTopics = [
      'đổi trả',
      'hoàn tiền',
      'bảo hành',
      'vận chuyển',
      'thời gian giao hàng',
      'giao hàng',
      'phí ship',
      'miễn phí vận chuyển',
      'miễn phí giao hàng',
      'thanh toán',
      'hủy đơn',
      'tích điểm',
      'khách hàng thân thiết',
      'chính sách giá',
      'khuyến mãi',
      'tạo tài khoản',
      'khóa tài khoản',
      'hotline',
      'chăm sóc khách hàng',
      'liên hệ',
      'hóa đơn điện tử',
      'hóa đơn',
      'giao nhầm',
      'không người nhận',
      'giao chậm',
      'đánh giá sản phẩm',
      'địa chỉ giao hàng',
      'bảo mật',
    ];

    const matchedTopics = specificTopics.filter((topic) =>
      lower.includes(topic),
    );

    if (matchedTopics.length === 0) {
      return [];
    }

    try {
      const rows = await this.prisma.kbDocument.findMany({
        where: {
          isActive: true,
          OR: matchedTopics.flatMap((topic) => [
            { title: { contains: topic, mode: 'insensitive' as const } },
            { content: { contains: topic, mode: 'insensitive' as const } },
          ]),
        },
        take: 10,
      });

      if (rows.length === 0) {
        return [];
      }

      // Xếp hạng đơn giản dựa trên số topic xuất hiện trong title & content
      const scored = rows.map((r) => {
        let matchCount = 0;
        for (const topic of matchedTopics) {
          if (r.title.toLowerCase().includes(topic)) matchCount += 3;
          if (r.content.toLowerCase().includes(topic)) matchCount += 1;
        }
        return {
          row: r,
          score: matchCount,
        };
      });

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit).map((s) => ({
        id: s.row.id,
        title: s.row.title,
        docType: s.row.docType,
        chunkIndex: s.row.chunkIndex,
        content: s.row.content,
        sourceUrl: s.row.sourceUrl,
        similarity: Math.min(0.75, 0.55 + s.score * 0.05),
      }));
    } catch {
      return [];
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
