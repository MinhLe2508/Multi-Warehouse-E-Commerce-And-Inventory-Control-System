import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const INVENTORY_STOCK_STATUSES = [
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
] as const;
export type InventoryStockStatus = (typeof INVENTORY_STOCK_STATUSES)[number];

function optionalText({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() || undefined : value;
}

function optionalFilter(param: { value: unknown }): unknown {
  const value = optionalText(param);
  return value === 'ALL' ? undefined : value;
}

function optionalUuid(param: { value: unknown }): unknown {
  const value = optionalText(param);
  return typeof value === 'string' ? value.toLowerCase() : value;
}

export function optionalQueryBoolean(param: { value: unknown }): unknown {
  const value = optionalText(param);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class QueryInventorySummaryDto {
  @Transform((param: { value: unknown }) =>
    optionalFilter(param) === undefined ? undefined : optionalUuid(param),
  )
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @Transform(optionalUuid)
  @IsOptional()
  @IsUUID()
  productId?: string;

  // Same condition as /inventory: includes rows with zero available units.
  @Transform(optionalQueryBoolean)
  @IsOptional()
  @IsBoolean()
  lowStockOnly?: boolean;

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @Transform(optionalFilter)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  category?: string;

  @Transform(optionalFilter)
  @IsOptional()
  @IsIn(INVENTORY_STOCK_STATUSES)
  status?: InventoryStockStatus;
}
