'use client';

import { useState } from 'react';
import BankReconciliation, { TRANSFER_ISSUE } from './BankReconciliation';
import { useAdminCtx } from '../AdminContext';
import { formatVnd, PAYMENT_METHOD_LABEL as PAYMENT_METHODS, PAYMENT_STATUS_LABEL as PAYMENT_STATES } from '../../../shared/lib/format';
import {
  AdminCollection,
  OrderReference,
  RecordStatus,
  localDateTime,
} from './AdminUi';

const RESERVATION_STATES = {
  HOLDING: 'Đang giữ',
  COMMITTED: 'Đã trừ tồn',
  RELEASED: 'Đã trả tồn',
  EXPIRED: 'Hết hạn',
};
const REASONS = {
  RESERVE: 'Giữ hàng',
  COMMIT: 'Trừ hàng',
  RELEASE: 'Trả tồn',
  EXPIRE: 'Hết hạn',
  RESTOCK: 'Nhập hàng',
  MANUAL_ADJUST: 'Điều chỉnh',
};

type InventoryIdentity = {
  id: string;
  product: { name: string; sku: string };
  warehouse: { code: string; name: string };
};
type OrderIdentity = { id: string; orderCode: string };
type PaymentRecord = {
  id: string;
  transactionRef: string;
  amount: string;
  currency: string;
  order: OrderIdentity & { status: string };
  accountNumber: string | null;
  canReconcile: boolean;
  bankReceipts: { id: string; bankReference: string | null; amount: string; receivedAt: string; issue: string | null }[];
  method: keyof typeof PAYMENT_METHODS;
  status: keyof typeof PAYMENT_STATES;
  failureReason: string | null;
  createdAt: string;
  processedAt: string | null;
};
type ReservationRecord = {
  id: string;
  inventory: InventoryIdentity;
  order: OrderIdentity;
  quantity: number;
  status: keyof typeof RESERVATION_STATES;
  expiresAt: string;
  committedAt: string | null;
  releasedAt: string | null;
};
type AuditRecord = {
  id: string;
  inventory: InventoryIdentity;
  actor: { fullName: string } | null;
  reason: keyof typeof REASONS;
  stockBefore: number;
  stockAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  quantityDelta: number;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  note: string | null;
};

function InventoryName({ inventory }: { inventory: InventoryIdentity }) {
  return (
    <>
      <strong>{inventory.product.name}</strong>
      <div className="admin-record-meta">{inventory.product.sku}</div>
    </>
  );
}

export function PaymentsView() {
  const [selected, setSelected] = useState<PaymentRecord | null>(null);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState('');
  return (<>
    <AdminCollection<PaymentRecord>
      version={version}
      beforeTable={() => notice ? <p role="status" className="alert alert-info mb-0">{notice}</p> : null}
      title="Thanh toán"
      description="Đối chiếu giao dịch theo mã đơn, phương thức và kết quả xử lý."
      endpoint="/admin/payments"
      searchLabel="Mã giao dịch hoặc mã đơn"
      filters={[
        { key: 'status', label: 'Trạng thái', options: PAYMENT_STATES },
        { key: 'method', label: 'Phương thức', options: PAYMENT_METHODS },
      ]}
      empty="Không có giao dịch phù hợp."
      columns={[
        {
          heading: 'Giao dịch',
          render: (row) => (
            <span className="font-monospace admin-record-reference">
              {row.transactionRef}
            </span>
          ),
        },
        {
          heading: 'Đơn hàng',
          render: (row) => <OrderReference order={row.order} />,
        },
        {
          heading: 'Phương thức',
          render: (row) => PAYMENT_METHODS[row.method],
        },
        {
          heading: 'Số tiền',
          className: 'text-end text-nowrap',
          render: (row) => (
            <strong>
              {row.currency === 'VND'
                ? formatVnd(Number(row.amount))
                : `${row.amount} ${row.currency}`}
            </strong>
          ),
        },
        {
          heading: 'Trạng thái',
          render: (row) => (
            <>
              <RecordStatus
                label={row.method === 'BANK_TRANSFER' && row.status === 'PENDING' && row.order.status === 'CANCELLED'
                  ? 'Hết hiệu lực' : PAYMENT_STATES[row.status]}
                tone={
                  row.status === 'SUCCESS'
                    ? 'good'
                    : row.status === 'FAILED'
                      ? 'bad'
                      : 'warn'
                }
              />
              {row.status === 'FAILED' && row.failureReason && (
                <div className="admin-record-meta">{row.failureReason}</div>
              )}
            </>
          ),
        },
        {
          heading: 'Thời điểm',
          className: 'text-nowrap',
          render: (row) => localDateTime(row.processedAt ?? row.createdAt),
        },
        {
          heading: 'Đối soát',
          render: (row) => row.method !== 'BANK_TRANSFER' ? null : <>
            {row.bankReceipts.length > 0 && <details className="admin-record-meta mb-1">
              <summary>Khoản tiền đã ghi nhận</summary>
              <ul className="mb-1 ps-3">
                {row.bankReceipts.map((item) => <li key={item.id}>
                  {formatVnd(Number(item.amount))} · {item.issue ? TRANSFER_ISSUE[item.issue] ?? 'Cần kiểm tra' : 'Khớp đơn'}<br />
                  {item.bankReference && <>{item.bankReference} · </>}{localDateTime(item.receivedAt)}
                </li>)}
              </ul>
            </details>}
            {row.canReconcile && <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setSelected(row)}>Đối soát sao kê</button>}
          </>,
        },
      ]}
    />
    {selected && <BankReconciliation payment={{ ...selected, orderCode: selected.order.orderCode }}
      onClose={() => setSelected(null)}
      onSaved={(message) => { setSelected(null); setNotice(message); setVersion(value => value + 1); }} />}
  </>);
}

export function ReservationsView() {
  const { warehouseId } = useAdminCtx();
  return (
    <AdminCollection<ReservationRecord>
      title="Giữ hàng"
      description="Theo dõi hàng đang giữ cho đơn, thời điểm hết hạn và kết quả xử lý."
      endpoint="/admin/inventory/reservations"
      warehouseId={warehouseId}
      searchLabel="Mã đơn, SKU hoặc tên sản phẩm"
      filters={[
        { key: 'status', label: 'Trạng thái', options: RESERVATION_STATES },
      ]}
      empty="Không có dòng giữ hàng phù hợp."
      columns={[
        {
          heading: 'Đơn hàng',
          render: (row) => <OrderReference order={row.order} />,
        },
        {
          heading: 'Sản phẩm',
          render: (row) => <InventoryName inventory={row.inventory} />,
        },
        {
          heading: 'Kho',
          render: (row) => (
            <span title={row.inventory.warehouse.name}>
              {row.inventory.warehouse.code}
            </span>
          ),
        },
        {
          heading: 'Số lượng',
          className: 'text-end text-nowrap',
          render: (row) => row.quantity,
        },
        {
          heading: 'Hạn giữ',
          className: 'text-nowrap',
          render: (row) => localDateTime(row.expiresAt),
        },
        {
          heading: 'Trạng thái',
          render: (row) => (
            <RecordStatus
              label={RESERVATION_STATES[row.status]}
              tone={
                row.status === 'HOLDING'
                  ? 'warn'
                  : row.status === 'COMMITTED'
                    ? 'good'
                    : 'neutral'
              }
            />
          ),
        },
        {
          heading: 'Đã xử lý lúc',
          className: 'text-nowrap',
          render: (row) => localDateTime(row.committedAt ?? row.releasedAt),
        },
      ]}
    />
  );
}

export function AuditLogsView() {
  const { warehouseId } = useAdminCtx();
  return (
    <AdminCollection<AuditRecord>
      title="Lịch sử biến động"
      description="Đối chiếu tồn thực và số lượng giữ chỗ trước, sau mỗi nghiệp vụ kho."
      endpoint="/admin/inventory/audit-logs"
      warehouseId={warehouseId}
      searchLabel="SKU, tên sản phẩm hoặc mã tham chiếu"
      filters={[{ key: 'reason', label: 'Nghiệp vụ', options: REASONS }]}
      empty="Không có biến động phù hợp."
      columns={[
        {
          heading: 'Thời điểm',
          className: 'text-nowrap',
          render: (row) => localDateTime(row.createdAt),
        },
        {
          heading: 'Sản phẩm và kho',
          render: (row) => (
            <>
              <InventoryName inventory={row.inventory} />
              <div className="admin-record-meta">
                {row.inventory.warehouse.code}
              </div>
            </>
          ),
        },
        {
          heading: 'Nghiệp vụ',
          render: (row) => (
            <RecordStatus label={REASONS[row.reason]} tone="accent" />
          ),
        },
        {
          heading: 'Tồn thực',
          className: 'text-nowrap text-end',
          render: (row) => `${row.stockBefore} → ${row.stockAfter}`,
        },
        {
          heading: 'Giữ chỗ',
          className: 'text-nowrap text-end',
          render: (row) => `${row.reservedBefore} → ${row.reservedAfter}`,
        },
        {
          heading: 'Thay đổi tồn',
          className: 'text-nowrap text-end',
          render: (row) =>
            row.quantityDelta > 0 ? `+${row.quantityDelta}` : row.quantityDelta,
        },
        {
          heading: 'Thực hiện',
          render: (row) => (
            <>
              {row.actor?.fullName ?? 'Hệ thống'}
              {row.note && <div className="admin-record-meta">{row.note}</div>}
            </>
          ),
        },
        {
          heading: 'Tham chiếu',
          render: (row) =>
            row.referenceId ? (
              <span className="admin-record-reference" title={row.referenceId}>
                <span className="admin-record-meta d-block">
                  {row.referenceType}
                </span>
                <span className="font-monospace">{row.referenceId}</span>
              </span>
            ) : (
              '—'
            ),
        },
      ]}
    />
  );
}
