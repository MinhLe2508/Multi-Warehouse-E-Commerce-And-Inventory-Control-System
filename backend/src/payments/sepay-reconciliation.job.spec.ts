import type { BankTransferService } from './bank-transfer.service';
import { SePayReconciliationJob } from './sepay-reconciliation.job';

describe('SePayReconciliationJob', () => {
  const env = process.env;
  const bankAccountId = '068a89e2-a9f8-4a4c-bb44-940c65746c64';
  const accountNumber = '0123456789';
  const transferCode = 'MM0A123456789ABCDEF012';
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const transaction = {
    id,
    transfer_type: 'in',
    bank_brand_name: 'Vietcombank',
    bank_account_id: bankAccountId,
    account_number: accountNumber,
    transaction_content: 'MBVCB.01.' + transferCode,
    transaction_date: '2026-11-21 14:41:18',
    amount_in: 79_000,
    amount_out: 0,
    reference_number: ' FT 123 ',
  };
  const response = (data: unknown[], hasMore: boolean) =>
    Response.json({
      status: 'success',
      data,
      meta: { pagination: { has_more: hasMore } },
    });

  beforeEach(() => {
    process.env = {
      ...env,
      SEPAY_API_TOKEN: 'fixture-token',
      SEPAY_BANK_ACCOUNT_ID: bankAccountId,
      VIETQR_ACCOUNT_NUMBER: accountNumber,
      VIETQR_ACCOUNT_NAME: 'MULTIMART',
    };
  });

  afterEach(() => {
    process.env = env;
    jest.restoreAllMocks();
  });

  it('tra tiền vào trên đúng tài khoản, đọc trang tiếp theo và chuẩn hóa giao dịch trước khi đối soát', async () => {
    const requests: URL[] = [];
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = new URL(String(input));
        requests.push(url);
        return requests.length === 1
          ? response(
              [
                { ...transaction, account_number: '9999999999' },
                { ...transaction, amount_out: 79000, transfer_type: 'out' },
                { ...transaction, transaction_date: '2026-02-30 10:00:00' },
              ],
              true,
            )
          : response([transaction], false);
      });
    const record = jest.fn();
    await new SePayReconciliationJob({
      record,
    } as unknown as BankTransferService).reconcile();

    expect(requests.map((request) => request.searchParams.get('page'))).toEqual(
      ['1', '2'],
    );
    expect(requests[0].origin).toBe('https://userapi.sepay.vn');
    expect(requests[0].searchParams.get('bank_account_id')).toBe(bankAccountId);
    expect(requests[0].searchParams.get('transfer_type')).toBe('in');
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer fixture-token',
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith({
      providerId: 'sepay-v2:' + id,
      bankReference: 'FT123',
      transferCode,
      receivedAt: new Date('2026-11-21T07:41:18Z'),
      amount: 79000,
      accountNumber,
    });
  });

  it('không gọi API khi chưa cấu hình', async () => {
    delete process.env.SEPAY_API_TOKEN;
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(response([], false));
    await new SePayReconciliationJob({} as BankTransferService).reconcile();
    expect(fetch).not.toHaveBeenCalled();
  });
});
