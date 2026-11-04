import {
  EMBEDDING_DIMENSIONS,
  toVectorLiteral,
  isValidEmbedding,
} from './vector.util';

describe('vector.util', () => {
  it('định dạng đúng vector literal cho PostgreSQL pgvector với 1024 chiều', () => {
    const vec = new Array(1024).fill(0.05);
    vec[0] = 0.123;
    vec[1] = -0.456;
    vec[2] = 0.789;

    const literal = toVectorLiteral(vec);
    expect(literal.startsWith('[0.123,-0.456,0.789,')).toBe(true);
    expect(literal.endsWith(']')).toBe(true);
  });

  it('ném lỗi nếu vector không đúng 1024 chiều', () => {
    expect(() => toVectorLiteral([])).toThrow(
      'Embedding phải có đúng 1024 chiều.',
    );
    expect(() => toVectorLiteral([0.1, 0.2])).toThrow(
      'Embedding phải có đúng 1024 chiều.',
    );
  });

  it('ném lỗi nếu vector chứa NaN hoặc Infinity', () => {
    const vecWithNaN = new Array(1024).fill(0.01);
    vecWithNaN[5] = NaN;
    expect(() => toVectorLiteral(vecWithNaN)).toThrow(
      'Vector chứa giá trị không phải số hợp lệ.',
    );

    const vecWithInf = new Array(1024).fill(0.01);
    vecWithInf[10] = Infinity;
    expect(() => toVectorLiteral(vecWithInf)).toThrow(
      'Vector chứa giá trị không phải số hợp lệ.',
    );
  });

  it('kiểm tra đúng số chiều EMBEDDING_DIMENSIONS (1024 chiều của Voyage-3)', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1024);

    const validVec = new Array(1024).fill(0.01);
    expect(isValidEmbedding(validVec)).toBe(true);

    const wrongDimVec = new Array(512).fill(0.01);
    expect(isValidEmbedding(wrongDimVec)).toBe(false);

    expect(isValidEmbedding('not an array')).toBe(false);
  });
});
