import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { MAX_VND_TRANSFER, TRANSFER_CODE_PATTERN } from './vietqr';
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
    accountNumber,
    referenceCode,
    transactionDate,
    transferAmount,
  } = payload as Record<string, unknown>;
  if (
    transferType !== 'in' ||
    typeof gateway !== 'string' ||
    !['VIETCOMBANK', 'VCB', VIETCOMBANK.bin].includes(
      gateway.toUpperCase().trim(),
    )
  ) {
    return null;
  }

  const possibleCodes = new Set(
    typeof content === 'string'
      ? (content.toUpperCase().match(/\bMM[A-F0-9]{20}\b/g) ?? [])
      : [],
  );
  if (
    typeof code === 'string' &&
    TRANSFER_CODE_PATTERN.test(code.trim().toUpperCase())
  ) {
    possibleCodes.add(code.trim().toUpperCase());
  }
  if (possibleCodes.size !== 1) return null;

  const receivedAt =
    typeof transactionDate === 'string' &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(transactionDate)
      ? new Date(transactionDate.replace(' ', 'T') + '+07:00')
      : new Date(NaN);
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
    !Number.isFinite(receivedAt.getTime())
  ) {
    throw new BadRequestException('Dữ liệu giao dịch không hợp lệ.');
  }

  const bankReference =
    typeof referenceCode === 'string'
      ? referenceCode.trim().replace(/\s+/g, '').toUpperCase()
      : '';
  return {
    transferCode: [...possibleCodes][0],
    providerId: String(id),
    accountNumber,
    receivedAt,
    amount: transferAmount,
    ...(bankReference && bankReference.length <= 100 && { bankReference }),
  };
}
