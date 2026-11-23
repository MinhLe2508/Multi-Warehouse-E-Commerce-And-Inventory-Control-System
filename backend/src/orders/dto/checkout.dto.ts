import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

export const trimCheckoutText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CheckoutQuoteDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Đơn hàng phải có ít nhất 1 sản phẩm.' })
  @ArrayMaxSize(50, { message: 'Đơn hàng tối đa 50 sản phẩm khác nhau.' })
  @ArrayUnique((item: CreateOrderItemDto) => item?.productId, {
    message: 'productId bị trùng trong đơn hàng.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsUUID()
  promotionId?: string;
}

export class FavoriteAddressDto {
  @Transform(trimCheckoutText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @Transform(trimCheckoutText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  shippingRecipient!: string;

  @Transform(trimCheckoutText)
  @Matches(/^\+?[0-9]{9,15}$/, {
    message: 'Số điện thoại phải gồm 9–15 chữ số.',
  })
  shippingPhone!: string;

  @Transform(trimCheckoutText)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  shippingAddress!: string;

  @IsOptional()
  @IsUUID()
  shippingWarehouseId?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
