import { IsBoolean, IsEnum, Matches } from 'class-validator';
import { PaymentMethod } from '@prisma/client';
export class MockPaymentDto {
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  transactionRef: string;
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
  @IsBoolean()
  approved: boolean;
}
