import {
  chunkText,
  DEFAULT_CHUNK_MAX_CHARS,
  DEFAULT_CHUNK_OVERLAP_CHARS,
} from './text-chunker';

describe('text-chunker', () => {
  it('trả về mảng rỗng nếu chuỗi rỗng hoặc chỉ có khoảng trắng', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  \t ')).toEqual([]);
  });

  it('không cắt đoạn nếu văn bản ngắn hơn maxChars', () => {
    const text = 'Chính sách đổi trả trong vòng 7 ngày kể từ ngày nhận hàng.';
    const result = chunkText(text, { maxChars: 500 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('chia nhỏ văn bản dài thành các chunk không vượt quá maxChars', () => {
    const sentence =
      'Hệ thống hỗ trợ giao hàng toàn quốc từ 3 kho lớn tại Hà Nội, Đà Nẵng và TP.HCM. ';
    const longText = sentence.repeat(20); // ~1600 ký tự

    const chunks = chunkText(longText, { maxChars: 300, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
    }
  });

  it('có overlap giữa các chunk kế tiếp nhau', () => {
    const p1 = 'Câu thứ nhất về quy định bảo hành sản phẩm. ';
    const p2 = 'Câu thứ hai về trường hợp từ chối bảo hành do rơi vỡ. ';
    const p3 = 'Câu thứ ba về thời gian xử lý khiếu nại trong 48 giờ. ';
    const text = p1 + p2 + p3;

    const chunks = chunkText(text, { maxChars: 120, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(1);

    // Chunk thứ 2 phải chứa một phần của chunk thứ nhất (overlap)
    const secondChunk = chunks[1];
    expect(secondChunk.length).toBeGreaterThan(0);
  });

  it('ném lỗi nếu maxChars không hợp lệ', () => {
    expect(() => chunkText('test', { maxChars: 20 })).toThrow(
      'maxChars phải là số nguyên >= 50.',
    );
  });

  it('ném lỗi nếu overlapChars >= maxChars', () => {
    expect(() =>
      chunkText('test', { maxChars: 100, overlapChars: 100 }),
    ).toThrow('overlapChars phải là số nguyên trong [0, maxChars).');
  });
});
