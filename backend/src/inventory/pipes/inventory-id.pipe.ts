import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';

const MAX_BIGINT = 9223372036854775807n;

// Preserve the string: converting a BIGINT ID to Number loses precision.
export function parseInventoryId(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    !/^[1-9][0-9]{0,18}$/.test(raw) ||
    BigInt(raw) > MAX_BIGINT
  ) {
    throw new BadRequestException('ID tồn kho không hợp lệ.');
  }
  return raw;
}

@Injectable()
export class InventoryIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    return parseInventoryId(value);
  }
}
