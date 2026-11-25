// Banks marked supported by SePay at https://vietqr.app/banks.json.
const BANKS = [
  ['ICB', '970415', 'VietinBank', 'CTG'],
  ['VCB', '970436', 'Vietcombank'],
  ['MB', '970422', 'MBBank'],
  ['ACB', '970416', 'ACB'],
  ['VPB', '970432', 'VPBank'],
  ['TPB', '970423', 'TPBank'],
  ['MSB', '970426', 'MSB'],
  ['LPB', '970449', 'LienVietPostBank', 'LPBank'],
  ['VCCB', '970454', 'VietCapitalBank', 'BVBank'],
  ['BIDV', '970418', 'BIDV'],
  ['STB', '970403', 'Sacombank'],
  ['VIB', '970441', 'VIB'],
  ['HDB', '970437', 'HDBank'],
  ['SEAB', '970440', 'SeABank'],
  ['SHBVN', '970424', 'ShinhanBank'],
  ['VBA', '970405', 'Agribank'],
  ['TCB', '970407', 'Techcombank'],
  ['BAB', '970409', 'BacABank'],
  ['ABB', '970425', 'ABBANK'],
  ['EIB', '970431', 'Eximbank'],
  ['PBVN', '970439', 'PublicBank'],
  ['OCB', '970448', 'OCB'],
  ['KLB', '970452', 'KienLongBank'],
] as const;

const LEGACY_BANK_BIN = '970436';
const BANK_ACCOUNT_PATTERN = /^\d{6,19}$/;
const VIRTUAL_ACCOUNT_PATTERN = /^[A-Z0-9]{1,34}$/;
const MEMO_PREFIX_PATTERN = /^TKP[A-Z0-9]{1,12}$/;

export function readVietQrBank(value: unknown) {
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase().replace(/\s+/g, '');
  const bank = BANKS.find((aliases) =>
    aliases.some((alias) => alias.toUpperCase() === key),
  );
  return bank ? { bankBin: bank[1], bankName: bank[2] } : null;
}

export interface VietQrRecipient {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  virtualAccount?: string;
  memoPrefix?: string;
}

export function getVietQrRecipient(): VietQrRecipient | null {
  return readVietQrRecipient({
    bankBin: process.env.VIETQR_BANK?.trim() || LEGACY_BANK_BIN,
    accountNumber: process.env.VIETQR_ACCOUNT_NUMBER?.trim(),
    accountName: process.env.VIETQR_ACCOUNT_NAME?.trim(),
    virtualAccount: process.env.VIETQR_VIRTUAL_ACCOUNT?.trim() || undefined,
    memoPrefix: process.env.VIETQR_MEMO_PREFIX?.trim() || undefined,
  });
}

export function readVietQrRecipient(value: unknown): VietQrRecipient | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { bankBin, accountNumber, accountName, virtualAccount, memoPrefix } =
    value as Record<string, unknown>;
  // Payments stored before bank selection was supported were all Vietcombank.
  const bank = readVietQrBank(
    bankBin === undefined ? LEGACY_BANK_BIN : bankBin,
  );
  if (
    !bank ||
    typeof accountNumber !== 'string' ||
    !BANK_ACCOUNT_PATTERN.test(accountNumber) ||
    typeof accountName !== 'string' ||
    !accountName.length ||
    accountName.length > 100 ||
    (virtualAccount !== undefined &&
      (typeof virtualAccount !== 'string' ||
        !VIRTUAL_ACCOUNT_PATTERN.test(virtualAccount.toUpperCase()))) ||
    (memoPrefix !== undefined &&
      (typeof memoPrefix !== 'string' ||
        !MEMO_PREFIX_PATTERN.test(memoPrefix.toUpperCase()))) ||
    (virtualAccount !== undefined && memoPrefix !== undefined)
  ) {
    return null;
  }
  return {
    bankBin: bank.bankBin,
    accountNumber,
    accountName,
    ...(virtualAccount ? { virtualAccount: virtualAccount.toUpperCase() } : {}),
    ...(memoPrefix ? { memoPrefix: memoPrefix.toUpperCase() } : {}),
  };
}

export function readSePayAccountNumber(value: unknown): string | undefined {
  return typeof value === 'string' && BANK_ACCOUNT_PATTERN.test(value)
    ? value
    : undefined;
}

export function readSePayVirtualAccount(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const account = value.trim().toUpperCase();
  return VIRTUAL_ACCOUNT_PATTERN.test(account) ? account : undefined;
}

export function getSePaySecret(): string | null {
  if ((process.env.SEPAY_STRICT_AUTH?.trim() ?? '1') !== '1') return null;
  const secret = process.env.SEPAY_WEBHOOK_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export const SEPAY_DEV_CONFIRMATION = 'DEV_TEST';
export const SEPAY_DEV_RECEIPT_PREFIX = 'dev-sim:';

export function wasSePaySimulated(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    'confirmationSource' in value &&
    value.confirmationSource === SEPAY_DEV_CONFIRMATION
  );
}

export function canSimulateSePay(): boolean {
  if (
    process.env.SEPAY_ALLOW_SIMULATE !== '1' ||
    process.env.NODE_ENV !== 'development' ||
    process.env.MWH_ADMIN_LOCAL !== '1' ||
    process.connected !== true
  )
    return false;
  try {
    const database = new URL(process.env.DATABASE_URL ?? '');
    return (
      ['postgres:', 'postgresql:'].includes(database.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)
    );
  } catch {
    return false;
  }
}

export function getPaymentTimeoutMinutes(): number {
  const raw = process.env.PAYMENT_TIMEOUT_MINUTES?.trim() ?? '';
  const minutes = Number(raw);
  return /^\d{1,3}$/.test(raw) && minutes >= 1 && minutes <= 120 ? minutes : 15;
}
