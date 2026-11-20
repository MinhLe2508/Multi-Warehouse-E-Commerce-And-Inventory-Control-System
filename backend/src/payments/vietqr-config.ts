export const VIETCOMBANK = { bankName: 'Vietcombank', bin: '970436' } as const;

export interface VietQrRecipient {
  accountNumber: string;
  accountName: string;
}

export function getVietQrRecipient(): VietQrRecipient | null {
  const accountNumber = process.env.VIETQR_ACCOUNT_NUMBER?.trim() ?? '';
  const accountName = process.env.VIETQR_ACCOUNT_NAME?.trim() ?? '';
  return /^\d{6,19}$/.test(accountNumber) &&
    accountName.length > 0 &&
    accountName.length <= 100
    ? { accountNumber, accountName }
    : null;
}

export function getSePaySecret(): string | null {
  const secret = process.env.SEPAY_WEBHOOK_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}
