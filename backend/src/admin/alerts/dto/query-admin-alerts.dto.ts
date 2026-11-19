import { BadRequestException } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  isUUID,
} from 'class-validator';
import {
  ALERT_LEVEL_FILTERS,
  ALERT_STATUS_FILTERS,
  type AlertLevelFilter,
  type AlertStatusFilter,
} from '../../../inventory/dto/query-inventory.dto';

export const ADMIN_ALERTS_DEFAULT_LIMIT = 50;
export const ADMIN_ALERTS_MAX_LIMIT = 100;
export const ADMIN_ALERTS_MAX_OFFSET = 1_000_000;

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class QueryAdminAlertsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsIn(ALERT_STATUS_FILTERS, {
    message: 'Status chỉ nhận OPEN, RESOLVED hoặc ALL.',
  })
  status?: AlertStatusFilter = 'OPEN';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || undefined : value,
  )
  @IsIn(ALERT_LEVEL_FILTERS, {
    message: 'Mức cảnh báo chỉ nhận WARNING hoặc CRITICAL.',
  })
  alertLevel?: AlertLevelFilter;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID(undefined, { message: 'ID kho không đúng định dạng UUID.' })
  warehouseId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt({ message: 'Limit phải là số nguyên.' })
  @Min(1, { message: 'Limit phải từ 1 trở lên.' })
  @Max(ADMIN_ALERTS_MAX_LIMIT, {
    message: `Limit tối đa là ${ADMIN_ALERTS_MAX_LIMIT}.`,
  })
  limit?: number = ADMIN_ALERTS_DEFAULT_LIMIT;

  @IsOptional()
  @Transform(emptyToUndefined)
  @Type(() => Number)
  @IsInt({ message: 'Offset phải là số nguyên.' })
  @Min(0, { message: 'Offset phải từ 0 trở lên.' })
  @Max(ADMIN_ALERTS_MAX_OFFSET, {
    message: `Offset tối đa là ${ADMIN_ALERTS_MAX_OFFSET}.`,
  })
  offset?: number = 0;
}

/**
 * Chuẩn hóa và kiểm tra chặt chẽ query cho cả trường hợp qua ValidationPipe lẫn gọi trực tiếp controller.
 */
export function normalizeAdminAlertsQuery(
  raw: Partial<Record<keyof QueryAdminAlertsDto, unknown>> = {},
): {
  status: AlertStatusFilter;
  alertLevel?: AlertLevelFilter;
  warehouseId?: string;
  limit: number;
  offset: number;
} {
  // 1. status
  let status: AlertStatusFilter = 'OPEN';
  if (raw.status !== undefined && raw.status !== null && raw.status !== '') {
    if (typeof raw.status !== 'string') {
      throw new BadRequestException('Status chỉ nhận OPEN, RESOLVED hoặc ALL.');
    }
    const normalized = raw.status.trim().toUpperCase();
    if (
      normalized !== '' &&
      !(ALERT_STATUS_FILTERS as readonly string[]).includes(normalized)
    ) {
      throw new BadRequestException('Status chỉ nhận OPEN, RESOLVED hoặc ALL.');
    }
    if (normalized !== '') {
      status = normalized as AlertStatusFilter;
    }
  }

  let alertLevel: AlertLevelFilter | undefined;
  if (raw.alertLevel !== undefined && raw.alertLevel !== null) {
    const candidate =
      typeof raw.alertLevel === 'string'
        ? raw.alertLevel.trim().toUpperCase()
        : raw.alertLevel;
    if (candidate !== '') {
      if (candidate !== 'WARNING' && candidate !== 'CRITICAL') {
        throw new BadRequestException(
          'Mức cảnh báo chỉ nhận WARNING hoặc CRITICAL.',
        );
      }
      alertLevel = candidate;
    }
  }

  // 2. warehouseId
  let warehouseId: string | undefined;
  if (raw.warehouseId !== undefined && raw.warehouseId !== null) {
    if (typeof raw.warehouseId !== 'string') {
      throw new BadRequestException('ID kho không đúng định dạng UUID.');
    }
    const candidate = raw.warehouseId.trim();
    if (candidate !== '') {
      if (!isUUID(candidate)) {
        throw new BadRequestException('ID kho không đúng định dạng UUID.');
      }
      warehouseId = candidate;
    }
  }

  // 3. limit
  let limit = ADMIN_ALERTS_DEFAULT_LIMIT;
  if (raw.limit !== undefined && raw.limit !== null && raw.limit !== '') {
    let parsed = Number.NaN;
    if (typeof raw.limit === 'number') {
      parsed = raw.limit;
    } else if (typeof raw.limit === 'string') {
      const trimmed = raw.limit.trim();
      if (trimmed === '') {
        parsed = ADMIN_ALERTS_DEFAULT_LIMIT;
      } else if (/^[-+]?\d+$/.test(trimmed)) {
        parsed = Number(trimmed);
      }
    }
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > ADMIN_ALERTS_MAX_LIMIT
    ) {
      throw new BadRequestException(
        `Limit phải là số nguyên từ 1 đến ${ADMIN_ALERTS_MAX_LIMIT}.`,
      );
    }
    limit = parsed;
  }

  // 4. offset
  let offset = 0;
  if (raw.offset !== undefined && raw.offset !== null && raw.offset !== '') {
    let parsed = Number.NaN;
    if (typeof raw.offset === 'number') {
      parsed = raw.offset;
    } else if (typeof raw.offset === 'string') {
      const trimmed = raw.offset.trim();
      if (trimmed === '') {
        parsed = 0;
      } else if (/^[-+]?\d+$/.test(trimmed)) {
        parsed = Number(trimmed);
      }
    }
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > ADMIN_ALERTS_MAX_OFFSET
    ) {
      throw new BadRequestException(
        `Offset phải là số nguyên không âm (tối đa ${ADMIN_ALERTS_MAX_OFFSET}).`,
      );
    }
    offset = parsed;
  }

  return {
    status,
    warehouseId,
    ...(alertLevel ? { alertLevel } : {}),
    limit,
    offset,
  };
}
