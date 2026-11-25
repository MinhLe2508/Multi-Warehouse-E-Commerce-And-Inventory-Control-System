import type { VietQrRecipient } from './vietqr-config';

export const TRANSFER_CODE_PATTERN = /^[A-Z]{2,5}[A-F0-9]{20}$/;
export const TRANSFER_CODE_IN_MEMO =
  /(?<![A-Z0-9])[A-Z]{2,5}[A-F0-9]{20}(?![A-Z0-9])/g;
export const MAX_VND_TRANSFER = 999_999_999_999;

export function transferCodeForOrder(orderCode: string): string {
  const prefix = process.env.SEPAY_PAYMENT_PREFIX?.trim().toUpperCase() ?? '';
  return (/^[A-Z]{2,5}$/.test(prefix) ? prefix : 'MM') + orderCode.slice(4);
}

export function buildVietQrMemo(
  recipient: VietQrRecipient,
  code: string,
): string {
  return [
    // VietinBank requires this marker for notifying individual/merchant accounts.
    recipient.bankBin === '970415' ? 'SEVQR' : null,
    recipient.memoPrefix,
    code,
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildSePayQrUrl(
  bankBin: string,
  recipientNumber: string,
  amount: number,
  transferMemo: string,
): string {
  const url = new URL('https://vietqr.app/img');
  url.search = new URLSearchParams({
    acc: recipientNumber,
    bank: bankBin,
    amount: String(amount),
    des: transferMemo,
    template: 'compact',
  }).toString();
  return url.href;
}
