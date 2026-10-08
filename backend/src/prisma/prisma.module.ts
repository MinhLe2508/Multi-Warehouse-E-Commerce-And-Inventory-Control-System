// Đăng ký PrismaService với NestJS và cung cấp nó cho toàn bộ backend dưới dạng một module dùng chung.
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() biến PrismaModule thành Global Module trong phạm vi ứng dụng NestJS.
// Sau khi PrismaModule được import một lần trong AppModule, PrismaService có thể
// được inject vào các module khác như AuthModule, OrderModule, InventoryModule... mà không cần khai báo imports: [PrismaModule] ở từng module
// Lưu ý: @Global() không thay thế việc export PrismaService. PrismaService vẫn phải được khai báo trong "exports" để các module khác có thể inject được

@Global()
@Module({
  // "providers" đăng ký PrismaService để NestJS quản lý và tạo instance của service này.
  // Provider mặc định của NestJS có Singleton scope, nên PrismaService sẽ được dùng như một instance dùng chung trong application context, thay vì mỗi nơi phải tự tạo một PrismaClient riêng.

  // NestJS cũng quản lý vòng đời của provider và sẽ gọi các lifecycle hook như onModuleInit() và onModuleDestroy() đã được cài đặt trong prisma.service.ts.
  providers: [PrismaService],

  // "exports" Xác định các Provider mà module này cung cấp cho các module khác
  // Trong trường hợp này, PrismaService được export để các module nghiệp vụ như AuthModule, OrderModule, InventoryModule... có thể inject PrismaService.

  // @Global() giúp các module khác không cần import PrismaModule lại, nhưng PrismaService vẫn phải được đưa vào "exports" thì Provider này mới có thể được sử dụng bên ngoài PrismaModule.
  exports: [PrismaService],
})
export class PrismaModule {}
