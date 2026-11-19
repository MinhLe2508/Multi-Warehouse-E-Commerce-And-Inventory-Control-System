'use client';

import { useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { useAdminCtx } from '../../../components/admin/AdminContext';
import { RevenueChart } from '../../../components/admin/RevenueChart';
import {
  useDashboardAnalytics,
  type RevenueSeriesPointApi,
} from '../../../hooks/useAdminAnalytics';
import { STATUS_LABEL, formatVnd } from '../../../shared/lib/format';
import type { OrderStatus } from '../../../shared/types/admin';
import {
  AdminDataTable,
  AdminFeedback,
  AdminPageFrame,
  RefreshButton,
  WarehouseScope,
} from '../../../components/admin/operations/AdminUi';

function exportSeries(
  series: RevenueSeriesPointApi[],
  from: string,
  to: string,
) {
  const csv = [
    'Ngày,Doanh thu (VND),Số đơn',
    ...series.map((row) => `${row.date},${row.revenue},${row.orderCount}`),
  ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `doanh-thu-${from}-den-${to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const { warehouseId } = useAdminCtx();
  const report = useDashboardAnalytics(warehouseId);
  const { summary, series, loading, error, refresh } = report;
  const [range, setRange] = useState({
    from: report.fromDate,
    to: report.toDate,
  });

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    report.setFromDate(range.from);
    report.setToDate(range.to);
  }

  return (
    <AdminPageFrame
      title="Thống kê & báo cáo"
      description="Tổng hợp theo ngày tạo của đơn hàng, theo giờ Việt Nam. Doanh thu gồm các đơn đã xác nhận, đang giao và đã giao."
      actions={
        <>
          <RefreshButton onClick={refresh} disabled={loading} />
          <button
            className="btn btn-gradient-purple btn-sm admin-workspace-button"
            type="button"
            disabled={!series.length || loading}
            onClick={() => exportSeries(series, report.fromDate, report.toDate)}
          >
            <Download size={16} aria-hidden="true" /> Tải CSV
          </button>
        </>
      }
    >
      <form
        className="admin-workspace-panel admin-workspace-filters"
        onSubmit={apply}
      >
        <label>
          <span>Từ ngày</span>
          <input
            className="form-control"
            type="date"
            required
            max={range.to || undefined}
            value={range.from}
            onChange={(event) =>
              setRange({ ...range, from: event.target.value })
            }
          />
        </label>
        <label>
          <span>Đến ngày</span>
          <input
            className="form-control"
            type="date"
            required
            min={range.from || undefined}
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
          />
        </label>
        <WarehouseScope />
        <button
          className="btn btn-gradient-purple admin-workspace-button"
          type="submit"
        >
          Áp dụng
        </button>
      </form>
      {summary ? (
        <>
          <dl className="admin-workspace-panel admin-summary-strip p-3 p-md-4">
            <div>
              <dt>Doanh thu</dt>
              <dd>{formatVnd(Number(summary.revenue.total))}</dd>
            </div>
            <div>
              <dt>Đơn có doanh thu</dt>
              <dd>{summary.revenue.orderCount}</dd>
            </div>
            <div>
              <dt>Giữ hàng hết hạn</dt>
              <dd>{summary.expiredReservations}</dd>
            </div>
          </dl>
          <RevenueChart
            data={series.map((row) => ({
              date: row.date,
              revenue: Number(row.revenue),
              orders: row.orderCount,
            }))}
          />
          <div className="admin-report-panels">
            <section className="admin-workspace-panel overflow-hidden">
              <h2 className="h6 p-3 mb-0">Đơn theo trạng thái</h2>
              <dl className="admin-report-statuses mb-0">
                {(
                  Object.entries(summary.ordersByStatus) as [
                    OrderStatus,
                    number,
                  ][]
                ).map(([status, count]) => (
                  <div key={status}>
                    <dt>{STATUS_LABEL[status]}</dt>
                    <dd>{count}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="admin-workspace-panel overflow-hidden">
              <h2 className="h6 p-3 mb-0">Sản phẩm bán nổi bật</h2>
              <AdminDataTable
                rows={summary.topProducts.map((row) => ({
                  ...row,
                  id: row.productId,
                }))}
                empty="Chưa có sản phẩm bán trong kỳ."
                columns={[
                  {
                    heading: 'Sản phẩm',
                    render: (row) => (
                      <>
                        <strong>{row.name}</strong>
                        <div className="admin-record-meta">{row.sku}</div>
                      </>
                    ),
                  },
                  {
                    heading: 'Đã bán',
                    className: 'text-end text-nowrap',
                    render: (row) => row.quantitySold,
                  },
                  {
                    heading: 'Doanh thu',
                    className: 'text-end text-nowrap',
                    render: (row) => formatVnd(Number(row.revenue)),
                  },
                ]}
              />
            </section>
          </div>
        </>
      ) : (
        <AdminFeedback
          loading={loading}
          error={error ?? undefined}
          retry={refresh}
        />
      )}
    </AdminPageFrame>
  );
}
