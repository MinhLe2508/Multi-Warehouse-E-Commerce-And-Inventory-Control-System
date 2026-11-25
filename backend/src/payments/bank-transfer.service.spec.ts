import { Prisma } from '@prisma/client';
import type { InventoryChangeEmitter } from '../inventory/inventory-change-emitter.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StockReservationService } from '../stock-reservation/stock-reservation.service';
import { BankTransferService } from './bank-transfer.service';

const transactionRef = 'MM0A123456789ABCDEF012';
const account = { accountNumber: '0123456789', accountName: 'MULTIMART' };

describe('Thông tin và đối soát VietQR theo ngân hàng của đơn', () => {
  it('hiển thị cùng nội dung VietinBank/TKP trên ảnh QR và khi sao chép', async () => {
    const prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          transactionRef,
          amount: new Prisma.Decimal(79_000),
          gatewayResponse: {
            ...account,
            bankBin: '970415',
            memoPrefix: 'TKP001',
          },
        }),
      },
    };
    const service = new BankTransferService(
      prisma as unknown as PrismaService,
      {} as StockReservationService,
      {} as InventoryChangeEmitter,
    );
    const result = await service.instructions('customer', 'order');
    const expectedMemo = 'SEVQR TKP001 ' + transactionRef;
    expect(result.bankName).toBe('VietinBank');
    expect(result.transferMemo).toBe(expectedMemo);
    expect(new URL(result.qrImage).searchParams.get('des')).toBe(expectedMemo);
  });

  it('bỏ qua giao dịch đúng số tài khoản ở ngân hàng khác hoặc sai VA', async () => {
    const now = new Date('2026-11-25T05:00:00Z');
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      payment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'payment',
          gatewayResponse: {
            ...account,
            bankBin: '970422',
            virtualAccount: 'MB001ABC',
          },
          status: 'PENDING',
          currency: 'VND',
          amount: new Prisma.Decimal(79_000),
          order: {
            status: 'PENDING_PAYMENT',
            reservationExpiresAt: new Date(now.getTime() + 60_000),
            createdAt: new Date(now.getTime() - 60_000),
            reservations: [],
            currency: 'VND',
            grandTotal: new Prisma.Decimal(79_000),
          },
        }),
      },
      bankTransferReceipt: { createMany },
    };
    const prisma = {
      payment: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'payment', orderId: 'order' }),
      },
      $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
    };
    const service = new BankTransferService(
      prisma as unknown as PrismaService,
      {} as StockReservationService,
      {} as InventoryChangeEmitter,
    );
    const transfer = {
      transferCode: transactionRef,
      accountNumber: account.accountNumber,
      bankBin: '970422',
      virtualAccount: 'MB001ABC',
      receivedAt: now,
      amount: 79_000,
      bankReference: 'REF001',
    };
    await expect(
      service.record({ ...transfer, bankBin: '970436' }),
    ).resolves.toMatchObject({ applied: false, duplicate: false });
    await expect(
      service.record({ ...transfer, virtualAccount: 'MB002ABC' }),
    ).resolves.toMatchObject({ applied: false, duplicate: false });
    expect(createMany).not.toHaveBeenCalled();
    await expect(service.record(transfer)).resolves.toMatchObject({
      duplicate: true,
    });
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bankBin: '970422',
          accountNumber: account.accountNumber,
          issue: null,
        }),
      }),
    );
  });
});
