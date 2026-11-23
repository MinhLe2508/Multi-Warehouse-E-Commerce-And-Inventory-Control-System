import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class QueryAdminOrdersDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'warehouseId phải là UUID hợp lệ' })
  warehouseId?: string;

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status không hợp lệ' })
  status?: OrderStatus;

  @IsOptional()
  @IsIn(['HOLDING', 'EXPIRING', 'EXPIRED'])
  reservation?: 'HOLDING' | 'EXPIRING' | 'EXPIRED';

  @IsOptional()
  @IsIn(['OPEN'])
  paymentSupport?: 'OPEN';

  @IsOptional()
  @IsIn(['true'])
  fulfillable?: 'true';

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'from phải có định dạng YYYY-MM-DD' })
  @IsDateString({ strict: true }, { message: 'from phải là ngày hợp lệ' })
  from?: string;

  @IsOptional()
  @Matches(DATE_REGEX, { message: 'to phải có định dạng YYYY-MM-DD' })
  @IsDateString({ strict: true }, { message: 'to phải là ngày hợp lệ' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
