import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

// Cắt khoảng trắng đầu/cuối trước khi kiểm tra (chuỗi toàn khoảng trắng sẽ bị IsNotEmpty chặn).
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
  Body của POST /orders (docs/api/openapi.yaml - CreateOrderRequest).

  Không nhận userId, giá, tổng tiền, warehouseId, inventoryId hay TTL từ khách.
  ValidationPipe toàn cục dùng forbidNonWhitelisted nên field thừa bị từ chối (400).
 */
export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Đơn hàng phải có ít nhất 1 sản phẩm.' })
  @ArrayMaxSize(50, { message: 'Đơn hàng tối đa 50 sản phẩm khác nhau.' })
  @ArrayUnique((item: CreateOrderItemDto) => item.productId, {
    message: 'productId bị trùng trong đơn hàng.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'shippingRecipient không được để trống.' })
  @MaxLength(150)
  shippingRecipient: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'shippingPhone phải gồm 9-15 chữ số, có thể bắt đầu bằng dấu +.',
  })
  shippingPhone: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'shippingAddress không được để trống.' })
  @MaxLength(500)
  shippingAddress: string;

  // Tùy chọn: dùng để ưu tiên chọn kho cùng khu vực.
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'shippingRegion không được là chuỗi rỗng.' })
  @MaxLength(100)
  shippingRegion?: string;
}
