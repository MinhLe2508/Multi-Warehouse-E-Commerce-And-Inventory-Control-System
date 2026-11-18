import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryWarehousesDto {
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'IncludeInactive chỉ nhận true hoặc false.' })
  includeInactive = false;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString({ message: 'Khu vực phải là một chuỗi ký tự.' })
  @MaxLength(100, { message: 'Khu vực không được vượt quá 100 ký tự.' })
  region?: string;
}
