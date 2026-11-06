import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Nạp biến môi trường từ .env ở thư mục gốc dự án
const envCandidates = [
  path.resolve(process.cwd(), '../.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(__dirname, '../../../.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// Xử lý BigInt serialization
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KnowledgeBaseService } from '../rag/knowledge-base.service';

/**
 * Script dòng lệnh độc lập để đồng bộ hóa vector embeddings cho toàn bộ kho tri thức
 * Cách chạy: npm run sync:kb
 */
async function bootstrap() {
  console.log('=== BẮT ĐẦU ĐỒNG BỘ VECTOR EMBEDDINGS (VOYAGE AI) ===');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    const kbService = app.get(KnowledgeBaseService);
    const statsBefore = await kbService.getStats();
    console.log(
      `Hiện trạng: Tổng ${statsBefore.totalChunks} chunks, đã có vector: ${statsBefore.embeddedChunks}, chờ sync: ${statsBefore.pendingChunks}`,
    );

    if (statsBefore.pendingChunks === 0) {
      console.log(
        'Tất cả các tài liệu đã có embedding đầy đủ. Không cần sync thêm.',
      );
      return;
    }

    let remaining = statsBefore.pendingChunks;
    while (remaining > 0) {
      const res = await kbService.syncMissingEmbeddings(20);
      if (res.processed === 0) break;
      remaining = res.remaining;
      console.log(
        `Đã xử lý đợt ${res.processed} chunks, còn lại: ${remaining}`,
      );
    }

    const statsAfter = await kbService.getStats();
    console.log(
      `Đồng bộ hoàn tất! Tổng cộng: ${statsAfter.embeddedChunks}/${statsAfter.totalChunks} chunks đã có vector.`,
    );
  } catch (error) {
    console.error('Lỗi khi đồng bộ embeddings:', error);
  } finally {
    await app.close();
  }
}

void bootstrap();
