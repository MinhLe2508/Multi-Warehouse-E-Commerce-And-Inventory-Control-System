'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Truck } from 'lucide-react';
import ProductImage from '@/components/products/ProductImage';
import { useAdminCtx } from '@/components/admin/AdminContext';
import { useAdminResource, RecordStatus } from '@/components/admin/operations/AdminUi';
import { OrderBadge } from '@/components/admin/StatusBadge';
import { apiPatch } from '@/shared/lib/apiClient';
import { STATUS_LABEL, formatVnd } from '@/shared/lib/format';
import { AdminFeedback, Dialog, Field, Filters, PageTitle, Records, Refresh, Table } from './PortalUi';
import { type List, type Order, count, dateTime, query, warehouseParam } from './data';

const pageSize = 20;
const paymentMethods = { COD: 'Thanh toán khi nhận hàng', BANK_TRANSFER: 'Chuyển khoản VietQR', MOCK_CARD: 'Thẻ (trước đây)', MOCK_EWALLET: 'Ví (trước đây)' };
const paymentStatus = { PENDING: 'Đang chờ', SUCCESS: 'Thành công', FAILED: 'Thất bại' };
const holds: Record<string, string> = {
  HOLDING: 'Đang giữ chỗ', COMMITTED: 'Đã trừ kho', RELEASED: 'Đã trả chỗ', EXPIRED: 'Đã hết hạn',
};

function OrdersList({ warehouseId, dispatch, initialStatus }: {
  warehouseId: string; dispatch: boolean; initialStatus: string;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({ status: initialStatus });
  const [page, setPage] = useState(1);
  const resource = useAdminResource<List<Order>>(query('/admin/orders', {
    ...filters, warehouseId: warehouseParam(warehouseId), page, limit: pageSize,
    status: dispatch ? 'CONFIRMED' : filters.status,
    fulfillable: dispatch ? 'true' : undefined,
  }));

  return <>
    <PageTitle title={dispatch ? 'Xác nhận xuất kho' : 'Đơn hàng'}
      description={dispatch ? 'Kiểm tra sản phẩm và người nhận trước khi bàn giao đơn đã xác nhận.' : 'Xem đơn giao tự động và đơn khách chọn kho bạn phụ trách.'}
      actions={<Refresh onClick={resource.refresh} disabled={resource.loading} />}
    />
    <Filters onApply={(form) => {
      setPage(1);
      setFilters(Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()])));
    }} onReset={() => { setFilters({ status: initialStatus }); setPage(1); }}>
      <Field label="Tìm đơn"><input name="q" type="search" placeholder="Mã đơn, tên hoặc số điện thoại" maxLength={160} /></Field>
      {!dispatch && <Field label="Trạng thái"><select name="status" defaultValue={initialStatus}>
        <option value="">Mọi trạng thái</option>
        {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Field>}
      <Field label="Từ ngày"><input type="date" name="from" /></Field>
      <Field label="Đến ngày"><input type="date" name="to" /></Field>
      {!dispatch && <Field label="Thời hạn giữ hàng"><select name="reservation">
        <option value="">Mọi thời hạn</option><option value="HOLDING">Còn thời gian</option>
        <option value="EXPIRING">Còn tối đa 15 phút</option><option value="EXPIRED">Quá hạn</option>
      </select></Field>}
    </Filters>
    <Records {...resource} page={page} pageSize={pageSize} onPage={setPage}
      label={dispatch ? 'Đơn chờ xuất kho' : 'Danh sách đơn hàng'}
      empty={dispatch ? 'Chưa có đơn đã xác nhận cần xuất kho.' : 'Không có đơn hàng phù hợp.'}
      columns={[
        { title: 'Mã đơn', render: (order) => <Link className="staff-link staff-nowrap" href={`/staff/orders/${order.id}`}>{order.orderCode}</Link> },
        { title: 'Người nhận', render: (order) => <><strong>{order.shippingRecipient}</strong><div className="staff-muted staff-nowrap">{order.shippingPhone}</div></> },
        { title: 'Ngày đặt', render: (order) => <span className="staff-nowrap">{dateTime(order.createdAt)}</span> },
        { title: 'Số lượng', align: 'right', render: (order) => count(order.items.reduce((sum, item) => sum + item.quantity, 0)) },
        { title: 'Kho xuất', render: (order) => <>
          <strong>{[...new Set(order.items.map(({ warehouse }) => warehouse.code))].join(', ') || '—'}</strong>
          <div className="staff-muted">{order.shippingWarehouse ? 'Khách chọn kho' : 'Giao tự động'}</div>
        </> },
        { title: 'Trạng thái', render: (order) => <OrderBadge status={order.status} /> },
        ...(!dispatch ? [{ title: 'Giữ hàng đến', render: (order: Order) => <span className="staff-nowrap">{order.status === 'PENDING_PAYMENT' ? dateTime(order.reservationExpiresAt) : '—'}</span> }] : []),
        { title: 'Thao tác', render: (order) => <Link className="staff-button" href={`/staff/orders/${order.id}`}>Xem chi tiết <ArrowRight size={14} /></Link> },
      ]}
    />
  </>;
}

export function StaffOrders({ dispatch = false, initialStatus = '' }: {
  dispatch?: boolean; initialStatus?: string;
}) {
  const { warehouseId } = useAdminCtx();
  return <OrdersList key={JSON.stringify([warehouseId, dispatch, initialStatus])}
    warehouseId={warehouseId} dispatch={dispatch} initialStatus={initialStatus} />;
}

export function StaffOrderDetail({ id }: { id: string }) {
  const path = `/admin/orders/${encodeURIComponent(id)}`;
  const resource = useAdminResource<Order>(path);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const order = resource.data;
  const next = order?.nextStatuses?.[0];
  const collectCod = next === 'DELIVERED' && order?.payments.some(({ method, status }) => method === 'COD' && status === 'PENDING');
  const action = next === 'SHIPPING' ? 'Xác nhận xuất kho' : collectCod ? 'Xác nhận đã giao và thu COD' : 'Xác nhận đã giao';
  const back = <Link href="/staff/orders" className="staff-button"><ArrowLeft size={16} /> Đơn hàng</Link>;

  return <>
    <PageTitle title={order?.orderCode ?? 'Chi tiết đơn hàng'} actions={<>
      {back}
      <Refresh onClick={resource.refresh} disabled={resource.loading} />
      {next && <button type="button" className="staff-button primary" onClick={() => { setNote(''); setConfirming(true); }}>
        <Truck size={16} aria-hidden="true" /> {action}
      </button>}
    </>} />
    {notice && <p className="staff-notice success" role="status">{notice}</p>}
    <AdminFeedback loading={resource.loading} error={resource.error ?? undefined} retry={resource.refresh} />
    {order && <>
      <div className="staff-grid-two">
        <section className="staff-panel padded"><h2>Thông tin đơn hàng</h2>
          <dl className="staff-details">
            <dt>Trạng thái</dt><dd><OrderBadge status={order.status} /></dd>
            <dt>Ngày đặt</dt><dd>{dateTime(order.createdAt)}</dd>
            <dt>Giữ hàng đến</dt><dd>{order.status === 'PENDING_PAYMENT' ? dateTime(order.reservationExpiresAt) : '—'}</dd>
            <dt>Tổng tiền</dt><dd><strong>{formatVnd(Number(order.grandTotal))}</strong></dd>
            <dt>Chọn kho giao</dt><dd>{order.shippingWarehouse?.name ?? 'MultiMart tự chọn'}</dd>
            {order.promotionCode && <>
              <dt>Khuyến mãi</dt><dd>{order.promotionCode} · −{formatVnd(Number(order.promotionDiscountTotal))}</dd>
            </>}
          </dl>
        </section>
        <section className="staff-panel padded"><h2>Khách hàng và người nhận</h2>
          <dl className="staff-details">
            {order.customer && <>
              <dt>Tài khoản đặt</dt><dd>{order.customer.fullName}</dd>
              <dt>Email</dt><dd className="text-break">{order.customer.email}</dd>
            </>}
            <dt>Họ tên</dt><dd>{order.shippingRecipient}</dd><dt>Điện thoại</dt><dd>{order.shippingPhone}</dd>
            <dt>Địa chỉ</dt><dd>{order.shippingAddress}</dd>
          </dl>
        </section>
      </div>
      <section className="staff-panel staff-records">
        <div className="staff-section-title px-3 pt-3"><h2>Sản phẩm trong đơn</h2></div>
        <Table label="Sản phẩm trong đơn" rows={order.items} columns={[
          { title: 'Sản phẩm', render: (item) => <span className="staff-product-cell">
            <span className="staff-thumb"><ProductImage src={item.imageUrl} alt="" fill sizes="40px" /></span>
            <span><strong>{item.productName}</strong><small>{item.sku}</small></span>
          </span> },
          { title: 'Kho xuất', render: (item) => item.warehouse.code },
          { title: 'Số lượng', align: 'right', render: (item) => count(item.quantity) },
          { title: 'Giữ hàng', render: (item) => item.reservationStatus ? holds[item.reservationStatus] ?? item.reservationStatus : '—' },
        ]} />
      </section>
      <div className="staff-grid-two">
        <section className="staff-panel padded">
          <div className="staff-section-title"><h2>Thanh toán</h2></div>
          {order.payments.length ? <ul className="staff-list">
            {order.payments.map((payment) => <li className="staff-list-row" key={payment.id}>
              <div><strong>{paymentMethods[payment.method]}</strong><small>{payment.transactionRef ?? '—'}</small></div>
              <div><RecordStatus label={paymentStatus[payment.status]} tone={payment.status === 'SUCCESS' ? 'good' : payment.status === 'FAILED' ? 'bad' : 'neutral'} />
                <small>{formatVnd(Number(payment.amount))}</small></div>
            </li>)}
          </ul> : <AdminFeedback empty={Number(order.grandTotal) === 0 ? 'Đơn hàng miễn phí.' : 'Chưa có giao dịch thanh toán.'} />}
        </section>
        <section className="staff-panel padded">
          <div className="staff-section-title"><h2>Lịch sử đơn hàng</h2></div>
          {order.statusHistory.length ? <ol className="staff-list">
            {order.statusHistory.map((event) => <li key={event.id}>
              <OrderBadge status={event.toStatus} />
              <div className="staff-muted mt-1">{dateTime(event.createdAt)} · {event.actorName || 'Hệ thống'}</div>
              {event.reason && <div>{event.reason}</div>}
            </li>)}
          </ol> : <AdminFeedback empty="Chưa có lịch sử trạng thái." />}
        </section>
      </div>
      {confirming && next && <Dialog title={action} confirmText={action} onClose={() => setConfirming(false)}
        onConfirm={() => apiPatch(`${path}/status`, { targetStatus: next, note: note.trim() || undefined, ...(collectCod && { codCollected: true }) })}
        success={() => { setNotice(`Đã cập nhật đơn ${order.orderCode}.`); resource.refresh(); }}>
        <p>Đơn <strong>{order.orderCode}</strong> sẽ chuyển sang <strong>{STATUS_LABEL[next]}</strong>.</p>
        <Field label="Ghi chú"><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={255} /></Field>
      </Dialog>}
    </>}
  </>;
}
