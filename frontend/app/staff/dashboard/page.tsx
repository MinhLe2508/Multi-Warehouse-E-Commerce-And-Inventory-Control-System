'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowRight, Boxes } from 'lucide-react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import { AlertBadge } from '../../../components/admin/StatusBadge';
import {
  AdminFeedback,
  AdminPageFrame,
  RefreshButton,
} from '../../../components/admin/operations/AdminUi';
import { useDashboardAnalytics } from '../../../hooks/useAdminAnalytics';
import { useStockAlerts } from '../../../hooks/useStockAlerts';
import { staffInventoryHref } from '../../../shared/config/adminNav';

const number = new Intl.NumberFormat('vi-VN');

function StaffNotice() {
  const params = useSearchParams();
  const notice = params.get('notice');
  if (!notice) return null;

  return (
    <div className="alert alert-warning alert-dismissible fade show mb-4 d-flex align-items-center justify-content-between" role="alert">
      <div>
        <strong>Thông báo:</strong> {notice}
      </div>
    </div>
  );
}

export default function StaffDashboardPage() {
  const { warehouseId } = useAdminCtx();
  const inventory = useDashboardAnalytics(warehouseId);
  const alerts = useStockAlerts({ warehouseId, limit: 3 });
  const stock = inventory.inventorySummary;

  function refresh() {
    inventory.refresh();
    alerts.refresh();
  }

  return (
    <AdminPageFrame
      title="Dashboard"
      actions={<RefreshButton onClick={refresh} disabled={inventory.loading || alerts.loading} />}
    >
      <Suspense fallback={null}>
        <StaffNotice />
      </Suspense>

      <AdminFeedback
        error={inventory.error ?? undefined}
        loading={inventory.loading}
        retry={inventory.refresh}
      />

      <div className="row g-3">
        <div className="col-12 col-sm-6">
          <div className="admin-workspace-panel h-100 p-3 p-md-4">
            <div className="small text-secondary d-flex align-items-center gap-2">
              <Boxes size={17} className="text-primary" aria-hidden="true" />
              Số lượng khả dụng
            </div>
            <div className="h3 fw-bold my-2">
              {stock ? number.format(stock.totalAvailable) : '—'}
            </div>
            {stock && (
              <div className="small text-secondary">
                Tồn vật lý {number.format(stock.totalStock)} · Giữ chỗ {number.format(stock.totalReserved)}
              </div>
            )}
          </div>
        </div>
        <div className="col-12 col-sm-6">
          <div className="admin-workspace-panel h-100 p-3 p-md-4">
            <div className="small text-secondary d-flex align-items-center gap-2">
              <AlertTriangle size={17} className="text-danger" aria-hidden="true" />
              Cảnh báo đang mở
            </div>
            <div className="h3 fw-bold my-2">
              {alerts.loading || alerts.error ? '—' : number.format(alerts.total)}
            </div>
            <Link href="/staff/inventory/alerts" className="small fw-semibold">
              Xem danh sách cảnh báo
            </Link>
          </div>
        </div>
      </div>

      <section className="admin-workspace-panel p-3 p-md-4" aria-labelledby="staff-attention">
        <h2 className="admin-panel-heading mb-3" id="staff-attention">Việc cần chú ý</h2>
        {alerts.error || alerts.loading || alerts.alerts.length === 0 ? (
          <AdminFeedback
            error={alerts.error ?? undefined}
            loading={alerts.loading}
            empty="Không có cảnh báo đang mở trong phạm vi đang xem."
            retry={alerts.refresh}
          />
        ) : (
          <ul className="list-group list-group-flush mb-0">
            {alerts.alerts.map((alert) => (
              <li
                key={alert.id}
                className="list-group-item bg-transparent px-0 py-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
              >
                <div>
                  <div className="d-flex flex-wrap align-items-center gap-2 fw-semibold">
                    <AlertBadge level={alert.alertLevel} />
                    <span>{alert.productName}</span>
                  </div>
                  <div className="small text-secondary mt-1">
                    {alert.productSku} · {alert.warehouseCode} · Còn{' '}
                    {number.format(alert.currentAvailable ?? alert.availableAtTrigger)}
                  </div>
                </div>
                <Link
                  href={staffInventoryHref(alert.warehouseId, alert.productSku)}
                  className="btn btn-outline-primary btn-sm admin-workspace-button"
                  aria-label={`Xem tồn kho ${alert.productSku} tại ${alert.warehouseCode}`}
                >
                  Xem tồn kho <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPageFrame>
  );
}
