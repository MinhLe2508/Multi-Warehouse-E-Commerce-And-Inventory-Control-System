// =============================================================================
// DTO cho Endpoint "POST /categories" 
// Admin tạo một danh mục sản phẩm mới. Khớp với model "Category" trong schema.prisma (bảng "categories").
//
// QUY TẮC CHUNG:
// - Chỉ Admin được tạo danh mục, nên hệ thống KHÔNG lưu "người tạo" (người tạo
//   mặc định là Admin) và KHÔNG có trường mô tả — đúng quyết định thiết kế.
// - Không có "isActive": danh mục mới luôn hiển thị (mặc định của CSDL). Ẩn /
//   hiện danh mục đi qua UpdateCategoryDto.
// - Không có "id", "createdAt", "updatedAt": do CSDL tự sinh. Nếu Client gửi
//   thừa các trường này, ValidationPipe (forbidNonWhitelisted: true trong
//   main.ts) sẽ từ chối request với HTTP 400.
// - Các thao tác chuẩn hóa dữ liệu (trim, hạ chữ thường slug...) dùng
//   @Transform, có hiệu lực nhờ "transform: true" của ValidationPipe toàn cục.
// =============================================================================

import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, } from 'class-validator';
import { Transform } from 'class-transformer';

// Định dạng slug: chữ thường và số, các nhóm ngăn cách bằng dấu gạch ngang.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  // Tên danh mục hiển thị cho khách hàng và trong trang Admin.
  // Trong CÙNG MỘT danh mục cha, tên không được trùng nhau (không phân biệt hoa thường)
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống.' })
  @MaxLength(150, { message: 'Tên danh mục không được vượt quá 150 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  // Slug cho URL thân thiện, KHÔNG bắt buộc
  // Nếu Admin tự nhập slug mà đã tồn tại thì trả HTTP 409.
  @IsOptional()
  @IsString({ message: 'Slug phải là chuỗi ký tự.' })
  @MaxLength(160, { message: 'Slug không được vượt quá 160 ký tự.' })
  @Matches(SLUG_PATTERN, {
    message:
      'Slug chỉ gồm chữ thường a-z, số 0-9; các nhóm ngăn cách bằng dấu gạch ngang (ví dụ: dien-thoai).',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === '' ? undefined : normalized;
  })
  slug?: string;

  // Id của danh mục CHA. Không gửi (hoặc gửi null) nghĩa là danh mục GỐC (cấp cao nhất). 
  // Danh mục cha phải tồn tại
  @IsOptional()
  @IsUUID(undefined, { message: 'ID danh mục cha không đúng định dạng UUID.' })
  parentId?: string | null;
}