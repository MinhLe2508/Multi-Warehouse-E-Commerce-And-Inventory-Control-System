// Số chiều cố định của cột kb_documents.embedding (vector(1024)) và của voyage-3.
export const EMBEDDING_DIMENSIONS = 1024;

// Chuyển mảng số thành chuỗi literal của pgvector: "[0.1,0.2,...]".
// Luôn truyền chuỗi này dưới dạng THAM SỐ ($1::vector), không nối thẳng vào SQL.
export function toVectorLiteral(values: number[]): string {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding phải có đúng ${EMBEDDING_DIMENSIONS} chiều.`);
  }
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error('Vector chứa giá trị không phải số hợp lệ.');
    }
  }
  return `[${values.join(',')}]`;
}

// Kiểm tra xem một giá trị có phải là mảng vector hợp lệ 1024 chiều hay không.
export function isValidEmbedding(values: unknown): values is number[] {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    return false;
  }
  return values.every((v) => typeof v === 'number' && Number.isFinite(v));
}
