import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { MAX_VND_TRANSFER } from './vietqr';
import { getSePaySecret, VIETCOMBANK } from './vietqr-config';

export interface IncomingTransfer {
  transferCode: string;
  amount: number;
  receivedAt: Date;
  bankReference?: string;
  providerId?: string;
  accountNumber?: string;
  actorId?: string;
}

export function isVietcombank(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    ['VIETCOMBANK', 'VCB', VIETCOMBANK.bin].includes(value.trim().toUpperCase())
  );
}

export function readTransferCode(...values: unknown[]): string | null {
  const codes = new Set(
    values.flatMap((value) =>
      typeof value === 'string'
        ? (value
            .toUpperCase()
            .match(/(?<![A-Z0-9])MM[A-F0-9]{20}(?![A-Z0-9])/g) ?? [])
        : [],
    ),
  );
  return codes.size === 1 ? [...codes][0] : null;
}

export function normalizeBankReference(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function readBankReference(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = normalizeBankReference(value);
  return normalized.length > 0 && normalized.length <= 100
    ? normalized
    : undefined;
}

export function parseBankDateTime(value: unknown): Date | null {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
  )
    return null;
  const localTime = value.replace(' ', 'T');
  const date = new Date(localTime + '+07:00');
  if (!Number.isFinite(date.getTime())) return null;
  const check = new Date(date.getTime() + 7 * 60 * 60_000)
    .toISOString()
    .slice(0, 19);
  return check === localTime ? date : null;
}

export function authorizeSePay(
  timestamp: string | undefined,
  signature: string | undefined,
  rawBody: Buffer | undefined,
) {
  const secret = getSePaySecret();
  if (
    !secret ||
    !rawBody ||
    !timestamp ||
    !/^\d{1,12}$/.test(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300 ||
    !signature ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature)
  ) {
    throw new UnauthorizedException('Chữ ký webhook không hợp lệ.');
  }
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(rawBody)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
    throw new UnauthorizedException('Chữ ký webhook không hợp lệ.');
  }
}

export function readSePayTransfer(payload: unknown): IncomingTransfer | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BadRequestException('Dữ liệu giao dịch không hợp lệ.');
  }
  const {
    id,
    gateway,
    transferType,
    content,
    code,
    description,
    accountNumber,
    referenceCode,
    transactionDate,
    transferAmount,
  } = payload as Record<string, unknown>;
  if (transferType !== 'in' || !isVietcombank(gateway)) return null;
  const transferCode = readTransferCode(content, code, description);
  if (!transferCode) return null;
  const receivedAt = parseBankDateTime(transactionDate);
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    typeof accountNumber !== 'string' ||
    !/^\d{6,19}$/.test(accountNumber) ||
    typeof transferAmount !== 'number' ||
    !Number.isSafeInteger(transferAmount) ||
    transferAmount < 1 ||
    transferAmount > MAX_VND_TRANSFER ||
    !receivedAt
  ) {
    throw new BadRequestException('Dữ liệu giao dịch không hợp lệ.');
  }

  return {
    transferCode,
    providerId: String(id),
    accountNumber,
    receivedAt,
    amount: transferAmount,
    bankReference: readBankReference(referenceCode),
  };
}
