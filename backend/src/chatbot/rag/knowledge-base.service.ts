import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  chunksUpdated?: number;
  chunksUnchanged?: number;
  totalTokens: number;
}

interface ExistingChunkRow {
  id: string;
  chunkIndex: number;
  content: string;
  hasEmbedding: boolean;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Nạp hoặc cập nhật tài liệu một cách idempotent theo khóa ổn định (title + docType + chunkIndex):
   * - Cùng nội dung chạy lại không tạo bản sao trùng lặp.
   * - Chỉ sinh lại embedding (1024 chiều) cho các chunk mới, có nội dung thay đổi hoặc thiếu vector.
   * - Thực thi trong một DB transaction để lỗi giữa chừng rollback toàn bộ, không để lại nửa bộ dữ liệu.
   */
  async ingestDocument(input: IngestDocumentInput): Promise<IngestResult> {
    const title = input.title.trim();
    const docType = input.docType.trim();
    if (!title || !docType) {
      throw new Error('Tiêu đề và loại tài liệu không được để trống.');
    }

    const chunks: string[] = chunkText(input.content, input.chunkOptions);

    if (chunks.length === 0) {
      throw new Error('Nội dung tài liệu rỗng hoặc không thể chunk hóa.');
    }

    // 1. Đọc các chunk hiện có của tài liệu này
    const existingRows: ExistingChunkRow[] =
      typeof this.prisma.$queryRaw === 'function'
        ? ((await this.prisma.$queryRaw<ExistingChunkRow[]>`
            SELECT "id"::text AS "id",
                   "chunk_index" AS "chunkIndex",
                   "content",
                   ("embedding" IS NOT NULL) AS "hasEmbedding"
            FROM "kb_documents"
            WHERE "title" = ${title}
              AND "doc_type" = ${docType}
              AND "is_active" = true
            ORDER BY "chunk_index" ASC;
          `) ?? [])
        : [];

    const existingByIndex = new Map<number, ExistingChunkRow>();
    for (const row of existingRows) {
      if (!existingByIndex.has(row.chunkIndex)) {
        existingByIndex.set(row.chunkIndex, row);
      }
    }

    // 2. Xác định những chunk cần sinh vector mới (chunk mới, nội dung thay đổi, hoặc thiếu vector)
    const dirtyIndices: number[] = [];
    const dirtyTexts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const existing = existingByIndex.get(i);
      if (
        !existing ||
        existing.content !== chunks[i] ||
        !existing.hasEmbedding
      ) {
        dirtyIndices.push(i);
        dirtyTexts.push(chunks[i]);
      }
    }

    const hasTrailingExtraRows = existingRows.length > chunks.length;

    // Nếu mọi chunk đều giống hệt và đã có vector đủ -> No-op idempotent
    if (dirtyIndices.length === 0 && !hasTrailingExtraRows) {
      this.logger.log(
        `Tài liệu "${title}" (${docType}) không thay đổi (${chunks.length} chunks). Bỏ qua re-ingest.`,
      );
      return {
        title,
        docType,
        chunksCreated: 0,
        chunksUpdated: 0,
        chunksUnchanged: chunks.length,
        totalTokens: 0,
      };
    }

    // 3. Sinh embedding đồng loạt cho các chunk thay đổi và kiểm tra chặt chẽ chiều vector (1024) TRƯỚC khi ghi DB
    let totalTokens = 0;
    const vectorLiteralByIndex = new Map<number, string>();
    if (dirtyTexts.length > 0) {
      this.logger.log(
        `Đang sinh embedding cho ${dirtyTexts.length}/${chunks.length} chunks của "${title}"...`,
      );
      const embedRes = await this.embeddingService.embedDocuments(dirtyTexts);
      if (
        !embedRes ||
        !Array.isArray(embedRes.vectors) ||
        embedRes.vectors.length !== dirtyTexts.length
      ) {
        throw new Error(
          `Số lượng vector trả về (${embedRes?.vectors?.length ?? 0}) không khớp số lượng chunk (${dirtyTexts.length}).`,
        );
      }
      totalTokens = embedRes.totalTokens ?? 0;
      for (let k = 0; k < dirtyIndices.length; k++) {
        // toVectorLiteral sẽ ném lỗi ngay nếu vector thiếu hoặc khác 1024 chiều
        const literal = toVectorLiteral(embedRes.vectors[k]);
        vectorLiteralByIndex.set(dirtyIndices[k], literal);
      }
    }

    // 4. Thực thi cập nhật/thêm mới nguyên tử trong 1 transaction
    let chunksCreated = 0;
    let chunksUpdated = 0;

    const runWrites = async (
      tx: Pick<PrismaService, '$executeRaw'>,
    ): Promise<void> => {
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i];
        const existing = existingByIndex.get(i);
        const vectorLiteral = vectorLiteralByIndex.get(i);
        const estimatedTokens = Math.ceil(text.length / 4);

        if (!existing) {
          await tx.$executeRaw`
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
              ${title},
              ${docType},
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
          chunksCreated++;
        } else if (vectorLiteral !== undefined) {
          await tx.$executeRaw`
            UPDATE "kb_documents"
            SET "content" = ${text},
                "embedding" = ${vectorLiteral}::vector,
                "token_count" = ${estimatedTokens},
                "source_url" = ${input.sourceUrl || null},
                "updated_at" = NOW()
            WHERE "id" = ${existing.id}::uuid;
          `;
          chunksUpdated++;
        }
      }

      // Vô hiệu hóa các chunk thừa nếu phiên bản mới ngắn hơn phiên bản cũ hoặc có bản ghi trùng chunk_index
      if (hasTrailingExtraRows) {
        await tx.$executeRaw`
          UPDATE "kb_documents"
          SET "is_active" = false,
              "updated_at" = NOW()
          WHERE "title" = ${title}
            AND "doc_type" = ${docType}
            AND "is_active" = true
            AND "chunk_index" >= ${chunks.length};
        `;
      }
    };

    if (typeof this.prisma.$transaction === 'function') {
      await this.prisma.$transaction((tx) => runWrites(tx));
    } else {
      await runWrites(this.prisma);
    }

    const chunksUnchanged = chunks.length - chunksCreated - chunksUpdated;
    this.logger.log(
      `Đã đồng bộ "${title}" (tạo mới: ${chunksCreated}, cập nhật: ${chunksUpdated}, giữ nguyên: ${chunksUnchanged}, ~${totalTokens} tokens).`,
    );

    return {
      title,
      docType,
      chunksCreated,
      chunksUpdated,
      chunksUnchanged,
      totalTokens,
    };
  }

  /** Store searchable text locally. Generating vectors is a separate operation. */
  async saveTextDocument(input: IngestDocumentInput): Promise<IngestResult> {
    const title = input.title.trim();
    const docType = input.docType.trim();
    const sourceUrl = input.sourceUrl ?? null;
    const chunks = chunkText(input.content, input.chunkOptions);
    if (!title || !docType || chunks.length === 0) {
      throw new BadRequestException(
        'Tiêu đề, loại và nội dung tài liệu là bắt buộc.',
      );
    }

    return this.withDocumentLock(title, docType, async (tx) => {
      const existing = await tx.kbDocument.findMany({
        where: { title, docType, isActive: true },
        select: { id: true, chunkIndex: true, content: true, sourceUrl: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      });
      const byIndex = new Map<number, (typeof existing)[number]>();
      for (const row of existing) {
        if (!byIndex.has(row.chunkIndex)) byIndex.set(row.chunkIndex, row);
      }

      let chunksCreated = 0;
      let chunksUpdated = 0;
      const retainedIds: string[] = [];
      for (const [chunkIndex, content] of chunks.entries()) {
        const old = byIndex.get(chunkIndex);
        const tokenCount = Math.ceil(content.length / 4);
        if (!old) {
          const row = await tx.kbDocument.create({
            data: {
              title,
              docType,
              sourceUrl,
              chunkIndex,
              content,
              tokenCount,
            },
            select: { id: true },
          });
          retainedIds.push(row.id);
          chunksCreated++;
        } else {
          retainedIds.push(old.id);
          if (old.content !== content || old.sourceUrl !== sourceUrl) {
            await tx.$executeRaw`
              UPDATE kb_documents SET content = ${content}, source_url = ${sourceUrl},
                token_count = ${tokenCount}, updated_at = NOW(),
                embedding = CASE WHEN content = ${content} THEN embedding ELSE NULL END
              WHERE id = ${old.id}::uuid
            `;
            chunksUpdated++;
          }
        }
      }
      await tx.kbDocument.updateMany({
        where: { title, docType, isActive: true, id: { notIn: retainedIds } },
        data: { isActive: false },
      });
      return {
        title,
        docType,
        chunksCreated,
        chunksUpdated,
        chunksUnchanged: chunks.length - chunksCreated - chunksUpdated,
        totalTokens: 0,
      };
    });
  }

  async setChunkActive(
    id: string,
    isActive: boolean,
  ): Promise<{ isActive: boolean }> {
    const chunk = await this.prisma.kbDocument.findUnique({
      where: { id },
      select: { title: true, docType: true, chunkIndex: true },
    });
    if (!chunk) throw new NotFoundException('Không tìm thấy đoạn tri thức.');
    return this.withDocumentLock(chunk.title, chunk.docType, async (tx) => {
      if (isActive) {
        const replacement = await tx.kbDocument.findFirst({
          where: { ...chunk, id: { not: id }, isActive: true },
          select: { id: true },
        });
        if (replacement) {
          throw new ConflictException('Đoạn này đã có phiên bản đang sử dụng.');
        }
      }
      await tx.kbDocument.updateMany({
        where: { id, isActive: !isActive },
        data: { isActive },
      });
      return { isActive };
    });
  }

  private withDocumentLock<T>(
    title: string,
    docType: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    const key = JSON.stringify(['kb-document', title, docType]);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      return callback(tx);
    });
  }

  /**
   * Đồng bộ embedding cho các bản ghi kb_documents chưa có vector (embedding IS NULL)
   * Phù hợp cho việc sync các bản ghi đã seed từ trước
   */
  async syncMissingEmbeddings(
    batchSize = 20,
  ): Promise<{ processed: number; remaining: number }> {
    // 1. Lấy danh sách các dòng chưa có embedding
    const unindexedRows = await this.prisma.$queryRaw<
      Array<{ id: string; content: string }>
    >`
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

    let processed = 0;
    for (let i = 0; i < unindexedRows.length; i++) {
      const row = unindexedRows[i];
      const vectorLiteral = toVectorLiteral(vectors[i]);
      const estimatedTokens = Math.ceil(row.content.length / 4);

      processed += await this.prisma.$executeRaw`
        UPDATE "kb_documents"
        SET "embedding" = ${vectorLiteral}::vector,
            "token_count" = COALESCE("token_count", ${estimatedTokens}),
            "updated_at" = NOW()
        WHERE "id" = ${row.id}::uuid AND "content" = ${row.content}
          AND "is_active" = true AND "embedding" IS NULL;
      `;
    }

    // Đếm số lượng còn lại
    const remainingCountResult = await this.prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint as count
      FROM "kb_documents"
      WHERE "embedding" IS NULL AND "is_active" = true;
    `;
    const remaining = Number(remainingCountResult[0]?.count ?? 0);

    this.logger.log(
      `Đã đồng bộ vector cho ${processed} chunks. Còn lại: ${remaining}`,
    );

    return {
      processed,
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
    const embeddedResult = await this.prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint as count FROM "kb_documents" WHERE "is_active" = true AND "embedding" IS NOT NULL;
    `;
    const docTypesResult = await this.prisma.$queryRaw<
      Array<{ doc_type: string; count: bigint }>
    >`
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
