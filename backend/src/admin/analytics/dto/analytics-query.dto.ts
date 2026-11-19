import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class AnalyticsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_REGEX, {
    message: 'fromDate phải có định dạng YYYY-MM-DD',
  })
  @IsDateString({ strict: true }, { message: 'fromDate phải là ngày hợp lệ' })
  fromDate?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_REGEX, {
    message: 'toDate phải có định dạng YYYY-MM-DD',
  })
  @IsDateString({ strict: true }, { message: 'toDate phải là ngày hợp lệ' })
  toDate?: string;

  @IsOptional()
  @IsUUID('4', { message: 'warehouseId phải là UUID hợp lệ' })
  warehouseId?: string;
}

export class RevenueSeriesQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['day'], { message: 'granularity hiện chỉ hỗ trợ day' })
  granularity?: 'day';
}
