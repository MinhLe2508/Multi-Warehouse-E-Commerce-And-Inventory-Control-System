import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { authorizeSePay, readSePayTransfer } from './sepay-webhook';
import { buildVietQr } from './vietqr';

const memo = 'MM0A123456789ABCDEF012';

describe('Chuyển khoản VietQR', () => {
  it('mã hóa đúng số tài khoản, 100.000 VND, nội dung và CRC', () => {
    expect(buildVietQr('0123456789', 100000, memo)).toBe(
      '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA530370454061000005802VN62260822MM0A123456789ABCDEF0126304017A',
    );
    expect(() => buildVietQr('0123456789', 1.01, memo)).toThrow();
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
      gateway: 'Vietcombank',
      transferType: 'in',
      accountNumber: '0123456789',
      content: 'ND ' + memo,
      transactionDate: '2026-11-20 17:10:01',
      transferAmount: 100000,
      referenceCode: ' FT 701 ',
    };
    expect(readSePayTransfer(base)).toMatchObject({
      transferCode: memo,
      amount: 100000,
      accountNumber: '0123456789',
      bankReference: 'FT701',
      providerId: '701',
      receivedAt: new Date('2026-11-20T10:10:01Z'),
    });
    expect(readSePayTransfer({ ...base, transferType: 'out' })).toBeNull();
    expect(
      readSePayTransfer({ ...base, code: 'MM00000000000000000000' }),
    ).toBeNull();
  });
});
