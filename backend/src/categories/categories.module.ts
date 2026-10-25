// =============================================================================
// Khai báo CategoriesModule của NestJS 
// Đóng gói Controller và Service quản lý danh mục sản phẩm thành một module
// Export CategoriesService để module Products inject và dùng lại
// Ví dụ "categoriesService.getActiveCategoryOrThrow(id, tx)" khi Admin gán danh mục cho sản phẩm.
//
// VÌ SAO KHÔNG CẦN "imports":
// - PrismaService: PrismaModule được đánh dấu @Global() và đã import ở
//   AppModule, nên inject được ở mọi module mà không khai báo lại.
// - JwtAuthGuard / RolesGuard: dùng chiến lược 'jwt' do AuthModule đăng ký với
//   Passport (đăng ký ở mức toàn ứng dụng), nên không cần import AuthModule.
// =============================================================================

import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}