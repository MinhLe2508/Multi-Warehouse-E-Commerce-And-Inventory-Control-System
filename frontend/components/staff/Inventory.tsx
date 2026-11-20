'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Download, PackagePlus } from 'lucide-react';
import ProductImage from '@/components/products/ProductImage';
import { useAdminResource } from '@/components/admin/operations/AdminUi';
import { StockBadge } from '@/components/admin/StatusBadge';
import { apiGet, extractErrorMessage } from '@/shared/lib/apiClient';
import { Dialog, Field, Filters, PageTitle, Records, Refresh, type Column } from './PortalUi';
import { type Item, type List, count, dateTime, getStockStatus, query, restockHref, warehouseParam } from './data';
import { useLinkedWarehouse } from './StaffShell';

const pageSize = 20;

export function StockItemLabel({ item }: { item: Item }) {
  return <span className="staff-product-cell">
    <span className="staff-thumb"><ProductImage src={item.product.imageUrl} alt="" fill sizes="40px" /></span>
    <span><strong>{item.product.name}</strong><small>{item.product.sku}</small></span>
  </span>;
}

export function StockNumbers({ item }: { item: Item }) {
  return <dl className="staff-details">
    <dt>Kho</dt><dd>{item.warehouse.code} · {item.warehouse.name}</dd>
    <dt>Tồn vật lý</dt><dd>{count(item.stock)}</dd><dt>Giữ chỗ</dt><dd>{count(item.reservedStock)}</dd>
    <dt>Khả dụng</dt><dd className="staff-number-emphasis">{count(item.availableStock)}</dd>
    <dt>Ngưỡng cảnh báo</dt><dd>{count(item.effectiveThreshold)}</dd>
    <dt>Trạng thái</dt><dd><StockBadge status={getStockStatus(item)} /></dd>
  </dl>;
}

function csvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function InventoryList({ warehouseId, initialSku }: { warehouseId: string; initialSku?: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [exactSku, setExactSku] = useState(initialSku);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Item | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const params = { ...filters, sku: exactSku, warehouseId: warehouseParam(warehouseId) };
  const resource = useAdminResource<List<Item>>(query('/inventory', { ...params, limit: pageSize, offset: (page - 1) * pageSize }));
  const categories = useAdminResource<Array<{ id: string; name: string }>>('/categories');
  const columns: Column<Item>[] = [
    { title: 'Sản phẩm', render: (item) => <StockItemLabel item={item} /> },
    { title: 'Danh mục', render: (item) => item.product.category?.name ?? '—' },
    { title: 'Kho', render: (item) => <span className="staff-nowrap">{item.warehouse.code}</span> },
    { title: 'Tồn vật lý', align: 'right', render: (item) => count(item.stock) },
    { title: 'Giữ chỗ', align: 'right', render: (item) => count(item.reservedStock) },
    { title: 'Khả dụng', align: 'right', render: (item) => <span className={`staff-number-emphasis ${item.availableStock === 0 ? 'zero' : ''}`}>{count(item.availableStock)}</span> },
    { title: 'Ngưỡng', align: 'right', render: (item) => count(item.effectiveThreshold) },
    { title: 'Trạng thái', render: (item) => <StockBadge status={getStockStatus(item)} size="sm" /> },
    { title: 'Thao tác', render: (item) => <div className="staff-actions">
      <button type="button" className="staff-button" onClick={() => setDetail(item)}>Chi tiết</button>
      <Link className="staff-button" href={restockHref(item.id, item.warehouseId)}>Nhập kho</Link>
    </div> },
  ];

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const rows: Array<Array<string | number>> = [['SKU', 'Sản phẩm', 'Danh mục', 'Kho', 'Tồn vật lý', 'Giữ chỗ', 'Khả dụng', 'Ngưỡng', 'Trạng thái']];
      const seen = new Set<string>();
      let offset = 0;
      const limit = 100;
      do {
        const batch = await apiGet<List<Item>>(query('/inventory', { ...params, limit, offset }));
        for (const item of batch.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          rows.push([item.product.sku, item.product.name, item.product.category?.name ?? '',
            item.warehouse.code, item.stock, item.reservedStock, item.availableStock, item.effectiveThreshold, getStockStatus(item)]);
        }
        offset += batch.items.length;
        if (!batch.items.length || offset >= batch.total) break;
      } while (true);
      const blob = new Blob(['\uFEFF', rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = 'ton-kho.csv';
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(extractErrorMessage(error, 'Không xuất được bảng tồn kho.'));
    } finally {
      setExporting(false);
    }
  }

  return <>
    <PageTitle title="Tồn kho" actions={<>
      <Refresh onClick={resource.refresh} disabled={resource.loading} />
      <button className="staff-button" type="button" disabled={exporting || !resource.data?.total} onClick={() => void exportCsv()}>
        <Download size={15} aria-hidden="true" /> {exporting ? 'Đang xuất…' : 'Tải CSV'}
      </button>
      <Link className="staff-button primary" href="/staff/inventory/restock"><PackagePlus size={16} /> Nhập kho</Link>
    </>} />
    {exportError && <p className="staff-notice danger" role="alert">{exportError}</p>}
    <Filters onApply={(form) => {
      setPage(1);
      setExactSku(undefined);
      setFilters(Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()])));
    }} onReset={() => { setPage(1); setFilters({}); setExactSku(undefined); }}>
      <Field label="Tên sản phẩm hoặc SKU"><input name="search" type="search" defaultValue={initialSku} maxLength={160} />
      </Field>
      <Field label="Danh mục"><select name="categoryId">
        <option value="">Tất cả danh mục</option>
        {categories.data?.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
      </select></Field>
      <Field label="Tình trạng"><select name="status">
        <option value="">Mọi tình trạng</option><option value="IN_STOCK">Đủ hàng</option>
        <option value="LOW_STOCK">Sắp hết</option><option value="OUT_OF_STOCK">Hết hàng</option>
      </select></Field>
      <Field label="Sắp xếp"><select name="sort">
        <option value="">Theo kho và tên</option><option value="AVAILABLE_ASC">Khả dụng tăng dần</option>
        <option value="AVAILABLE_DESC">Khả dụng giảm dần</option>
      </select></Field>
    </Filters>
    {exactSku && <p className="staff-notice">Đang tra cứu SKU <strong>{exactSku}</strong>.</p>}
    <Records {...resource} page={page} pageSize={pageSize} onPage={setPage}
      label="Bảng tồn kho" columns={columns} empty="Không có dòng tồn kho phù hợp." />
    {detail && <Dialog title="Chi tiết tồn kho" onClose={() => setDetail(null)}>
      <StockItemLabel item={detail} /><StockNumbers item={detail} />
      <dl className="staff-details">
        <dt>Cập nhật gần nhất</dt><dd>{dateTime(detail.updatedAt)}</dd>
        <dt>Nhập gần nhất</dt><dd>{dateTime(detail.lastRestockedAt)}</dd>
      </dl>
      <Link className="staff-button primary mt-3" href={restockHref(detail.id, detail.warehouseId)}>Nhập vào kho này</Link>
    </Dialog>}
  </>;
}

export function StaffInventory({ warehouse, sku }: { warehouse?: string; sku?: string }) {
  const warehouseId = useLinkedWarehouse(warehouse);
  return <InventoryList key={JSON.stringify([warehouseId, sku])} warehouseId={warehouseId} initialSku={sku} />;
}
