import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';
import { CheckoutQuoteDto, trimCheckoutText as trim } from './checkout.dto';

/**
  Body của POST /orders (docs/api/openapi.yaml - CreateOrderRequest).

  Máy chủ xác nhận giá, tổng tiền, kho và tồn kho trước khi tạo đơn.
  ValidationPipe toàn cục dùng forbidNonWhitelisted nên field thừa bị từ chối (400).
 */
export class CreateOrderDto extends CheckoutQuoteDto {
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

  @IsOptional()
  @IsUUID()
  shippingWarehouseId?: string;

  @IsOptional()
  @Matches(/^\d{1,12}\.\d{2}$/)
  expectedTotal?: string;

  @IsOptional()
  @IsIn([
    PaymentMethod.COD,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.MOCK_CARD,
    PaymentMethod.MOCK_EWALLET,
  ])
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsUUID('4')
  checkoutId?: string;
}
