import { Test, TestingModule } from '@nestjs/testing';
import { RetrievalService } from './retrieval.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

describe('RetrievalService', () => {
  let service: RetrievalService;
  let prisma: { $queryRaw: jest.Mock };
  let embeddingService: { embedQuery: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
    };
    embeddingService = {
      embedQuery: jest.fn().mockResolvedValue(new Array(1024).fill(0.02)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetrievalService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmbeddingService, useValue: embeddingService },
      ],
    }).compile();

    service = module.get<RetrievalService>(RetrievalService);
  });

  it('trả về mảng rỗng nếu câu truy vấn rỗng', async () => {
    const result = await service.searchKnowledgeBase('   ');
    expect(result.documents).toHaveLength(0);
    expect(result.hasHighConfidence).toBe(false);
    expect(embeddingService.embedQuery).not.toHaveBeenCalled();
  });

  it('gọi pgvector cosine similarity và map kết quả chính xác', async () => {
    const mockRows = [
      {
        id: 'doc-uuid-1',
        title: 'Chính sách hoàn tiền',
        docType: 'POLICY',
        chunkIndex: 0,
        content: 'Hoàn tiền trong 3 ngày làm việc sau khi nhận lại hàng.',
        sourceUrl: 'https://example.com/refund',
        similarity: 0.88,
      },
      {
        id: 'doc-uuid-2',
        title: 'Quy trình đổi trả',
        docType: 'POLICY',
        chunkIndex: 1,
        content: 'Đổi trả miễn phí tại bưu cục gần nhất.',
        sourceUrl: null,
        similarity: 0.72,
      },
    ];

    prisma.$queryRaw.mockResolvedValueOnce(mockRows);

    const result = await service.searchKnowledgeBase('Làm sao để hoàn tiền?');

    expect(embeddingService.embedQuery).toHaveBeenCalledWith('Làm sao để hoàn tiền?');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].title).toBe('Chính sách hoàn tiền');
    expect(result.documents[0].similarity).toBe(0.88);
    expect(result.hasHighConfidence).toBe(true); // 0.88 >= 0.75
  });

  it('formatContextForPrompt hiển thị đầy đủ thông tin tài liệu', () => {
    const docs = [
      {
        id: '1',
        title: 'Vận chuyển',
        docType: 'SHIPPING',
        chunkIndex: 0,
        content: 'Giao hàng trong 24h đối với nội thành.',
        similarity: 0.825,
      },
    ];

    const context = service.formatContextForPrompt(docs);
    expect(context).toContain('[Tài liệu 1: Vận chuyển (SHIPPING) | Độ phù hợp: 82.5%]');
    expect(context).toContain('Giao hàng trong 24h đối với nội thành.');
  });
});

