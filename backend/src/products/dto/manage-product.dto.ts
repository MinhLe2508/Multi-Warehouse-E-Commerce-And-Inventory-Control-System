import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const money = /^\d{1,12}(\.\d{1,2})?$/;
const percent = /^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  sku!: string;
  @IsString()
  @MaxLength(255)
  @Matches(/\S/)
  name!: string;
  @IsString()
  @MaxLength(280)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
  @IsString()
  @Matches(money)
  basePrice!: string;
  @IsString()
  @Matches(money)
  costPrice!: string;
  @IsUUID()
  categoryId!: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @Matches(percent)
  discountPercent?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  @Matches(/^(?:\/(?!\/)|https?:\/\/)/)
  imageUrl?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

// ValidateIf skips undefined only: null must not bypass required DB constraints.
export class UpdateProductDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  sku?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(255)
  @Matches(/\S/)
  name?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(280)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @Matches(money)
  basePrice?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @Matches(money)
  costPrice?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsUUID()
  categoryId?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @Matches(percent)
  discountPercent?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(500)
  @Matches(/^(?:\/(?!\/)|https?:\/\/)/)
  imageUrl?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
