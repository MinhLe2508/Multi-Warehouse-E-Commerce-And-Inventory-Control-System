'use client';

import { useRef, useState, type FormEvent } from 'react';
import { apiPost, AuthError, extractErrorMessage } from '../../../shared/lib/apiClient';
import { formatVnd } from '../../../shared/lib/format';
import { AdminDialog } from './AdminUi';

export const TRANSFER_ISSUE: Record<string, string> = {
  AMOUNT_MISMATCH: 'Sai số tiền',
  OUTSIDE_PAYMENT_WINDOW: 'Ngoài thời gian thanh toán',
  ORDER_CLOSED: 'Đơn đã đóng',
  ALREADY_PAID: 'Đơn đã được thanh toán',
};

export default function BankReconciliation({ payment, onClose, onSaved }: {
  payment: { id: string; transactionRef: string; orderCode: string; amount: string; accountNumber: string | null };
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const localTime = value('receivedAt');
    const withSeconds = localTime.length === 16 ? localTime + ':00' : localTime;
    const receivedAt = new Date(withSeconds + '+07:00');
    if (value('transferCode').toUpperCase() !== payment.transactionRef) {
      setError('Nội dung trên sao kê phải khớp mã chuyển khoản của đơn.');
      return;
    }
    if (!Number.isFinite(receivedAt.getTime())) {
      setError('Thời gian nhận tiền chưa hợp lệ.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await apiPost<{ applied: boolean; duplicate: boolean; issue: string | null }>(
        `/payments/bank-transfer/${payment.id}/reconcile`,
        { bankReference: value('bankReference'), transferCode: value('transferCode'), amount: Number(value('amount')), receivedAt: receivedAt.toISOString() },
      );
      if (result.applied) {
        onSaved('Đã xác nhận thanh toán và cập nhật đơn hàng.');
      } else {
        setError(result.duplicate ? 'Mã giao dịch này đã được ghi nhận. Kiểm tra lại sao kê.' :
          TRANSFER_ISSUE[result.issue ?? ''] ?? 'Chưa xác nhận được giao dịch.');
      }
    } catch (cause) {
      if (cause instanceof AuthError && cause.code === 'PAYMENT_SUPPORT_REQUIRED') {
        onSaved('Yêu cầu đã thay đổi. Trạng thái đơn được tải lại.');
        return;
      }
      setError(extractErrorMessage(cause, 'Chưa thể đối soát khoản tiền này.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <AdminDialog title="Xác nhận chuyển trạng thái" onClose={() => { if (!pending.current) onClose(); }}>
    <p className="mb-2">Đơn <strong>{payment.orderCode}</strong> · Số tiền cần nhận <strong>{formatVnd(Number(payment.amount))}</strong></p>
    <p className="mb-3">Đối chiếu trong sao kê Vietcombank{payment.accountNumber ? <> của tài khoản <strong>{payment.accountNumber}</strong></> : null}. Mã chuyển khoản của đơn <strong className="font-monospace">{payment.transactionRef}</strong>.</p>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <form className="d-grid gap-3" onSubmit={(event) => void submit(event)}>
      <label>Mã nội dung chuyển khoản trên sao kê
        <input name="transferCode" className="form-control" required maxLength={22} autoComplete="off" />
      </label>
      <label>Mã giao dịch ngân hàng
        <input name="bankReference" className="form-control" required maxLength={100} autoComplete="off" />
      </label>
      <label>Số tiền thực nhận (VND)
        <input name="amount" type="number" className="form-control" min={1} max={999999999999} step={1} required />
      </label>
      <label>Ngày giờ tiền vào (giờ Việt Nam)
        <input name="receivedAt" type="datetime-local" step={1} className="form-control" required />
      </label>
      <label className="d-flex gap-2 align-items-start">
        <input type="checkbox" className="form-check-input" required />
        <span>Tôi đã kiểm tra giao dịch tiền vào trên sao kê ngân hàng.</span>
      </label>
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Hủy</button>
        <button type="submit" className="btn btn-gradient-purple" disabled={busy}>{busy ? 'Đang đối soát…' : 'Xác nhận đã thanh toán'}</button>
      </div>
    </form>
  </AdminDialog>;
}
