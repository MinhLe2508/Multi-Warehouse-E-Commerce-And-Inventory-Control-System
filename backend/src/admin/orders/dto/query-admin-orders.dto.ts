import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class QueryAdminOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status không hợp lệ' })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @Matches(DATE_REGEX, { message: 'from phải có định dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_REGEX, { message: 'to phải có định dạng YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @IsString()
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

