// =============================================================================
// DTO cho Endpoint "POST /inventory/:id/restock" 
// Admin NHẬP THÊM hàng vào một dòng tồn kho. Đây là thao tác TĂNG: số lượng gửi lên được cộng thêm vào
// "stock" hiện có (khác với PUT /inventory/:id dùng UpdateStockDto để đặt lại "stock" về một con số cụ thể sau kiểm kê).
//
// Quy tắc chung:
// - Chỉ Admin được nhập hàng (quyết định thiết kế): được kiểm tra ở Controller.
// - "userId" người thực hiện KHÔNG nằm trong body: lấy từ @CurrentUser ở Controller.
// - Nếu Client gửi thừa trường, ValidationPipe (forbidNonWhitelisted: true trong main.ts) sẽ từ chối request với HTTP 400.
// - Kho phải đang hoạt động và tổng tồn sau khi nhập không được vượt sức chứa (capacity) của kho: kiểm tra trong InventoryService.restock().
// =============================================================================

import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, } from 'class-validator';

// Giá trị lớn nhất của cột INTEGER trong PostgreSQL.
const INT4_MAX = 2147483647;

export class RestockInventoryDto {
  // Số lượng nhập THÊM vào kho (phải là số nguyên dương).
  @IsInt({ message: 'Số lượng nhập phải là số nguyên.' })
  @Min(1, { message: 'Số lượng nhập phải lớn hơn 0.' })
  @Max(INT4_MAX, { message: `Số lượng nhập tối đa là ${INT4_MAX}.` })
  quantity!: number;

  // Ghi chú ghi vào nhật ký tồn kho (inventory_audit_log), ví dụ mã phiếu nhập.
  // Chuỗi rỗng coi như không có ghi chú.
  @IsOptional()
  @IsString({ message: 'Ghi chú phải là chuỗi ký tự.' })
  @MaxLength(500, { message: 'Ghi chú không được vượt quá 500 ký tự.' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  note?: string;
}