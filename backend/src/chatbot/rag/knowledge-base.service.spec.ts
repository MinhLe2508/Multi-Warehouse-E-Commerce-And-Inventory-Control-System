import { KnowledgeBaseService } from './knowledge-base.service';
import { EMBEDDING_DIMENSIONS } from './vector.util';

const validVector = (seed = 0.01) =>
  new Array<number>(EMBEDDING_DIMENSIONS).fill(seed);

describe('KnowledgeBaseService (F097, F098)', () => {
  let service: KnowledgeBaseService;
  let txExecuteRaw: jest.Mock;
  let prisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let embeddingService: {
    embedDocuments: jest.Mock;
  };

  beforeEach(() => {
    txExecuteRaw = jest.fn().mockResolvedValue(1);
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: txExecuteRaw,
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    embeddingService = {
      embedDocuments: jest.fn(),
    };
    service = new KnowledgeBaseService(
      prisma as never,
      embeddingService as never,
    );
  });

  it('ingest lần đầu: chunk hóa, sinh vector 1024 chiều và thêm mới trong transaction', async () => {
    const p1 = 'Đoạn một quy định về điều kiện đổi trả sản phẩm nguyên tem.';
    const p2 = 'Đoạn hai quy định về thời hạn xử lý hoàn tiền trong 3 ngày.';
    embeddingService.embedDocuments.mockResolvedValueOnce({
      vectors: [validVector(0.1), validVector(0.2)],
      totalTokens: 120,
    });

    const res = await service.ingestDocument({
      title: 'Chính sách đổi trả',
      docType: 'POLICY',
      content: `${p1}\n\n${p2}`,
      chunkOptions: { maxChars: 70, overlapChars: 0 },
    });

    expect(res.chunksCreated).toBe(2);
    expect(res.chunksUpdated).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it('re-ingest cùng nội dung (idempotent): không gọi lại embeddingService và không tạo bản sao trùng', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        chunkIndex: 0,
        content: 'Khách hàng được đổi trả trong 7 ngày.',
        hasEmbedding: true,
      },
    ]);

    const res = await service.ingestDocument({
      title: 'Chính sách đổi trả',
      docType: 'POLICY',
      content: 'Khách hàng được đổi trả trong 7 ngày.',
    });

    expect(res.chunksCreated).toBe(0);
    expect(res.chunksUpdated).toBe(0);
    expect(res.chunksUnchanged).toBe(1);
    expect(embeddingService.embedDocuments).not.toHaveBeenCalled();
    expect(txExecuteRaw).not.toHaveBeenCalled();
  });

  it('cập nhật nội dung policy: chỉ re-embed chunk thay đổi và cập nhật đúng vector mới (không giữ vector cũ)', async () => {
    const chunk0 = 'Đoạn 1 giữ nguyên nội dung chính sách kiểm tra ngoại quan.';
    const chunk1New =
      'Đoạn 2 cập nhật chính sách mới cho phép đổi trả trong 14 ngày.';

    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        chunkIndex: 0,
        content: chunk0,
        hasEmbedding: true,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        chunkIndex: 1,
        content: 'Đoạn 2 nội dung cũ 7 ngày.',
        hasEmbedding: true,
      },
    ]);

    embeddingService.embedDocuments.mockResolvedValueOnce({
      vectors: [validVector(0.5)],
      totalTokens: 45,
    });

    const res = await service.ingestDocument({
      title: 'Chính sách đổi trả',
      docType: 'POLICY',
      content: `${chunk0}\n\n${chunk1New}`,
      chunkOptions: { maxChars: 70, overlapChars: 0 },
    });

    // Chỉ gọi embedDocuments cho đúng 1 chunk bị thay đổi
    expect(embeddingService.embedDocuments).toHaveBeenCalledWith([chunk1New]);
    expect(res.chunksCreated).toBe(0);
    expect(res.chunksUpdated).toBe(1);
    expect(res.chunksUnchanged).toBe(1);
    expect(txExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it('từ chối ngay khi vector trả về thiếu hoặc sai chiều (không phải 1024), tuyệt đối không ghi dữ liệu lỗi vào DB', async () => {
    embeddingService.embedDocuments.mockResolvedValueOnce({
      vectors: [[0.1, 0.2, 0.3]], // Sai chiều (3 != 1024)
      totalTokens: 10,
    });

    await expect(
      service.ingestDocument({
        title: 'Chính sách bảo hành',
        docType: 'POLICY',
        content: 'Bảo hành 12 tháng chính hãng.',
      }),
    ).rejects.toThrow(/1024/);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(txExecuteRaw).not.toHaveBeenCalled();
  });

  it('rollback toàn bộ transaction nếu xảy ra lỗi DB ở giữa các chunk (không để lại nửa bộ dữ liệu)', async () => {
    const committedStatements: unknown[] = [];
    prisma.$transaction.mockImplementationOnce(
      async (cb: (tx: { $executeRaw: jest.Mock }) => Promise<void>) => {
        const staged: unknown[] = [];
        const tx = {
          $executeRaw: jest
            .fn()
            .mockImplementationOnce((sql: unknown) => {
              staged.push(sql);
              return Promise.resolve(1);
            })
            .mockRejectedValueOnce(new Error('DB connection lost on chunk 2')),
        };
        await cb(tx);
        committedStatements.push(...staged);
      },
    );

    const p1 = 'Chunk thứ nhất mô tả thời gian giao hàng nội thành 24h.';
    const p2 = 'Chunk thứ hai mô tả thời gian giao hàng liên tỉnh 3-5 ngày.';
    embeddingService.embedDocuments.mockResolvedValueOnce({
      vectors: [validVector(0.1), validVector(0.2)],
      totalTokens: 80,
    });

    await expect(
      service.ingestDocument({
        title: 'Chính sách giao hàng',
        docType: 'SHIPPING',
        content: `${p1}\n\n${p2}`,
        chunkOptions: { maxChars: 70, overlapChars: 0 },
      }),
    ).rejects.toThrow('DB connection lost on chunk 2');

    // Không có câu lệnh nào được commit khi transaction thất bại giữa chừng
    expect(committedStatements).toHaveLength(0);
  });
});
