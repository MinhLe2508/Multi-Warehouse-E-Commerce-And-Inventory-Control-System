// =============================================================================
// DTO cho Endpoint "POST /inventory"
// Admin tạo MỘT DÒNG TỒN KHO mới, tức khai báo "sản phẩm X được bán/lưu ở kho Y" (bảng "inventory", mỗi cặp sản phẩm–kho tối đa một dòng). 
// Sản phẩm mới tạo chưa có dòng tồn kho nào cho tới khi Admin gọi Endpoint này.
//
// Quy tắc chung:
// - Không có "reservedStock", "availableStock", "version": do hệ thống quản lý (giữ chỗ do luồng đặt hàng, availableStock là cột tính sẵn của CSDL).
// - "userId" người thực hiện KHÔNG nằm trong body: lấy từ @CurrentUser ở Controller.
// - Nếu Client gửi thừa trường, ValidationPipe (forbidNonWhitelisted: true trong main.ts) sẽ từ chối request với HTTP 400.
// - Sản phẩm và kho tồn tại / kho đang hoạt động / không vượt sức chứa: kiểm tra trong InventoryService.create().
// =============================================================================

import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, } from 'class-validator';

// Giá trị lớn nhất của cột INTEGER trong PostgreSQL (2^31 - 1).
const INT4_MAX = 2147483647;

export class CreateInventoryDto {
  // Id sản phẩm (UUID). Sản phẩm phải tồn tại.
  @IsUUID(undefined, { message: 'ID sản phẩm không đúng định dạng UUID.' })
  productId!: string;

  // Id kho (UUID). Kho phải tồn tại và đang hoạt động.
  @IsUUID(undefined, { message: 'ID kho không đúng định dạng UUID.' })
  warehouseId!: string;

  // Số lượng tồn ban đầu. Không gửi thì mặc định 0 (tạo dòng rỗng, nhập hàng sau).
  @IsOptional()
  @IsInt({ message: 'Số lượng tồn ban đầu phải là số nguyên.' })
  @Min(0, { message: 'Số lượng tồn ban đầu không được âm.' })
  @Max(INT4_MAX, {
    message: `Số lượng tồn ban đầu tối đa là ${INT4_MAX}.`,
  })
  initialStock?: number;

  // Ngưỡng cảnh báo tồn thấp RIÊNG cho dòng này. Không gửi hoặc gửi null nghĩa là
  // dùng ngưỡng mặc định của kho (defaultLowStockThreshold).
  @IsOptional()
  @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên.' })
  @Min(0, { message: 'Ngưỡng cảnh báo không được âm.' })
  @Max(INT4_MAX, { message: `Ngưỡng cảnh báo tối đa là ${INT4_MAX}.` })
  threshold?: number | null;

  // Ghi chú ghi vào nhật ký tồn kho (inventory_audit_log) khi initialStock > 0.
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