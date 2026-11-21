'use client';

import { useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_LABEL, formatVnd } from '../../../shared/lib/format';
import type { OrderStatus } from '../../../shared/types/admin';
import {
  AdminCollection,
  AdminDataTable,
  AdminDialog,
  AdminFeedback,
  AdminPager,
  OrderReference,
  RecordStatus,
  localDateTime,
  useAdminResource,
  type AdminPageResult,
} from './AdminUi';

type Customer = {
  id: string;
  fullName: string;
  email: string;
  username: string;
  phone: string | null;
  isActive: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  orderCount: number;
};

type CustomerOrder = {
  id: string;
  orderCode: string;
  status: OrderStatus;
  grandTotal: string;
  createdAt: string;
};
type CustomerProfile = Customer & { address: string | null };
type CustomerOrderDetail = CustomerOrder & {
  userId: string;
  subtotal: string;
  discountTotal: string;
  shippingFee: string;
  shippingRecipient: string;
  shippingPhone: string;
  shippingAddress: string;
  items: Array<{
    id: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: string;
    method: keyof typeof PAYMENT_METHOD_LABEL;
    status: keyof typeof PAYMENT_STATUS_LABEL;
    amount: string;
    transactionRef: string;
  }>;
};

const customerStates = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
  PENDING_VERIFICATION: 'Chờ xác minh',
};

function CustomerStatus({ customer }: { customer: Customer }) {
  const state = !customer.isActive ? 'LOCKED' : customer.emailVerifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION';
  return <RecordStatus label={customerStates[state]} tone={state === 'ACTIVE' ? 'good' : state === 'LOCKED' ? 'bad' : 'warn'} />;
}

function OrderBreakdown({ orderId, customerId }: { orderId: string; customerId: string }) {
  const { data: order, error, loading, refresh } = useAdminResource<CustomerOrderDetail>(`/admin/orders/${orderId}`);
  if (!order) return <AdminFeedback error={error} loading={loading} retry={refresh} />;
  if (order.userId !== customerId) return <AdminFeedback error="Đơn hàng không thuộc hồ sơ này." />;

  return (
    <section className="admin-customer-sheet mt-3" id="customer-order-breakdown" aria-labelledby="customer-order-title">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h3 className="h6 mb-0" id="customer-order-title">Chi tiết đơn hàng</h3>
        <OrderReference order={order} />
      </div>
      <p className="admin-record-meta mb-3">
        <strong>{order.shippingRecipient} · {order.shippingPhone}</strong><br />
        {order.shippingAddress}
      </p>
      <AdminDataTable
        rows={order.items}
        empty="Đơn hàng không có dòng sản phẩm."
        columns={[
          { heading: 'Sản phẩm', render: (item) => <><strong>{item.productName}</strong><div className="admin-record-meta">{item.sku}</div></> },
          { heading: 'Số lượng', className: 'text-end text-nowrap', render: (item) => item.quantity },
          { heading: 'Đơn giá', className: 'text-end text-nowrap', render: (item) => formatVnd(Number(item.unitPrice)) },
          { heading: 'Thành tiền', className: 'text-end text-nowrap', render: (item) => formatVnd(Number(item.lineTotal)) },
        ]}
      />
      <div className="row g-3 mt-1">
        <div className="col-sm-6">
          <h4 className="h6">Thanh toán</h4>
          {order.payments.length ? (
            <ul className="list-unstyled d-grid gap-2 mb-0">
              {order.payments.map((payment) => (
                <li key={payment.id}>
                  <div>{PAYMENT_METHOD_LABEL[payment.method]} · {formatVnd(Number(payment.amount))}</div>
                  <div className="admin-record-meta mb-1">{payment.transactionRef}</div>
                  <RecordStatus label={PAYMENT_STATUS_LABEL[payment.status]} tone={payment.status === 'SUCCESS' ? 'good' : payment.status === 'FAILED' ? 'bad' : 'warn'} />
                </li>
              ))}
            </ul>
          ) : <p className="admin-record-meta mb-0">Chưa có giao dịch thanh toán.</p>}
        </div>
        <dl className="col-sm-6 admin-order-totals mb-0">
          <div><dt>Tiền hàng</dt><dd>{formatVnd(Number(order.subtotal))}</dd></div>
          {Number(order.discountTotal) > 0 && <div><dt>Giảm giá</dt><dd>{formatVnd(-Number(order.discountTotal))}</dd></div>}
          <div><dt>Phí giao hàng</dt><dd>{formatVnd(Number(order.shippingFee))}</dd></div>
          <div className="border-top pt-2 fw-bold"><dt>Tổng tiền</dt><dd>{formatVnd(Number(order.grandTotal))}</dd></div>
        </dl>
      </div>
    </section>
  );
}

function CustomerDetails({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [orderId, setOrderId] = useState<string | null>(null);
  const profile = useAdminResource<CustomerProfile>(`/admin/customers/${customer.id}`);
  const account = profile.data ?? customer;
  const result = useAdminResource<AdminPageResult<CustomerOrder>>(
    `/admin/customers/${customer.id}/orders?page=${page}&limit=10`,
  );
  return (
    <AdminDialog title="Hồ sơ khách hàng" onClose={onClose}>
      <section className="admin-customer-sheet mb-4" aria-label="Thông tin tài khoản">
        <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
          <span className="admin-customer-icon"><UserRound size={24} aria-hidden="true" /></span>
          <div className="flex-grow-1 text-break">
            <h2 className="h5 mb-1">{account.fullName}</h2>
            <div className="admin-record-meta">{account.email}</div>
          </div>
          <CustomerStatus customer={account} />
        </div>
        <dl className="admin-customer-fields mb-0">
          <div><dt>Tên đăng nhập</dt><dd>{account.username}</dd></div>
          <div><dt>Điện thoại</dt><dd>{account.phone ?? '—'}</dd></div>
          <div><dt>Ngày tạo tài khoản</dt><dd>{localDateTime(account.createdAt)}</dd></div>
          <div><dt>Xác thực Email</dt><dd>{account.emailVerifiedAt ? localDateTime(account.emailVerifiedAt) : 'Chưa xác thực'}</dd></div>
          {profile.data && <div className="admin-customer-address"><dt>Địa chỉ mặc định</dt><dd>{profile.data.address ?? 'Chưa cập nhật'}</dd></div>}
        </dl>
        <AdminFeedback error={profile.error} loading={profile.loading} retry={profile.refresh} />
      </section>
      <div className="d-flex align-items-center gap-2 mb-3">
        <h2 className="h6 mb-0">Lịch sử mua hàng</h2>
        <RecordStatus label={`${result.data?.total ?? account.orderCount} đơn`} tone="accent" />
      </div>
      {result.data ? (
        <>
          <AdminDataTable
            rows={result.data.items}
            empty="Khách hàng chưa có đơn hàng."
            columns={[
              {
                heading: 'Mã đơn',
                render: (row) => <OrderReference order={row} />,
              },
              {
                heading: 'Trạng thái',
                render: (row) => (
                  <RecordStatus label={STATUS_LABEL[row.status]} />
                ),
              },
              {
                heading: 'Tổng tiền',
                className: 'text-end text-nowrap',
                render: (row) => formatVnd(Number(row.grandTotal)),
              },
              {
                heading: 'Ngày đặt',
                render: (row) => localDateTime(row.createdAt),
              },
              {
                heading: 'Chi tiết',
                className: 'text-end text-nowrap',
                render: (row) => (
                  <button
                    type="button"
                    className="btn btn-outline-purple btn-sm"
                    aria-label={`Chi tiết đơn ${row.orderCode}`}
                    aria-expanded={orderId === row.id}
                    onClick={() => setOrderId(orderId === row.id ? null : row.id)}
                  >
                    {orderId === row.id ? 'Thu gọn' : 'Xem chi tiết'} <ChevronDown size={14} aria-hidden="true" />
                  </button>
                ),
              },
            ]}
          />
          <AdminPager {...result.data} onChange={(nextPage) => { setOrderId(null); setPage(nextPage); }} />
          {orderId && <OrderBreakdown key={orderId} orderId={orderId} customerId={account.id} />}
        </>
      ) : (
        <AdminFeedback
          error={result.error}
          loading={result.loading}
          retry={result.refresh}
        />
      )}
    </AdminDialog>
  );
}

export function CustomersView() {
  const [selected, setSelected] = useState<Customer | null>(null);
  return (
    <>
      <AdminCollection<Customer>
        title="Khách hàng"
        description="Tra cứu tài khoản và lịch sử mua hàng của khách."
        endpoint="/admin/customers"
        searchLabel="Họ tên, email, tên đăng nhập hoặc số điện thoại"
        filters={[
          { key: 'status', label: 'Trạng thái', options: customerStates },
        ]}
        empty="Không có khách hàng phù hợp."
        columns={[
          {
            heading: 'Khách hàng',
            render: (row) => (
              <>
                <strong>{row.fullName}</strong>
                <div className="admin-record-meta">{row.email}</div>
              </>
            ),
          },
          { heading: 'Tên đăng nhập', render: (row) => row.username },
          {
            heading: 'Điện thoại',
            className: 'text-nowrap',
            render: (row) => row.phone ?? '—',
          },
          {
            heading: 'Trạng thái',
            render: (row) => <CustomerStatus customer={row} />,
          },
          {
            heading: 'Ngày tạo',
            className: 'text-nowrap',
            render: (row) => localDateTime(row.createdAt),
          },
          {
            heading: 'Đơn đã đặt',
            className: 'text-end text-nowrap',
            render: (row) => (
              <button
                type="button"
                className="btn btn-outline-purple btn-sm"
                onClick={() => setSelected(row)}
                aria-label={`Xem hồ sơ của ${row.fullName}`}
              >
                Xem hồ sơ · {row.orderCount}
              </button>
            ),
          },
        ]}
      />
      {selected && (
        <CustomerDetails
          key={selected.id}
          customer={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

type ChatSession = {
  id: string;
  messageCount: number;
  escalatedToHuman: boolean;
  startedAt: string;
  user: { fullName: string; username: string } | null;
};

type ChatMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  isFallback: boolean;
};

function Transcript({
  session,
  onClose,
}: {
  session: ChatSession;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const result = useAdminResource<AdminPageResult<ChatMessage>>(
    `/admin/ai/chats/${session.id}/messages?page=${page}&limit=30`,
  );
  return (
    <AdminDialog
      title={session.user?.fullName ?? 'Phiên khách vãng lai'}
      onClose={onClose}
    >
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <span className="admin-record-meta">
          Bắt đầu {localDateTime(session.startedAt)}
        </span>
        {session.escalatedToHuman && (
          <RecordStatus label="Đã yêu cầu hỗ trợ" tone="warn" />
        )}
      </div>
      {result.data ? (
        <>
          {result.data.items.length === 0 && (
            <AdminFeedback empty="Phiên chưa có tin nhắn." />
          )}
          <ol className="list-unstyled admin-chat-log">
            {[...result.data.items].reverse().map((message) => (
              <li
                key={message.id}
                className={`admin-chat-message ${message.role === 'USER' ? 'is-user' : ''}`}
              >
                <div className="d-flex align-items-center flex-wrap gap-2">
                  <strong>
                    {message.role === 'USER' ? 'Khách' : 'Chatbot'}
                  </strong>
                  <span className="admin-record-meta">
                    {localDateTime(message.createdAt)}
                  </span>
                  {message.isFallback && (
                    <RecordStatus label="Phản hồi dự phòng" tone="warn" />
                  )}
                </div>
                <p>{message.content}</p>
              </li>
            ))}
          </ol>
          <AdminPager {...result.data} onChange={setPage} />
        </>
      ) : (
        <AdminFeedback
          error={result.error}
          loading={result.loading}
          retry={result.refresh}
        />
      )}
    </AdminDialog>
  );
}

export function ChatSessionsView() {
  const [selected, setSelected] = useState<ChatSession | null>(null);
  return (
    <>
      <AdminCollection<ChatSession>
        title="Phiên hội thoại"
        description="Xem nội dung trao đổi với chatbot và lọc các phiên đã yêu cầu hỗ trợ."
        endpoint="/admin/ai/chats"
        searchLabel="Tên khách, tên đăng nhập hoặc mã phiên đầy đủ"
        filters={[
          {
            key: 'handling',
            label: 'Hỗ trợ',
            options: {
              ESCALATED: 'Đã yêu cầu hỗ trợ',
              AUTOMATED: 'Chatbot tự xử lý',
            },
          },
        ]}
        empty="Không có phiên hội thoại phù hợp."
        columns={[
          {
            heading: 'Người dùng',
            render: (row) => (
              <>
                <strong>{row.user?.fullName ?? 'Khách vãng lai'}</strong>
                {row.user && (
                  <div className="admin-record-meta">{row.user.username}</div>
                )}
              </>
            ),
          },
          {
            heading: 'Mã phiên',
            render: (row) => (
              <span
                className="admin-record-reference font-monospace"
                title={row.id}
              >
                {row.id}
              </span>
            ),
          },
          {
            heading: 'Bắt đầu',
            className: 'text-nowrap',
            render: (row) => localDateTime(row.startedAt),
          },
          {
            heading: 'Tin nhắn',
            className: 'text-end text-nowrap',
            render: (row) => row.messageCount,
          },
          {
            heading: 'Hỗ trợ',
            render: (row) => (
              <RecordStatus
                label={
                  row.escalatedToHuman
                    ? 'Đã yêu cầu hỗ trợ'
                    : 'Chatbot tự xử lý'
                }
                tone={row.escalatedToHuman ? 'warn' : 'neutral'}
              />
            ),
          },
          {
            heading: 'Nội dung',
            render: (row) => (
              <button
                type="button"
                className="btn btn-outline-purple btn-sm text-nowrap"
                onClick={() => setSelected(row)}
              >
                Xem hội thoại
              </button>
            ),
          },
        ]}
      />
      {selected && (
        <Transcript
          key={selected.id}
          session={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
