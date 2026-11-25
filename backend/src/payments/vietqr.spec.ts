import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { authorizeSePay, readSePayTransfer } from './sepay-webhook';
import { buildSePayQrUrl } from './vietqr';
import { readVietQrBank, readVietQrRecipient } from './vietqr-config';

const memo = 'MM0A123456789ABCDEF012';

describe('Chuyển khoản VietQR', () => {
  it('tạo ảnh SePay compact cho đúng ngân hàng, VA, số tiền và nội dung', () => {
    const url = new URL(
      buildSePayQrUrl('970448', 'VQRQ12345678', 100000, memo),
    );
    expect(url.origin + url.pathname).toBe('https://vietqr.app/img');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      bank: '970448',
      acc: 'VQRQ12345678',
      amount: '100000',
      des: memo,
      template: 'compact',
    });
  });

  it('quy về cùng BIN và giữ ngân hàng Vietcombank cho đơn cũ', () => {
    const account = { accountName: 'MULTIMART', accountNumber: '0123456789' };
    expect(readVietQrBank('MB Bank')).toEqual({
      bankBin: '970422',
      bankName: 'MBBank',
    });
    expect(readVietQrRecipient(account)?.bankBin).toBe('970436');
    expect(
      readVietQrRecipient({ ...account, bankBin: 'không hợp lệ' }),
    ).toBeNull();
  });

  it('xác thực chữ ký trên bytes gốc và từ chối chữ ký hết hạn', () => {
    const previous = process.env.SEPAY_WEBHOOK_SECRET;
    const secret = 'unit-test-webhook-key-that-is-long-enough';
    process.env.SEPAY_WEBHOOK_SECRET = secret;
    const raw = Buffer.from('{"content": "đơn hàng"}');
    const signed = (timestamp: string) =>
      'sha256=' +
      createHmac('sha256', secret)
        .update(timestamp + '.')
        .update(raw)
        .digest('hex');
    const timestamp = String(Math.floor(Date.now() / 1000));
    try {
      expect(() =>
        authorizeSePay(timestamp, signed(timestamp), raw),
      ).not.toThrow();
      expect(() =>
        authorizeSePay(
          timestamp,
          signed(timestamp),
          Buffer.from('{"content":"đơn hàng"}'),
        ),
      ).toThrow(UnauthorizedException);
      const expired = String(Number(timestamp) - 301);
      expect(() => authorizeSePay(expired, signed(expired), raw)).toThrow(
        UnauthorizedException,
      );
    } finally {
      if (previous === undefined) delete process.env.SEPAY_WEBHOOK_SECRET;
      else process.env.SEPAY_WEBHOOK_SECRET = previous;
    }
  });

  it('chỉ nhận tiền vào có một mã đơn khớp và hiểu giờ Việt Nam', () => {
    const base = {
      id: 701,
      gateway: 'MBBank',
      transferType: 'in',
      accountNumber: '0123456789',
      subAccount: 'mb001abc',
      content: 'ND ' + memo,
      transactionDate: '2026-11-20 17:10:01',
      transferAmount: 100000,
      referenceCode: ' FT 701 ',
    };
    expect(readSePayTransfer(base)).toMatchObject({
      transferCode: memo,
      amount: 100000,
      accountNumber: '0123456789',
      bankBin: '970422',
      virtualAccount: 'MB001ABC',
      bankReference: 'FT701',
      providerId: '701',
      receivedAt: new Date('2026-11-20T10:10:01Z'),
    });
    expect(readSePayTransfer({ ...base, transferType: 'out' })).toBeNull();
    expect(readSePayTransfer({ ...base, gateway: 'Unknown bank' })).toBeNull();
    expect(
      readSePayTransfer({ ...base, code: 'MM00000000000000000000' }),
    ).toBeNull();
  });
});
