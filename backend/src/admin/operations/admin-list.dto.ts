import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  InventoryChangeReason,
  PaymentMethod,
  PaymentStatus,
  ReservationStatus,
} from '@prisma/client';

export class AdminPageQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AdminListQuery extends AdminPageQuery {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;
}

class WarehouseListQuery extends AdminListQuery {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

export class PaymentListQuery extends AdminListQuery {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class ReservationListQuery extends WarehouseListQuery {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;
}

export class InventoryAuditListQuery extends WarehouseListQuery {
  @IsOptional()
  @IsEnum(InventoryChangeReason)
  reason?: InventoryChangeReason;
}

export class CustomerListQuery extends AdminListQuery {
  @IsOptional()
  @IsIn(['ACTIVE', 'LOCKED', 'PENDING_VERIFICATION'])
  status?: 'ACTIVE' | 'LOCKED' | 'PENDING_VERIFICATION';
}

export class ChatListQuery extends AdminListQuery {
  @IsOptional()
  @IsIn(['ESCALATED', 'AUTOMATED'])
  handling?: 'ESCALATED' | 'AUTOMATED';
}

export class KnowledgeListQuery extends AdminListQuery {
  @IsOptional()
  @IsIn(['ACTIVE', 'HIDDEN'])
  status?: 'ACTIVE' | 'HIDDEN';
}
