import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  optionalQueryBoolean,
  QueryInventorySummaryDto,
} from './query-inventory-summary.dto';

export const MAX_INVENTORY_OFFSET = 2_147_483_647;

function optionalInteger({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const number = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(number) ? number : value;
}

export class QueryInventoryDto extends QueryInventorySummaryDto {
  @Transform(optionalInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_INVENTORY_OFFSET)
  page?: number;

  @Transform(optionalInteger)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  // When a client supplies offset, it takes precedence over page.
  @Transform(optionalInteger)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INVENTORY_OFFSET)
  offset?: number;

  @Transform(optionalQueryBoolean)
  @IsOptional()
  @IsBoolean()
  includeCategory?: boolean;
}
