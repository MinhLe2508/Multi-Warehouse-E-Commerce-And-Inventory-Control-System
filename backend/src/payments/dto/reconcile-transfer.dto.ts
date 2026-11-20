import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsString, Matches, Max, Min } from 'class-validator';
import { MAX_VND_TRANSFER, TRANSFER_CODE_PATTERN } from '../vietqr';

export class ReconcileTransferDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(TRANSFER_CODE_PATTERN)
  transferCode!: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9._/-]{3,100}$/)
  bankReference!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_VND_TRANSFER)
  amount!: number;

  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
  receivedAt!: string;
}
