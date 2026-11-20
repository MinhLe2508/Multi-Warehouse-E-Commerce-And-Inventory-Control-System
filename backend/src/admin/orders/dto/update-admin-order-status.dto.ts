import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateAdminOrderStatusDto {
  @IsOptional()
  @IsBoolean()
  codCollected?: boolean;

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'targetStatus không hợp lệ' })
  targetStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderStatus, { message: 'status không hợp lệ' })
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
