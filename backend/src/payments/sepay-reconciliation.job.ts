import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BankTransferService } from './bank-transfer.service';
import {
  type IncomingTransfer,
  isVietcombank,
  parseBankDateTime,
  readBankReference,
  readTransferCode,
} from './sepay-webhook';
import { MAX_VND_TRANSFER } from './vietqr';
import { getVietQrRecipient } from './vietqr-config';

const TRANSACTIONS_URL = 'https://userapi.sepay.vn/v2/transactions';
const LOOKBACK_MS = 30 * 60_000;
const MAX_PAGES = 5;
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function readTransaction(
  value: unknown,
  bankAccountId: string,
  accountNumber: string,
): IncomingTransfer | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const transferCode = readTransferCode(row.transaction_content, row.code);
  const receivedAt = parseBankDateTime(row.transaction_date);
  const amount = row.amount_in;
  if (
    row.bank_account_id !== bankAccountId ||
    row.account_number !== accountNumber ||
    !isVietcombank(row.bank_brand_name) ||
    row.transfer_type !== 'in' ||
    row.amount_out !== 0 ||
    typeof row.id !== 'string' ||
    !UUID_PATTERN.test(row.id) ||
    !transferCode ||
    !receivedAt ||
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > MAX_VND_TRANSFER
  ) {
    return null;
  }
  return {
    providerId: 'sepay-v2:' + row.id.toLowerCase(),
    bankReference: readBankReference(row.reference_number),
    accountNumber,
    amount,
    receivedAt,
    transferCode,
  };
}

@Injectable()
export class SePayReconciliationJob {
  private readonly logger = new Logger(SePayReconciliationJob.name);

  constructor(private readonly bankTransfer: BankTransferService) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async reconcile() {
    const token = process.env.SEPAY_API_TOKEN?.trim();
    const bankAccountId =
      process.env.SEPAY_BANK_ACCOUNT_ID?.trim().toLowerCase();
    const recipient = getVietQrRecipient();
    if (
      !token ||
      !bankAccountId ||
      !UUID_PATTERN.test(bankAccountId) ||
      !recipient
    )
      return;

    const from = new Date(Date.now() - LOOKBACK_MS + 7 * 60 * 60_000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    const url = new URL(TRANSACTIONS_URL);
    url.search = new URLSearchParams({
      bank_account_id: bankAccountId,
      transfer_type: 'in',
      transaction_date_from: from,
      per_page: '100',
    }).toString();

    try {
      for (let page = 1; page <= MAX_PAGES; page++) {
        url.searchParams.set('page', String(page));
        const response = await fetch(url, {
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8_000),
          redirect: 'error',
        });
        if (!response.ok) {
          this.logger.warn(
            `SePay API trả HTTP ${response.status} khi tra giao dịch.`,
          );
          return;
        }
        const result = (await response.json()) as {
          status?: string;
          data?: unknown[];
          meta?: { pagination?: { has_more?: boolean } };
        } | null;
        const hasMore = result?.meta?.pagination?.has_more;
        if (
          result?.status !== 'success' ||
          !Array.isArray(result.data) ||
          typeof hasMore !== 'boolean'
        ) {
          this.logger.warn('Không đọc được danh sách giao dịch SePay.');
          return;
        }
        for (const row of result.data) {
          const transfer = readTransaction(
            row,
            bankAccountId,
            recipient.accountNumber,
          );
          if (!transfer) continue;
          try {
            await this.bankTransfer.record(transfer);
          } catch {
            this.logger.warn(
              'Chưa đối soát được một giao dịch SePay. Hệ thống sẽ thử lại.',
            );
          }
        }
        if (!hasMore) return;
      }
      this.logger.warn(
        'Danh sách giao dịch SePay vượt quá giới hạn đối soát mỗi lượt.',
      );
    } catch {
      this.logger.warn(
        'Chưa kết nối được API giao dịch SePay. Hệ thống sẽ thử lại.',
      );
    }
  }
}
