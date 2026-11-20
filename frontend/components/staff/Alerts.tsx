'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminCtx } from '@/components/admin/AdminContext';
import { useAdminResource, RecordStatus } from '@/components/admin/operations/AdminUi';
import { AlertBadge } from '@/components/admin/StatusBadge';
import { useInventoryRealtime } from '@/hooks/useInventoryRealtime';
import { staffInventoryHref } from '@/shared/config/adminNav';
import { apiPatch } from '@/shared/lib/apiClient';
import { type AlertItem, type List, count, dateTime, query, restockHref, warehouseParam } from './data';
import { Dialog, Field, Filters, PageTitle, Records, Refresh, type Column } from './PortalUi';

const pageSize = 20;

function AlertsList({ warehouseId, alertId }: { warehouseId: string; alertId?: string }) {
  const [status, setStatus] = useState(alertId ? 'ALL' : 'OPEN');
  const [level, setLevel] = useState('');
  const [target, setTarget] = useState(alertId);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AlertItem | null>(null);
  const [resolving, setResolving] = useState<AlertItem | null>(null);
  const [notice, setNotice] = useState('');
  const resource = useAdminResource<List<AlertItem>>(query('/admin/alerts', {
    warehouseId: target ? undefined : warehouseParam(warehouseId), status, alertLevel: level, id: target,
    limit: pageSize, offset: (page - 1) * pageSize,
  }));
  useInventoryRealtime({ onLowStockAlert: resource.refresh, onInventoryChanged: resource.refresh });
  const columns: Column<AlertItem>[] = [
    { title: 'Sản phẩm', render: (alert) => <><strong>{alert.product.name}</strong><div className="staff-muted">{alert.product.sku}</div></> },
    { title: 'Kho', render: (alert) => <span className="staff-nowrap">{alert.warehouse.code}</span> },
    { title: 'Tồn vật lý', align: 'right', render: (alert) => count(alert.currentStock) },
    { title: 'Giữ chỗ', align: 'right', render: (alert) => alert.currentReserved === undefined ? '—' : count(alert.currentReserved) },
    { title: 'Khả dụng', align: 'right', render: (alert) => <strong className="staff-number-emphasis">{count(alert.currentAvailable)}</strong> },
    { title: 'Ngưỡng', align: 'right', render: (alert) => count(alert.effectiveThreshold ?? alert.thresholdAtTrigger) },
    { title: 'Mức độ', render: (alert) => <AlertBadge level={alert.alertLevel} /> },
    { title: 'Phát hiện', render: (alert) => <span className="staff-nowrap">{dateTime(alert.triggeredAt)}</span> },
    { title: 'Xử lý', render: (alert) => <RecordStatus label={alert.status === 'OPEN' ? 'Đang mở' : 'Đã xử lý'} tone={alert.status === 'OPEN' ? 'warn' : 'good'} /> },
    { title: 'Thao tác', render: (alert) => <div className="staff-actions">
      <button className="staff-button" type="button" onClick={() => setDetail(alert)}>Chi tiết</button>
      {alert.status === 'OPEN' && <Link className="staff-button" href={restockHref(alert.inventoryId, alert.warehouse.id)}>Nhập kho</Link>}
    </div> },
  ];

  return <>
    <PageTitle title="Cảnh báo tồn kho" actions={<Refresh onClick={resource.refresh} disabled={resource.loading} />} />
    {notice && <p className="staff-notice success" role="status">{notice}</p>}
    <Filters onApply={(form) => {
      setTarget(undefined); setPage(1); setStatus(String(form.get('status'))); setLevel(String(form.get('level')));
    }} onReset={() => { setTarget(undefined); setPage(1); setStatus(alertId ? 'ALL' : 'OPEN'); setLevel(''); }}>
      <Field label="Mức cảnh báo"><select name="level">
        <option value="">Mọi mức</option><option value="CRITICAL">Hết hàng</option><option value="WARNING">Sắp hết</option>
      </select></Field>
      <Field label="Trạng thái"><select name="status" defaultValue={alertId ? 'ALL' : 'OPEN'}>
        <option value="OPEN">Đang mở</option><option value="RESOLVED">Đã xử lý</option><option value="ALL">Tất cả</option>
      </select></Field>
    </Filters>
    {target && <p className="staff-notice">Đang xem cảnh báo từ thông báo.</p>}
    <Records {...resource} page={page} pageSize={pageSize} onPage={setPage}
      label="Danh sách cảnh báo" empty="Không có cảnh báo phù hợp trong kho đang xem." columns={columns} />
    {detail && <Dialog title="Chi tiết cảnh báo tồn kho" onClose={() => setDetail(null)}>
      <AlertBadge level={detail.alertLevel} /> <strong>{detail.product.name}</strong>
      <dl className="staff-details">
        <dt>SKU</dt><dd>{detail.product.sku}</dd><dt>Kho</dt><dd>{detail.warehouse.name}</dd>
        <dt>Khả dụng hiện tại</dt><dd>{count(detail.currentAvailable)}</dd>
        <dt>Ngưỡng khi phát hiện</dt><dd>{count(detail.thresholdAtTrigger)}</dd>
        <dt>Phát hiện lúc</dt><dd>{dateTime(detail.triggeredAt)}</dd>
        <dt>Đã xử lý lúc</dt><dd>{dateTime(detail.resolvedAt)}</dd>
      </dl>
      <div className="staff-actions mt-3">
        <Link className="staff-button" href={staffInventoryHref(detail.warehouse.id, detail.product.sku)}>Xem tồn kho</Link>
        {detail.status === 'OPEN' && <>
          <Link className="staff-button primary" href={restockHref(detail.inventoryId, detail.warehouse.id)}>Nhập kho</Link>
          <button className="staff-button" type="button" onClick={() => { setResolving(detail); setDetail(null); }}>Đánh dấu đã xử lý</button>
        </>}
      </div>
    </Dialog>}
    {resolving && <Dialog title="Đánh dấu đã xử lý" onClose={() => setResolving(null)}
      onConfirm={() => apiPatch(`/admin/alerts/${resolving.id}/resolve`, {})}
      success={() => { setNotice(`Đã xử lý cảnh báo ${resolving.product.sku} tại ${resolving.warehouse.code}.`); resource.refresh(); }}>
      Xác nhận đã xử lý cảnh báo cho <strong>{resolving.product.name}</strong> tại kho <strong>{resolving.warehouse.code}</strong>.
    </Dialog>}
  </>;
}

export function StaffAlerts({ alertId }: { alertId?: string }) {
  const { warehouseId } = useAdminCtx();
  return <AlertsList key={JSON.stringify([warehouseId, alertId])}
    warehouseId={warehouseId} alertId={alertId} />;
}
