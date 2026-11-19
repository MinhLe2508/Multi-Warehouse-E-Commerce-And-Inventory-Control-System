import { IsInt, IsUUID, Max, Min } from 'class-validator';

// Một dòng trong yêu cầu tạo đơn. Khách CHỈ gửi productId + quantity;
// giá, kho (warehouseId/inventoryId) do Backend xác định.
export class CreateOrderItemDto {
  @IsUUID()
  productId: string;

  // quantity > 0. Trần 100 là giới hạn API theo contract, không phải CHECK trong DB.
  @IsInt({ message: 'quantity phải là số nguyên.' })
  @Min(1, { message: 'quantity phải lớn hơn 0.' })
  @Max(100, { message: 'quantity tối đa là 100 cho mỗi sản phẩm.' })
  quantity: number;
}
