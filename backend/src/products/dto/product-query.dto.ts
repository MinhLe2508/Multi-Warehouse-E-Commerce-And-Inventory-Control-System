import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsIn(['default', 'price-asc', 'price-desc', 'name-asc'])
  sort: 'default' | 'price-asc' | 'price-desc' | 'name-asc' = 'default';

  @IsOptional()
  @IsIn(['true'])
  inStock?: 'true';

  @IsOptional()
  @IsIn(['true'])
  onSale?: 'true';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  maxPrice?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 12;
}
