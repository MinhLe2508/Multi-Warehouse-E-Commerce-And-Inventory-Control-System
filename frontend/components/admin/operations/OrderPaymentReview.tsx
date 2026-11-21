'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Banknote, Headset } from 'lucide-react';
import { apiPatch, extractErrorMessage } from '../../../shared/lib/apiClient';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '../../../shared/lib/format';
import type { AdminOrder } from '../../../shared/types/admin';
import { AdminDialog, localDateTime, RecordStatus } from './AdminUi';
import BankReconciliation from './BankReconciliation';

export default function OrderPaymentReview({ order, onUpdate }: {
  order: AdminOrder;
  onUpdate: (message: string) => void;
}) {
  const [dialog, setDialog] = useState<'confirm' | 'close' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const request = order.paymentSupport;
  const paymentStatus = order.paymentStatus;
  const expired = order.status === 'CANCELLED';
  if (!paymentStatus) return null;
  const paid = paymentStatus === 'SUCCESS';

  async function closeRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !request) return;
    const note = String(new FormData(event.currentTarget).get('note') ?? '').trim();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await apiPatch(`/payments/bank-transfer/${request.paymentId}/support`, { note });
      setDialog(null);
      onUpdate('Đã gửi phản hồi đối soát cho khách hàng.');
    } catch (cause) {
      setError(extractErrorMessage(cause, 'Chưa thể đóng yêu cầu.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <section className="admin-workspace-panel p-3 p-md-4">
    <div className="d-flex flex-wrap align-items-center gap-2">
      <Banknote size={18} aria-hidden="true" />
      <h2 className="h6 mb-0">Thanh toán · {PAYMENT_METHOD_LABEL[order.paymentMethod]}</h2>
      <RecordStatus
        label={paid ? 'Đã thanh toán' : expired ? 'Hết hiệu lực' : PAYMENT_STATUS_LABEL[paymentStatus]}
        tone={paid ? 'good' : expired || paymentStatus === 'FAILED' ? 'bad' : 'warn'}
      />
    </div>
    {request && <div className="border-top mt-3 pt-3">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
        <Headset size={17} aria-hidden="true" />
        <h3 className="h6 mb-0">Yêu cầu đối soát VietQR</h3>
        <RecordStatus
          label={request.status === 'OPEN' ? 'Cần xử lý' : request.status === 'CONFIRMED' ? 'Đã xác nhận' : 'Đã phản hồi'}
          tone={request.status === 'OPEN' ? 'warn' : 'good'}
        />
      </div>
      <p className="admin-record-meta mb-1">Khách gửi {localDateTime(request.createdAt)}</p>
      {request.bankReference && <p className="admin-record-meta mb-1">
        Mã giao dịch khách cung cấp <strong className="font-monospace text-break">{request.bankReference}</strong>
      </p>}
      {request.resolvedAt && <p className="admin-record-meta mb-1">Đã xử lý {localDateTime(request.resolvedAt)}</p>}
      {request.resolutionNote && <p className="mb-1 text-break">{request.resolutionNote}</p>}
      {request.status === 'OPEN' && <>
        <p className="small my-2">{request.canConfirm
          ? 'Kiểm tra tiền thực nhận, mã nội dung và thời điểm giao dịch trên sao kê Vietcombank.'
          : 'Hạn giữ hàng đã hết hoặc đơn đã đóng. Đối chiếu khoản tiền và phản hồi hướng xử lý cho khách.'}</p>
        <div className="d-flex flex-wrap gap-2">
          {request.canConfirm && <button type="button" className="btn btn-gradient-purple btn-sm" onClick={() => setDialog('confirm')}>
            Xác nhận đơn hàng đã thanh toán
          </button>}
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => {
            setError('');
            setDialog('close');
          }}>Phản hồi và đóng yêu cầu</button>
        </div>
      </>}
    </div>}
    {dialog === 'confirm' && request?.canConfirm && <BankReconciliation
      payment={{ ...request, id: request.paymentId, orderCode: order.orderCode }}
      onClose={() => setDialog(null)}
      onSaved={(message) => { setDialog(null); onUpdate(message); }}
    />}
    {dialog === 'close' && request?.status === 'OPEN' && <AdminDialog title="Phản hồi yêu cầu đối soát" onClose={() => {
      if (!pending.current) setDialog(null);
    }}>
      <p className="mb-3">Phản hồi sẽ hiển thị trong chi tiết đơn của khách. Trạng thái thanh toán được giữ nguyên.</p>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <form className="d-grid gap-3" onSubmit={(event) => void closeRequest(event)}>
        <label>Phản hồi cho khách hàng
          <textarea className="form-control" name="note" rows={3} required minLength={3} maxLength={300} />
        </label>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-outline-secondary" type="button" disabled={busy} onClick={() => setDialog(null)}>Hủy</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi phản hồi'}</button>
        </div>
      </form>
    </AdminDialog>}
  </section>;
}
