import { VIETCOMBANK } from './vietqr-config';

export const TRANSFER_CODE_PATTERN = /^MM[A-F0-9]{20}$/;
export const MAX_VND_TRANSFER = 999_999_999_999;

export function transferCodeForOrder(orderCode: string): string {
  return 'MM' + orderCode.slice(4);
}

function field(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

// NAPAS QR IBFT to account (QRIBFTTA). The memo maps a transfer to one order.
export function buildVietQr(
  accountNumber: string,
  amount: number,
  code: string,
): string {
  if (
    !/^\d{6,19}$/.test(accountNumber) ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > MAX_VND_TRANSFER ||
    !TRANSFER_CODE_PATTERN.test(code)
  ) {
    throw new Error('Thông tin VietQR không hợp lệ.');
  }
  const account = field('00', VIETCOMBANK.bin) + field('01', accountNumber);
  const network =
    field('00', 'A000000727') + field('01', account) + field('02', 'QRIBFTTA');
  const data =
    field('00', '01') +
    field('01', '12') +
    field('38', network) +
    field('53', '704') +
    field('54', String(amount)) +
    field('58', 'VN') +
    field('62', field('08', code)) +
    '6304';

  let crc = 0xffff;
  for (const character of data) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
    }
  }
  return data + crc.toString(16).toUpperCase().padStart(4, '0');
}
