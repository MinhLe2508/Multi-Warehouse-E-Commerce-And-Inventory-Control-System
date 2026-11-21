'use client';

import Link from 'next/link';
import { useState } from 'react';
import { STATUS_LABEL, formatVnd } from '../../../shared/lib/format';
import { type ApiAdminOrder, mapApiOrder } from '../../../hooks/useAdminOrders';
import OrderPaymentReview from './OrderPaymentReview';
import {
  AdminDataTable,
  AdminFeedback,
  AdminPageFrame,
  RecordStatus,
  localDateTime,
  useAdminResource,
} from './AdminUi';

export function OrderRecord({ id }: { id: string }) {
  const order = useAdminResource<ApiAdminOrder>(
    `/admin/orders/${encodeURIComponent(id)}`,
  );
  const data = order.data && mapApiOrder(order.data);
  const [notice, setNotice] = useState('');
  return (
    <AdminPageFrame
      title={data ? `Đơn ${data.orderCode}` : 'Chi tiết đơn hàng'}
      actions={
        <Link href="/admin/orders" className="btn btn-outline-secondary btn-sm">
          Danh sách đơn hàng
        </Link>
      }
    >
      {notice && <p className="alert alert-info mb-0" role="status">{notice}</p>}
      {data ? (
        <>
          <section className="admin-workspace-panel p-3 p-md-4 d-flex justify-content-between flex-wrap gap-3">
            <div>
              <h2 className="h6">Người nhận</h2>
              <strong>{data.shipping.recipient}</strong>
              <div className="admin-record-meta">
                {data.shipping.phone} · {data.shipping.address}
              </div>
            </div>
            <div>
              <RecordStatus label={STATUS_LABEL[data.status]} tone="accent" />
              <p className="mb-0 mt-2">{formatVnd(data.grandTotal)}</p>
            </div>
          </section>
          <OrderPaymentReview order={data} onUpdate={(message) => {
            setNotice(message);
            order.refresh();
          }} />
          <section className="admin-workspace-panel overflow-hidden">
            <h2 className="h6 p-3 mb-0">Sản phẩm và kho xuất</h2>
            <AdminDataTable
              rows={data.items}
              empty="Đơn hàng chưa có dòng sản phẩm."
              columns={[
                {
                  heading: 'Sản phẩm',
                  render: (row) => (
                    <>
                      <strong>{row.productName}</strong>
                      <div className="admin-record-meta">{row.sku}</div>
                    </>
                  ),
                },
                {
                  heading: 'Kho',
                  render: (row) =>
                    row.warehouseName || row.warehouseCode || '—',
                },
                {
                  heading: 'Số lượng',
                  className: 'text-end',
                  render: (row) => row.quantity,
                },
                {
                  heading: 'Thành tiền',
                  className: 'text-end text-nowrap',
                  render: (row) => formatVnd(row.lineTotal),
                },
              ]}
            />
          </section>
          <section className="admin-workspace-panel p-3 p-md-4">
            <h2 className="h6">Lịch sử trạng thái</h2>
            <ol className="mb-0">
              {data.history.map(
                ({ fromStatus, toStatus, createdAt, actor }, index) => (
                  <li key={`${createdAt}-${index}`} className="mb-2">
                    <strong>
                      {fromStatus ? `${STATUS_LABEL[fromStatus]} → ` : ''}
                      {STATUS_LABEL[toStatus]}
                    </strong>
                    <div className="admin-record-meta">
                      {actor} · {localDateTime(createdAt)}
                    </div>
                  </li>
                ),
              )}
            </ol>
          </section>
        </>
      ) : (
        <AdminFeedback
          error={order.error}
          loading={order.loading}
          retry={order.refresh}
        />
      )}
    </AdminPageFrame>
  );
}
