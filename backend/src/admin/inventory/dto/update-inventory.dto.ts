import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const INT4_MAX = 2147483647;

export class UpdateInventoryDto {
  @ValidateIf((_obj, value) => value !== undefined)
  @IsInt({ message: 'Số lượng tồn kho (stock) phải là số nguyên' })
  @Min(0, { message: 'Số lượng tồn kho không được là số âm' })
  @Max(INT4_MAX)
  stock?: number;

  @ValidateIf((_obj, value) => value !== undefined)
  @IsInt({ message: 'Số lượng tồn kho mới (newStock) phải là số nguyên' })
  @Min(0, { message: 'Số lượng tồn kho mới không được là số âm' })
  @Max(INT4_MAX)
  newStock?: number;

  @IsOptional()
  @IsInt({ message: 'Ngưỡng cảnh báo phải là số nguyên' })
  @Min(0, { message: 'Ngưỡng cảnh báo không được âm' })
  @Max(INT4_MAX)
  threshold?: number | null;

  @IsOptional()
  @IsString({ message: 'Lý do điều chỉnh (note) phải là chuỗi ký tự' })
  @MaxLength(500, { message: 'Lý do điều chỉnh tối đa 500 ký tự' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  note?: string;
}
