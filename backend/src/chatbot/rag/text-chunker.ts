// =============================================================================
// Chia tài liệu FAQ / chính sách thành các đoạn (chunk) nhỏ trước khi nhúng vector.
//
// Vì sao phải chunk:
// - Embedding của một đoạn ngắn, cùng chủ đề sẽ "sắc" hơn embedding của cả trang dài.
// - Prompt chỉ nhận vài đoạn liên quan nhất, tiết kiệm token (CON-07).
//
// Quy tắc (hàm thuần, không phụ thuộc DB/mạng nên dễ unit test):
// 1. Tách theo đoạn văn (dòng trống), rồi theo câu (. ! ? …).
// 2. Gộp câu vào chunk cho tới khi gần chạm maxChars.
// 3. Chunk sau lặp lại phần cuối chunk trước (overlap) để không mất ngữ cảnh ở ranh giới.
// 4. Câu dài hơn maxChars bị cắt cứng theo khoảng trắng.
// =============================================================================

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

export const DEFAULT_CHUNK_MAX_CHARS = 800;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 120;

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?…])\s+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Cắt câu quá dài theo khoảng trắng, mỗi mảnh <= maxChars.
function hardSplit(sentence: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

// Lấy phần đuôi của chunk trước (tính theo câu trọn vẹn) để làm overlap.
function tailForOverlap(sentences: string[], overlapChars: number): string[] {
  const tail: string[] = [];
  let size = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const next = size + sentences[i].length + 1;
    if (next > overlapChars) break;
    tail.unshift(sentences[i]);
    size = next;
  }
  return tail;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? DEFAULT_CHUNK_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS;
  if (!Number.isInteger(maxChars) || maxChars < 50) {
    throw new Error('maxChars phải là số nguyên >= 50.');
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error('overlapChars phải là số nguyên trong [0, maxChars).');
  }

  const clean = normalize(text);
  if (clean.length === 0) return [];
  if (clean.length <= maxChars) return [clean];

  const sentences = clean
    .split(/\n\n/)
    .flatMap((p) => splitSentences(p))
    .flatMap((s) => hardSplit(s, maxChars));

  const chunks: string[] = [];
  let current: string[] = [];
  let currentSize = 0;

  for (const sentence of sentences) {
    const added = currentSize === 0 ? sentence.length : currentSize + 1 + sentence.length;
    if (added > maxChars && current.length > 0) {
      chunks.push(current.join(' '));
      const overlap = tailForOverlap(current, overlapChars);
      // Overlap + câu mới vẫn phải vừa maxChars, nếu không thì bỏ overlap.
      const overlapSize = overlap.join(' ').length;
      current = overlapSize + 1 + sentence.length <= maxChars ? [...overlap] : [];
      currentSize = current.length > 0 ? overlapSize : 0;
    }
    current.push(sentence);
    currentSize = currentSize === 0 ? sentence.length : currentSize + 1 + sentence.length;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
}

