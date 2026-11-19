import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
import { toVectorLiteral } from './vector.util';

export type RetrievalMode = 'VECTOR' | 'KEYWORD' | 'NONE';
export type RetrievalScoreType = 'cosine_similarity' | 'keyword_match';

export interface RetrievedDocument {
  id: string;
  title: string;
  docType: string;
  chunkIndex: number;
  content: string;
  sourceUrl?: string | null;
  similarity: number;
  scoreType?: RetrievalScoreType;
  keywordScore?: number;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number; // Ngưỡng tương đồng tối thiểu (0.0 - 1.0), mặc định 0.45
  docType?: string;
}

export interface RetrievalResult {
  query: string;
  documents: RetrievedDocument[];
  hasHighConfidence: boolean; // Có ít nhất 1 tài liệu vượt ngưỡng tự tin cao
  mode?: RetrievalMode;
  scoreType?: RetrievalScoreType;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  // Ngưỡng tương đồng cosine mặc định cho kết quả RAG hữu ích (Voyage-3 với tiếng Việt dao động 0.40 - 0.70)
  private readonly DEFAULT_MIN_SIMILARITY = 0.45;
  // Ngưỡng tự tin cao cho vector cosine (High Confidence)
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.58;
  // Ngưỡng điểm khớp từ khóa tối thiểu và tự tin cao cho keyword fallback (tách biệt hoàn toàn với cosine)
  private readonly MIN_KEYWORD_SCORE = 2;
  private readonly HIGH_CONFIDENCE_KEYWORD_SCORE = 3;

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
      return {
        query,
        documents: [],
        hasHighConfidence: false,
        mode: 'NONE',
        scoreType: 'cosine_similarity',
      };
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
        scoreType: 'cosine_similarity',
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
        mode: 'VECTOR',
        scoreType: 'cosine_similarity',
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Lỗi khi tìm kiếm tri thức RAG: ${msg}`);

      // Nếu Voyage AI bị giới hạn tần suất (429 Free Tier) hoặc mất mạng tạm thời,
      // fallback sang tìm kiếm toàn văn (keyword) trên bảng kb_documents.
      // Điểm keyword được tách biệt hoàn toàn với cosine similarity (scoreType = 'keyword_match').
      const keywordDocs = await this.fallbackKeywordSearch(trimmedQuery, limit);
      if (keywordDocs.length > 0) {
        const hasHighConfidence = keywordDocs.some(
          (d) => (d.keywordScore ?? 0) >= this.HIGH_CONFIDENCE_KEYWORD_SCORE,
        );
        return {
          query: trimmedQuery,
          documents: keywordDocs,
          hasHighConfidence,
          mode: 'KEYWORD',
          scoreType: 'keyword_match',
        };
      }

      // Fallback mềm: không crash ứng dụng nếu vector DB có sự cố
      return {
        query: trimmedQuery,
        documents: [],
        hasHighConfidence: false,
        mode: 'NONE',
        scoreType: 'keyword_match',
      };
    }
  }

  /**
   * Tìm kiếm dự phòng trên PostgreSQL khi dịch vụ tạo vector gặp giới hạn rate-limit.
   * Ghi rõ scoreType='keyword_match' và keywordScore thực tế, không giả lập cosine similarity.
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

      // Xếp hạng dựa trên mức độ khớp từ khóa thực tế (tiêu đề +3, nội dung +1)
      const scored = rows
        .map((r) => {
          let matchCount = 0;
          for (const topic of matchedTopics) {
            if (r.title.toLowerCase().includes(topic)) matchCount += 3;
            if (r.content.toLowerCase().includes(topic)) matchCount += 1;
          }
          return {
            row: r,
            score: matchCount,
          };
        })
        .filter((item) => item.score >= this.MIN_KEYWORD_SCORE);

      if (scored.length === 0) {
        return [];
      }

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit).map((s) => ({
        id: s.row.id,
        title: s.row.title,
        docType: s.row.docType,
        chunkIndex: s.row.chunkIndex,
        content: s.row.content,
        sourceUrl: s.row.sourceUrl,
        similarity: 0,
        scoreType: 'keyword_match',
        keywordScore: s.score,
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
        const scoreLabel =
          doc.scoreType === 'keyword_match'
            ? `Khớp từ khóa (score=${doc.keywordScore ?? 0})`
            : `Độ phù hợp: ${(doc.similarity * 100).toFixed(1)}%`;
        const header = `[Tài liệu ${idx + 1}: ${doc.title} (${doc.docType}) | ${scoreLabel}]`;
        return `${header}\n${doc.content}`;
      })
      .join('\n\n---\n\n');
  }
}
