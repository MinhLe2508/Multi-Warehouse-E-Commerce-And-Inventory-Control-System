import { IsInt, Min, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateInventoryDto {
  @IsInt({ message: 'Số lượng tồn kho mới (newStock) phải là số nguyên' })
  @Min(0, { message: 'Số lượng tồn kho mới không được là số âm (NFR-05.2)' })
  newStock!: number;

  @IsInt({ message: 'Phiên bản kỳ vọng (expectedVersion) phải là số nguyên' })
  @Min(1, { message: 'expectedVersion phải lớn hơn hoặc bằng 1' })
  expectedVersion!: number;

  @IsString({ message: 'Lý do điều chỉnh (note) phải là chuỗi ký tự' })
  @MinLength(5, { message: 'Lý do điều chỉnh bắt buộc tối thiểu 5 ký tự (FR-INV-01)' })
  @MaxLength(500, { message: 'Lý do điều chỉnh tối đa 500 ký tự' })
  note!: string;
}
