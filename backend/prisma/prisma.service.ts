// =============================================================================
// Tạo một Prisma Client dùng chung và biến nó thành một Service của NestJS
// Để toàn bộ backend có thể kết nối/truy vấn PostgreSQL thông qua Dependency Injection.
// =============================================================================

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// -----------------------------------------------------------------------------
// @Injectable() Đánh dấu đây là 1 "Provider" mà NestJS có thể quản lý vòng đời và tiêm (inject) vào nơi khác qua constructor.
// -----------------------------------------------------------------------------
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Logger riêng cho PrismaService, giúp khi đọc log server để phân biệt dòng log nào đến từ lớp kết nối CSDL
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });

    super({
      adapter,
      log: ['warn', 'error'],
    });
  }

  // OnModuleInit: NestJS sẽ tự động gọi hàm "onModuleInit()" này một lần duy nhất ngay sau khi module của ứng dụng được khởi tạo xong.
  // Đây là nơi "dừng" để mở kết nối tới CSDL trước (thay vì để Prisma tự kết nối "lazy" ở lần query đầu tiên), giúp phát hiện sớm lỗi cấu hình DATABASE_URL ngay lưc khởi động server thay vì đợi đến request đầu tiên của người dùng mới báo lỗi.
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Đã kết nối tới CSDL PostgreSQL thành công (Prisma).');
    } catch (error) {
      this.logger.error(
        'Không thể kết nối tới CSDL PostgreSQL.',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // OnModuleDestroy: NestJS sẽ tự động gọi hàm "onModuleDestroy()" này ngay trước khi module của ứng dụng bị hủy.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Đã ngắt kết nối CSDL PostgreSQL (Tắt Server an toàn).');
  }
}
