// =============================================================================
// DTO cho Endpoint "PUT /categories/:id" 
// Admin cập nhật danh mục.
// Endpoint dùng ngữ nghĩa cập nhật từng phần: Chỉ những trường được gửi lên mới bị thay đổi, trường không gửi giữ nguyên giá trị cũ. 
// Yêu cầu có ít nhất một trường (kiểm tra trong CategoriesService.update())
//
// PHÂN BIỆT 3 TRẠNG THÁI CỦA MỘT TRƯỜNG:
//   - Không gửi (undefined): giữ nguyên giá trị hiện tại.
//   - Gửi null (chỉ "parentId"): chuyển danh mục thành danh mục GỐC.
//   - Gửi giá trị: ghi đè bằng giá trị mới sau khi validate.
// Với các trường KHÔNG cho phép NULL (name, slug, isActive) dùng ValidateIf
// thay cho IsOptional, vì IsOptional bỏ qua cả null và sẽ để lọt null xuống
// CSDL gây lỗi HTTP 500.
// =============================================================================

import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf, } from 'class-validator';
import { Transform } from 'class-transformer';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateCategoryDto {
  // Tên mới của danh mục.
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Tên danh mục phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Tên danh mục không được để trống.' })
  @MaxLength(150, { message: 'Tên danh mục không được vượt quá 150 ký tự.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  // Slug mới. Phải duy nhất toàn hệ thống (trùng trả HTTP 409). 
  // Không cho phép null hay chuỗi rỗng vì mọi danh mục đều phải có slug.
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Slug phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Slug không được để trống.' })
  @MaxLength(160, { message: 'Slug không được vượt quá 160 ký tự.' })
  @Matches(SLUG_PATTERN, {
    message:
      'Slug chỉ gồm chữ thường a-z, số 0-9; các nhóm ngăn cách bằng dấu gạch ngang (ví dụ: dien-thoai).',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  slug?: string;

  // Danh mục cha mới. Gửi null để chuyển thành danh mục GỐC.
  // Nghiệp vụ: không được đặt danh mục làm con của chính nó hoặc của danh mục con cháu của nó (tạo vòng lặp)
  // Kiểm tra trong CategoriesService.update().
  @IsOptional()
  @IsUUID(undefined, { message: 'ID danh mục cha không đúng định dạng UUID.' })
  parentId?: string | null;

  // Trạng thái hiển thị:
  //   - false: ẩn danh mục khỏi Storefront. Các danh mục con của nó cũng không
  //     còn hiển thị công khai (con của danh mục bị ẩn không truy cập được).
  //   - true : hiển thị lại.
  // Sản phẩm thuộc danh mục vẫn được giữ nguyên, không bị ảnh hưởng.
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'Trạng thái hiển thị phải là True hoặc False.' })
  isActive?: boolean;
}