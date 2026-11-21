'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAdminResource, RecordStatus } from '@/components/admin/operations/AdminUi';
import { apiPatch, extractErrorMessage } from '@/shared/lib/apiClient';
import { dateTime, query, STAFF_NOTIFICATIONS_CHANGED, type List } from './data';
import { AdminFeedback, AdminPager, Field, Filters, PageTitle, Refresh } from './PortalUi';

const pageSize = 20;
const types = { LOW_STOCK: 'Tồn kho', ORDER_UPDATE: 'Đơn hàng', SYSTEM: 'Hệ thống' };
type Notice = {
  id: string; type: keyof typeof types; title: string; body: string; referenceId: string | null;
  referenceType: string | null; warehouseId: string | null; isRead: boolean; createdAt: string;
};

function related(notice: Notice) {
  if (!notice.referenceId) return null;
  if (notice.referenceType === 'StockAlert') return query('/staff/inventory/alerts', { alert: notice.referenceId });
  if (notice.referenceType?.toLowerCase() === 'order') {
    const ordersPath = notice.warehouseId ? '/staff/orders/' : '/orders/';
    return ordersPath + encodeURIComponent(notice.referenceId);
  }
  return null;
}

export function StaffNotifications() {
  const [filters, setFilters] = useState({ type: '', unreadOnly: '' });
  const [page, setPage] = useState(1);
  const [mutating, setMutating] = useState(false);
  const [feedback, setFeedback] = useState('');
  const mutation = useRef(false);
  const resource = useAdminResource<List<Notice>>(query('/notifications', {
    ...filters, limit: pageSize, offset: (page - 1) * pageSize,
  }));

  async function mark(id?: string) {
    if (mutation.current) return;
    mutation.current = true;
    setMutating(true);
    setFeedback('');
    try {
      await apiPatch(id ? `/notifications/${id}/read` : '/notifications/read-all', {});
      setPage(1); resource.refresh();
      window.dispatchEvent(new Event(STAFF_NOTIFICATIONS_CHANGED));
    } catch (error) {
      setFeedback(extractErrorMessage(error, 'Không cập nhật được thông báo.'));
    } finally {
      mutation.current = false; setMutating(false);
    }
  }

  return <>
    <PageTitle title="Thông báo" actions={<>
      <Refresh onClick={resource.refresh} disabled={resource.loading} />
      <button className="staff-button primary" type="button" disabled={mutating} onClick={() => void mark()}>Đánh dấu tất cả đã đọc</button>
    </>} />
    {feedback && <p className="staff-notice danger" role="alert">{feedback}</p>}
    <Filters onApply={(form) => {
      setPage(1); setFilters({ type: String(form.get('type')), unreadOnly: String(form.get('unreadOnly')) });
    }} onReset={() => { setPage(1); setFilters({ type: '', unreadOnly: '' }); }}>
      <Field label="Loại thông báo"><select name="type">
        <option value="">Tất cả loại</option>
        {Object.entries(types).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></Field>
      <Field label="Trạng thái"><select name="unreadOnly"><option value="">Tất cả</option><option value="true">Chưa đọc</option></select></Field>
    </Filters>
    <section className="staff-panel padded" aria-label="Hộp thông báo">
      <AdminFeedback loading={resource.loading} error={resource.error ?? undefined} retry={resource.refresh}
        empty={!resource.data?.items.length ? 'Không có thông báo phù hợp.' : undefined} />
      {resource.data && <ul className="staff-list">
        {resource.data.items.map((notice) => {
          const href = related(notice);
          return <li key={notice.id} className="staff-list-row">
            <div>
              <RecordStatus label={types[notice.type]} tone={notice.isRead ? 'neutral' : 'accent'} />
              {!notice.isRead && <span className="ms-2 staff-muted">Chưa đọc</span>}
              <div className="mt-1"><strong>{notice.title}</strong></div>
              <div>{notice.body}</div><small>{dateTime(notice.createdAt)}</small>
            </div>
            <div className="staff-actions">
              {href && <Link href={href} className="staff-button">Mở nội dung</Link>}
              {!notice.isRead && <button type="button" className="staff-button" disabled={mutating} onClick={() => void mark(notice.id)}>Đánh dấu đã đọc</button>}
            </div>
          </li>;
        })}
      </ul>}
      {resource.data && resource.data.total > 0 && <AdminPager total={resource.data.total} page={page}
        totalPages={Math.ceil(resource.data.total / pageSize)} onChange={setPage} />}
    </section>
  </>;
}
