// =============================================================================
// Các REST API quản lý DANH MỤC SẢN PHẨM, gốc đường dẫn "/categories":
//
//   GET    /categories              Danh sách phẳng (công khai, chỉ danh mục hiển thị)
//   GET    /categories/tree         Danh sách dạng cây (công khai, chỉ danh mục hiển thị)
//   GET    /categories/manage       Danh sách đầy đủ kèm số sản phẩm   (chỉ ADMIN)
//   GET    /categories/manage/:id   Chi tiết 1 danh mục                (chỉ ADMIN)
//   POST   /categories              Tạo danh mục                       (chỉ ADMIN)
//   PUT    /categories/:id          Cập nhật từng phần / chuyển nhánh  (chỉ ADMIN)
//   DELETE /categories/:id          Xóa danh mục (khi trống)           (chỉ ADMIN)
//
// PHÂN QUYỀN:
// - Hai endpoint GET công khai gắn @Public() để Storefront (khách chưa đăng nhập) dựng menu danh mục. 
// - Chúng chỉ trả id, name, slug, parentId 
// — Không lộ thông tin quản trị — và chỉ gồm danh mục đang hiển thị.
// - Mọi endpoint còn lại chỉ ADMIN (Nhân viên kho và Khách hàng nhận HTTP 403).
// - Guard gắn ở mức CLASS: JwtAuthGuard chạy trước RolesGuard. Endpoint có
//   @Public() được JwtAuthGuard cho qua; RolesGuard không thấy metadata @Roles
//   nên cũng cho qua.
//
// VÌ SAO ĐƯỜNG DẪN QUẢN TRỊ LÀ "manage":
// - Nếu dùng "GET /categories/:id" thì "tree" sẽ bị hiểu nhầm là một :id. 
// - Tách "manage/:id" và khai báo "tree" trước giúp định tuyến không nhập nhằng.
//
// CONTROLLER KHÔNG chứa nghiệp vụ: mọi kiểm tra và truy vấn CSDL nằm trong CategoriesService. 
// DTO được import dạng GIÁ TRỊ (không dùng "import type") vì ValidationPipe cần class thật lúc chạy để đọc decorator validate.
// =============================================================================

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards,} from '@nestjs/common';
import { UserRole, type Category } from '@prisma/client';
import { Public } from '../core/decorators/public.decorator';
import { Roles } from '../core/decorators/roles.decorator';
import { JwtAuthGuard } from '../core/guards/jwt-auth.guard';
import { RolesGuard } from '../core/guards/roles.guard';
import { CategoriesService, type AdminCategory, type PublicCategory, type PublicCategoryNode, } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ==========================================================================
  // 1. Xem công khai (Storefront — Không cần đăng nhập)
  // ==========================================================================

  // Danh sách phẳng các danh mục đang hiển thị (id, name, slug, parentId).
  @Public()
  @Get()
  async findAllPublic(): Promise<PublicCategory[]> {
    return this.categoriesService.findAllPublic();
  }

  // Cây danh mục đang hiển thị, mỗi nút có mảng "children".
  @Public()
  @Get('tree')
  async findTreePublic(): Promise<PublicCategoryNode[]> {
    return this.categoriesService.findTreePublic();
  }

  // ==========================================================================
  // 2. Xem quản trị (CHỈ ADMIN)
  // ==========================================================================

  // Danh sách đầy đủ, kể cả danh mục đang ẩn, kèm productCount và childCount.
  @Get('manage')
  @Roles(UserRole.ADMIN)
  async findAllForAdmin(): Promise<AdminCategory[]> {
    return this.categoriesService.findAllForAdmin();
  }

  // Chi tiết 1 danh mục. Không tồn tại -> HTTP 404.
  @Get('manage/:id')
  @Roles(UserRole.ADMIN)
  async findOneForAdmin(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminCategory> {
    return this.categoriesService.findOneForAdmin(id);
  }

  // ==========================================================================
  // 3. Ghi (CHỈ ADMIN)
  // ==========================================================================

  // Tạo danh mục. Trả HTTP 201 cùng thông tin danh mục vừa tạo.
  // Cha không tồn tại -> 400; trùng tên trong cùng cha hoặc trùng slug -> 409.
  @Post()
  @Roles(UserRole.ADMIN)
  async create(@Body() input: CreateCategoryDto): Promise<Category> {
    return this.categoriesService.create(input);
  }

  // Cập nhật từng phần (đổi tên, slug, chuyển nhánh, ẩn/hiện). 
  // Dùng PUT theo hợp đồng API nhóm đã thống nhất. Chuyển vào chính nó -> 400; vào con cháu của nó (tạo vòng lặp) hoặc trùng tên / slug -> 409.
  @Put(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categoriesService.update(id, input);
  }

  // Xóa CỨNG danh mục. 
  // Trả HTTP 204. Còn sản phẩm hoặc còn danh mục con -> 409 (muốn gỡ khỏi Storefront mà giữ dữ liệu: PUT với { "isActive": false }).
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.categoriesService.remove(id);
  }
}