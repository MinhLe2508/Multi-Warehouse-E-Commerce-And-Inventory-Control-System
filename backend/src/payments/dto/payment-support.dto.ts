import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeBankReference } from '../sepay-webhook';

export class RequestPaymentSupportDto {
  @Transform(({ value }) =>
    typeof value === 'string'
      ? normalizeBankReference(value) || undefined
      : value,
  )
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9._/-]{3,100}$/, {
    message: 'Mã giao dịch ngân hàng không hợp lệ.',
  })
  bankReference?: string;
}

export class ClosePaymentSupportDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  note!: string;
}
