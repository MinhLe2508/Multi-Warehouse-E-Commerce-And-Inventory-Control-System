'use client';

import Link from 'next/link';
import { AlertTriangle, Archive, ArrowRight, ClipboardList, Truck, type LucideIcon } from 'lucide-react';
import { useAdminCtx } from '@/components/admin/AdminContext';
import { useAdminResource } from '@/components/admin/operations/AdminUi';
import { AlertBadge } from '@/components/admin/StatusBadge';
import { useCurrentAdminUser } from '@/hooks/useCurrentAdminUser';
import { useStaffProfile } from './StaffShell';
import { useInventoryRealtime } from '@/hooks/useInventoryRealtime';
import { AdminFeedback, PageTitle, Refresh } from './PortalUi';
import { type AlertItem, count, dateTime, query, restockHref, warehouseParam } from './data';

type DashboardData = {
  today: string; ready: number; waiting: number; shippedToday: number; openAlerts: number;
  restockEvents: number; restockedUnits: number;
  inventory: {
    totalStock: number; totalReserved: number; totalAvailable: number;
    productsByStatus: { IN_STOCK: number; LOW_STOCK: number; OUT_OF_STOCK: number };
  };
  queue: Array<{ id: string; orderCode: string; shippingRecipient: string; createdAt: string; units: number; warehouses: string[] }>;
  alerts: AlertItem[];
  shipped: Array<{ day: string; count: number }>;
};

function StatCard({ title, amount, hint, href, icon: Icon }: {
  title: string; amount: number; hint?: string; href?: string; icon: LucideIcon;
}) {
  const content = <>
    <span className="staff-stat-icon"><Icon size={19} aria-hidden="true" /></span>
    <span>{title}</span><strong>{count(amount)}</strong>{hint && <small>{hint}</small>}
  </>;
  return href ? <Link href={href} className="staff-panel staff-stat-card">{content}</Link>
    : <div className="staff-panel staff-stat-card">{content}</div>;
}

export function StaffDashboard({ notice }: { notice?: string }) {
  const { warehouseId, warehouses } = useAdminCtx();
  const { user } = useCurrentAdminUser();
  const profile = useStaffProfile();
  const resource = useAdminResource<DashboardData>(query('/staff/dashboard', { warehouseId: warehouseParam(warehouseId) }));
  useInventoryRealtime({ onInventoryChanged: resource.refresh, onLowStockAlert: resource.refresh, onReconnectSync: resource.refresh });
  const selected = warehouses.find(({ id }) => id === warehouseId);
  const data = resource.data;
  const total = data && Object.values(data.inventory.productsByStatus).reduce((sum, n) => sum + n, 0);
  const maxShipped = data ? Math.max(1, ...data.shipped.map(({ count }) => count)) : 1;
  const today = data?.today.split('-').reverse().join('/');

  return <>
    {notice && <p className="staff-notice" role="status">{notice}</p>}
    <PageTitle title="Tổng quan kho hàng"
      description={[`Xin chào, ${profile?.fullName ?? user.name}`, today, selected?.name ?? 'Tất cả kho được giao'].filter(Boolean).join(' · ')}
      actions={<Refresh onClick={() => resource.refresh()} disabled={resource.loading} />}
    />
    <AdminFeedback loading={resource.loading} error={resource.error ?? undefined} retry={resource.refresh} />
    {data && profile?.warehouses.length === 0 && warehouses.length === 0 &&
      <p className="staff-notice">Tài khoản chưa có kho đang hoạt động được giao. Liên hệ quản trị viên để được phân kho.</p>}
    {data && <>
      <div className="staff-stats">
        <StatCard title="Đơn cần xuất kho" amount={data.ready} icon={ClipboardList} href="/staff/dispatch" hint="Đã xác nhận, chờ xuất" />
        <StatCard title="Đơn đã xuất hôm nay" amount={data.shippedToday} icon={Truck} />
        <StatCard title="Tồn kho vật lý" amount={data.inventory.totalStock} icon={Archive} href="/staff/inventory"
          hint={`Khả dụng ${count(data.inventory.totalAvailable)} · Giữ chỗ ${count(data.inventory.totalReserved)}`} />
        <StatCard title="Cảnh báo đang mở" amount={data.openAlerts} icon={AlertTriangle} href="/staff/inventory/alerts" />
      </div>
      <div className="staff-grid-two">
        <section className="staff-panel padded">
          <div className="staff-section-title">
            <h2>Đơn chờ xuất kho</h2>
            <Link href="/staff/dispatch" className="staff-link">Xem hàng đợi <ArrowRight size={14} /></Link>
          </div>
          {data.queue.length ? <ol className="staff-list">
            {data.queue.map((order) => <li key={order.id} className="staff-list-row">
              <div><strong>{order.orderCode}</strong> · {order.shippingRecipient}
                <small>{order.warehouses.join(', ')} · {count(order.units)} sản phẩm · {dateTime(order.createdAt)}</small>
              </div>
              <Link className="staff-button" href={`/staff/orders/${order.id}`}>Chi tiết</Link>
            </li>)}
          </ol> : <AdminFeedback empty="Chưa có đơn đã xác nhận cần xuất kho." />}
          {data.waiting > 0 && <p className="mt-3 mb-0">
            <Link className="staff-link" href="/staff/orders?status=PENDING_PAYMENT">{count(data.waiting)} đơn đang giữ hàng chờ thanh toán</Link>
          </p>}
        </section>
        <section className="staff-panel padded">
          <div className="staff-section-title">
            <h2>Cảnh báo cần chú ý</h2>
            <Link className="staff-link" href="/staff/inventory/alerts">Xem tất cả</Link>
          </div>
          {data.alerts.length ? <ul className="staff-list">
            {data.alerts.map((alert) => <li key={alert.id} className="staff-list-row">
              <div>
                <AlertBadge level={alert.alertLevel} /> <strong>{alert.product.name}</strong>
                <small>{alert.warehouse.code} · {alert.product.sku} · Còn {count(alert.currentAvailable)}</small>
              </div>
              <Link className="staff-button" href={restockHref(alert.inventoryId, alert.warehouse.id)}>Nhập kho</Link>
            </li>)}
          </ul> : <AdminFeedback empty="Không có cảnh báo đang mở." />}
        </section>
      </div>
      <div className="staff-grid-two">
        <section className="staff-panel padded">
          <div className="staff-section-title"><h2>Đơn xuất kho trong 7 ngày</h2></div>
          <ol className="staff-chart" aria-label="Số đơn xuất theo ngày">
            {data.shipped.map(({ day, count: amount }) => <li key={day} title={`${day} · ${amount} đơn`}>
              <strong>{count(amount)}</strong>
              <span aria-hidden="true" className={`staff-chart-bar ${amount === 0 ? 'zero' : ''}`} style={{ height: `${Math.round(110 * amount / maxShipped)}px` }} />
              <time dateTime={day}>{day.slice(5).split('-').reverse().join('/')}</time>
            </li>)}
          </ol>
        </section>
        <section className="staff-panel padded">
          <div className="staff-section-title"><h2>Tình trạng tồn kho</h2></div>
          <div className="staff-metric-group">
            {([
              ['IN_STOCK', 'Đủ hàng', ''],
              ['LOW_STOCK', 'Sắp hết', 'low'],
              ['OUT_OF_STOCK', 'Hết hàng', 'out'],
            ] as const).map(([key, label, tone]) => {
              const amount = data.inventory.productsByStatus[key];
              return <div key={key}><p><span>{label}</span><strong>{count(amount)} SKU</strong></p>
                <div className={`staff-meter ${tone}`} aria-hidden="true"><span style={{ width: `${total ? amount / total * 100 : 0}%` }} /></div>
              </div>;
            })}
          </div>
          <p className="staff-muted mt-3 mb-0">{count(data.restockEvents)} lượt nhập hôm nay · {count(data.restockedUnits)} sản phẩm</p>
        </section>
      </div>
    </>}
  </>;
}
