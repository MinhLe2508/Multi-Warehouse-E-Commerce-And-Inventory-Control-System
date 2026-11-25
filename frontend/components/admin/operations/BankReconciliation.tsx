import { formatVnd } from '../../../shared/lib/format';
import type { AdminPaymentSupport } from '../../../shared/types/paymentSupport';

export const TRANSFER_ISSUE: Record<string, string> = {
  AMOUNT_MISMATCH: 'Sai số tiền',
  OUTSIDE_PAYMENT_WINDOW: 'Ngoài thời gian thanh toán',
  ORDER_CLOSED: 'Đơn đã đóng',
  ALREADY_PAID: 'Đơn đã được thanh toán',
};

export default function BankReconciliation({ payment }: {
  payment: Pick<AdminPaymentSupport, 'amount' | 'transactionRef' | 'transferMemo' | 'accountNumber' | 'bankName'>;
}) {
  return <p className="small my-2 text-break">
    Cần nhận <strong>{formatVnd(Number(payment.amount))}</strong>
    {payment.accountNumber && <> · Tài khoản <strong>{payment.accountNumber}</strong>{payment.bankName && <> ({payment.bankName})</>}</>}
    {' · '}Nội dung <strong className="font-monospace">{payment.transferMemo ?? payment.transactionRef}</strong>
  </p>;
}
