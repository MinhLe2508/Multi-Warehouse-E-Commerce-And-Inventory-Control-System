// =============================================================================
// DTO cho Endpoint "PUT /inventory/:id" 
// Admin KIỂM KÊ / ĐIỀU CHỈNH một dòng tồn kho: đặt lại số lượng tồn vật lý ("stock") về con số đếm thực tế và/hoặc đổi ngưỡng cảnh báo tồn thấp RIÊNG của dòng đó.
//
// KHÁC VỚI NHẬP HÀNG: "stock" ở đây là GIÁ TRỊ TUYỆT ĐỐI MỚI (không phải số lượng cộng thêm). 
// Muốn cộng thêm hàng mới nhập, dùng POST /inventory/:id/restock (RestockInventoryDto).
//
// Endpoint dùng ngữ nghĩa CẬP NHẬT TỪNG PHẦN: trường không gửi giữ nguyên. 
// Yêu cầu có ít nhất một trong hai trường "stock" / "threshold" (kiểm tra trong InventoryService.updateStock()).
//
// PHÂN BIỆT 3 TRẠNG THÁI CỦA MỘT TRƯỜNG:
//   - Không gửi (undefined): giữ nguyên giá trị hiện tại.
//   - Gửi null (chỉ "threshold"): bỏ ngưỡng riêng, dùng ngưỡng mặc định của kho.
//   - Gửi giá trị: ghi đè bằng giá trị mới sau khi validate.
// "stock" KHÔNG cho phép null nên dùng ValidateIf thay cho IsOptional (IsOptional bỏ qua cả null và sẽ để lọt null xuống CSDL gây lỗi HTTP 500).
//
// QUY TẮC CHUNG:
// - Không có "reservedStock": số đang giữ chỗ do luồng đặt hàng quản lý. Nghiệp vụ không cho đặt "stock" thấp hơn số đang giữ chỗ (kiểm tra trong Service).
// - "userId" người thực hiện KHÔNG nằm trong body: lấy từ @CurrentUser ở Controller.
// - Nếu Client gửi thừa trường, ValidationPipe (forbidNonWhitelisted: true trong main.ts) sẽ từ chối request với HTTP 400.
// =============================================================================

import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max,MaxLength, Min, ValidateIf, } from 'class-validator';

// Giá trị lớn nhất của cột INTEGER trong PostgreSQL.
const INT4_MAX = 2147483647;

export class UpdateStockDto {
  // Số lượng tồn vật lý MỚI sau kiểm kê (giá trị tuyệt đối, không phải số cộng thêm).
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Số lượng tồn kho phải là số nguyên.' })
  @Min(0, { message: 'Số lượng tồn kho không được âm.' })
  @Max(INT4_MAX, { message: `Số lượng tồn kho tối đa là ${INT4_MAX}.` })
  stock?: number;

  // Ngưỡng cảnh báo tồn thấp RIÊNG của dòng này. Gửi null để bỏ ngưỡng riêng và dùng lại ngưỡng mặc định của kho.
  @IsOptional()
  @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên.' })
  @Min(0, { message: 'Ngưỡng cảnh báo không được âm.' })
  @Max(INT4_MAX, { message: `Ngưỡng cảnh báo tối đa là ${INT4_MAX}.` })
  threshold?: number | null;

  // Ghi chú / lý do điều chỉnh, ghi vào nhật ký tồn kho (inventory_audit_log), ví dụ "Kiểm kê cuối quý". 
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