'use client';

import { useState } from 'react';
import { useAdminCtx } from '@/components/admin/AdminContext';
import { useAdminResource, RecordStatus } from '@/components/admin/operations/AdminUi';
import { count, dateTime, query, warehouseParam, type List, type Warehouse } from './data';
import { Field, Filters, PageTitle, Records, Refresh } from './PortalUi';

const pageSize = 20;
const reasons = {
  RESERVE: 'Giữ hàng', COMMIT: 'Trừ kho', RELEASE: 'Trả chỗ', EXPIRE: 'Hết hạn',
  RESTOCK: 'Nhập kho', MANUAL_ADJUST: 'Điều chỉnh',
};

type Audit = {
  id: string; reason: keyof typeof reasons; createdAt: string;
  stockBefore: number; stockAfter: number; reservedBefore: number; reservedAfter: number;
  quantityDelta: number; note: string | null; actor: { fullName: string } | null;
  inventory: { product: { sku: string; name: string }; warehouse: Warehouse };
};

function AuditList({ warehouseId }: { warehouseId: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const resource = useAdminResource<List<Audit>>(query('/staff/inventory/audit-logs', {
    ...filters, warehouseId: warehouseParam(warehouseId), page, limit: pageSize,
  }));

  return <>
    <PageTitle title="Lịch sử thao tác kho" actions={<Refresh onClick={resource.refresh} disabled={resource.loading} />} />
    <Filters onApply={(form) => {
      setPage(1);
      setFilters(Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()])));
    }} onReset={() => { setPage(1); setFilters({}); }}>
      <Field label="Sản phẩm hoặc SKU"><input name="search" type="search" maxLength={200} /></Field>
      <Field label="Người thực hiện"><input name="actor" type="search" maxLength={150} /></Field>
      <Field label="Loại thao tác"><select name="reason"><option value="">Mọi thao tác</option>
        {Object.entries(reasons).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></Field>
      <Field label="Từ ngày"><input type="date" name="from" /></Field>
      <Field label="Đến ngày"><input type="date" name="to" /></Field>
    </Filters>
    <Records {...resource} label="Nhật ký tồn kho" empty="Không có thao tác phù hợp."
      page={page} pageSize={pageSize} onPage={setPage} columns={[
        { title: 'Sản phẩm', render: (row) => <><strong>{row.inventory.product.name}</strong><div className="staff-muted">{row.inventory.product.sku}</div></> },
        { title: 'Kho', render: (row) => <span className="staff-nowrap">{row.inventory.warehouse.code}</span> },
        { title: 'Thao tác', render: (row) => <RecordStatus label={reasons[row.reason]} tone={row.reason === 'RESTOCK' ? 'good' : 'neutral'} /> },
        { title: 'Tồn vật lý', align: 'right', render: (row) => <span className="staff-nowrap">{count(row.stockBefore)} → {count(row.stockAfter)}</span> },
        { title: 'Giữ chỗ', align: 'right', render: (row) => <span className="staff-nowrap">{count(row.reservedBefore)} → {count(row.reservedAfter)}</span> },
        { title: 'Thay đổi', align: 'right', render: (row) => (row.quantityDelta > 0 ? '+' : '') + count(row.quantityDelta) },
        { title: 'Người thực hiện', render: (row) => row.actor?.fullName ?? 'Hệ thống' },
        { title: 'Thời gian', render: (row) => <span className="staff-nowrap">{dateTime(row.createdAt)}</span> },
        { title: 'Ghi chú', render: (row) => row.note || '—' },
      ]} />
  </>;
}

export function StaffAudit() {
  const { warehouseId } = useAdminCtx();
  return <AuditList key={warehouseId} warehouseId={warehouseId} />;
}
