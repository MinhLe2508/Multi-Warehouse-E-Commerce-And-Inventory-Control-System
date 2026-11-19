'use client';

import { useState } from 'react';
import { STATUS_LABEL, formatVnd } from '../../../shared/lib/format';
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

const customerStates = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
  PENDING_VERIFICATION: 'Chờ xác minh',
};

function CustomerOrders({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const result = useAdminResource<AdminPageResult<CustomerOrder>>(
    `/admin/customers/${customer.id}/orders?page=${page}&limit=10`,
  );
  return (
    <AdminDialog title={`Đơn hàng của ${customer.fullName}`} onClose={onClose}>
      <p className="admin-record-meta mb-3">{customer.email}</p>
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
            ]}
          />
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
            render: (row) => {
              const state = !row.isActive
                ? 'LOCKED'
                : row.emailVerifiedAt
                  ? 'ACTIVE'
                  : 'PENDING_VERIFICATION';
              return (
                <RecordStatus
                  label={customerStates[state]}
                  tone={
                    state === 'ACTIVE'
                      ? 'good'
                      : state === 'LOCKED'
                        ? 'bad'
                        : 'warn'
                  }
                />
              );
            },
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
                aria-label={`Xem đơn hàng của ${row.fullName}`}
              >
                Xem ({row.orderCount})
              </button>
            ),
          },
        ]}
      />
      {selected && (
        <CustomerOrders
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
