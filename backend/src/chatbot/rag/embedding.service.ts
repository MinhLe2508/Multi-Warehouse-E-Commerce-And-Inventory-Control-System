// =============================================================================
// EmbeddingService (STT 25): gọi Voyage AI để biến văn bản thành vector 1024 chiều.
//
// Nhà cung cấp đã chốt: Voyage AI, model voyage-3 (1024 chiều, khớp vector(1024)).
// - Tài liệu khi nạp vào kho tri thức: input_type = "document".
// - Câu hỏi của khách khi tìm kiếm:   input_type = "query".
//   Voyage tối ưu hai loại khác nhau, dùng sai loại sẽ giảm độ chính xác retrieval.
//
// Gọi REST bằng fetch có sẵn của Node (không thêm package).
// Biến môi trường: VOYAGE_API_KEY (bắt buộc), VOYAGE_MODEL (mặc định voyage-3).
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_DIMENSIONS } from './vector.util';

export type EmbeddingInputType = 'document' | 'query';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const DEFAULT_MODEL = 'voyage-3';
// Số văn bản tối đa mỗi request (Voyage cho phép nhiều hơn, giữ nhỏ cho an toàn token).
export const EMBEDDING_BATCH_SIZE = 64;
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 500;

interface VoyageResponse {
  data?: Array<{ embedding?: unknown; index?: unknown }>;
  usage?: { total_tokens?: unknown };
}

export interface EmbeddingResult {
  vectors: number[][];
  totalTokens: number;
}

export class EmbeddingError extends Error {}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly queryCache = new Map<string, number[]>();

  get model(): string {
    return process.env.VOYAGE_MODEL?.trim() || DEFAULT_MODEL;
  }

  async embedDocuments(texts: string[]): Promise<EmbeddingResult> {
    const vectors: number[][] = [];
    let totalTokens = 0;
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const result = await this.request(batch, 'document');
      vectors.push(...result.vectors);
      totalTokens += result.totalTokens;
    }
    return { vectors, totalTokens };
  }

  async embedQuery(text: string): Promise<number[]> {
    const cacheKey = text.trim().toLowerCase();
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await this.request([text], 'query');
    const vec = result.vectors[0];
    if (vec) {
      if (this.queryCache.size >= 200) {
        this.queryCache.clear();
      }
      this.queryCache.set(cacheKey, vec);
    }
    return vec;
  }

  private async request(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<EmbeddingResult> {
    if (texts.length === 0) return { vectors: [], totalTokens: 0 };
    if (texts.some((t) => typeof t !== 'string' || t.trim().length === 0)) {
      throw new EmbeddingError('Không nhúng được văn bản rỗng.');
    }
    const apiKey = process.env.VOYAGE_API_KEY?.trim();
    if (!apiKey) throw new EmbeddingError('Thiếu VOYAGE_API_KEY.');

    // Thử lại đúng 1 lần khi bị giới hạn tốc độ (429) hoặc lỗi phía Voyage (5xx).
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetch(VOYAGE_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: texts,
            model: this.model,
            input_type: inputType,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new EmbeddingError(
          'Không kết nối được Voyage AI (timeout/mạng).',
        );
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt === 1) {
        this.logger.warn(
          `Voyage trả ${response.status}, thử lại sau ${RETRY_DELAY_MS}ms`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      if (!response.ok) {
        // Không ghi body vào log: có thể chứa lại nội dung tài liệu.
        throw new EmbeddingError(`Voyage AI trả lỗi HTTP ${response.status}.`);
      }
      return this.parse(
        (await response.json()) as VoyageResponse,
        texts.length,
      );
    }
  }

  private parse(body: VoyageResponse, expected: number): EmbeddingResult {
    const data = Array.isArray(body.data) ? body.data : [];
    if (data.length !== expected) {
      throw new EmbeddingError('Voyage AI trả về sai số lượng embedding.');
    }
    const vectors: number[][] = new Array<number[]>(expected);
    data.forEach((row, position) => {
      const index = typeof row.index === 'number' ? row.index : position;
      const embedding = row.embedding;
      if (
        !Array.isArray(embedding) ||
        embedding.length !== EMBEDDING_DIMENSIONS ||
        !embedding.every((v) => typeof v === 'number' && Number.isFinite(v))
      ) {
        throw new EmbeddingError(
          `Embedding không hợp lệ (cần ${EMBEDDING_DIMENSIONS} chiều). Kiểm tra VOYAGE_MODEL.`,
        );
      }
      vectors[index] = embedding as number[];
    });
    if (vectors.some((v) => v === undefined)) {
      throw new EmbeddingError(
        'Voyage AI trả về index embedding không hợp lệ.',
      );
    }
    const tokens = body.usage?.total_tokens;
    return { vectors, totalTokens: typeof tokens === 'number' ? tokens : 0 };
  }
}
