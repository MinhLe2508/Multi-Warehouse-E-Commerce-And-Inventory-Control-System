'use client';

import React, { useSyncExternalStore } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Package,
  Boxes,
  Lock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Warehouse as WarehouseIcon,
  TrendingUp,
} from 'lucide-react';
import type { InventorySummaryResponse } from '../../shared/types/admin';

interface WarehouseStockChartProps {
  summary: InventorySummaryResponse | null;
  variant?: 'admin' | 'staff';
}

const emptySubscribe = () => () => {};

function StaffWarehouseDistribution({
  warehouses,
}: {
  warehouses: InventorySummaryResponse['warehouseDistribution'];
}) {
  if (warehouses.length === 0) {
    return <p className="small text-secondary mb-0">Không có dữ liệu kho theo bộ lọc.</p>;
  }

  const maxStock = warehouses.reduce(
    (max, warehouse) => Math.max(max, warehouse.totalAvailable + warehouse.totalReserved),
    1,
  );

  return (
    <ul className="list-unstyled d-grid gap-3 mb-0" aria-label="Phân bổ tồn kho theo kho">
      {warehouses.map((warehouse) => (
        <li key={warehouse.warehouseId}>
          <div className="d-flex flex-wrap gap-2 small mb-2">
            <strong>{warehouse.warehouseCode}</strong>
            <span className="text-secondary">{warehouse.warehouseName}</span>
          </div>
          <div className="staff-stock-track" aria-hidden="true">
            <span
              className="staff-stock-available"
              style={{ width: `${(warehouse.totalAvailable / maxStock) * 100}%` }}
            />
            <span
              className="staff-stock-reserved"
              style={{ width: `${(warehouse.totalReserved / maxStock) * 100}%` }}
            />
          </div>
          <div className="d-flex flex-wrap gap-3 small text-secondary mt-2">
            <span>
              <span className="staff-stock-key staff-stock-available" aria-hidden="true" />
              Khả dụng <strong>{warehouse.totalAvailable.toLocaleString('vi-VN')}</strong>
            </span>
            <span>
              <span className="staff-stock-key staff-stock-reserved" aria-hidden="true" />
              Giữ chỗ <strong>{warehouse.totalReserved.toLocaleString('vi-VN')}</strong>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export const WarehouseStockChart: React.FC<WarehouseStockChartProps> = ({
  summary,
  variant = 'admin',
}) => {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!summary) return null;

  const { kpis, warehouseDistribution, topLowStockProducts } = summary;

  const chartData = warehouseDistribution.map((item) => ({
    name: item.warehouseCode,
    'Khả dụng': item.totalAvailable,
    'Giữ chỗ': item.totalReserved,
  }));

  return (
    <div className="space-y-6 mb-6">
      {/* 6 KPIs Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* KPI 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Sản phẩm</span>
            <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-800">{kpis.totalProducts}</div>
          <span className="text-[10px] text-slate-400">SKU theo bộ lọc</span>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Tồn vật lý</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-blue-700">
            {kpis.totalStock.toLocaleString('vi-VN')}
          </div>
          <span className="text-[10px] text-slate-400">
            {warehouseDistribution.length} kho trong phạm vi
          </span>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Đang giữ chỗ</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-amber-600">
            {kpis.totalReserved.toLocaleString('vi-VN')}
          </div>
          <span className="text-[10px] text-amber-600 font-medium">Đơn chờ thanh toán</span>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Khả dụng</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-emerald-600">
            {kpis.totalAvailable.toLocaleString()}
          </div>
          <span className="text-[10px] text-emerald-600 font-medium">Sẵn sàng bán</span>
        </div>

        {/* KPI 5 */}
        <div className="bg-white p-4 rounded-2xl border border-amber-200/70 shadow-2xs bg-gradient-to-b from-amber-50/20 to-white">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium text-amber-700">Sắp hết hàng</span>
            <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-amber-700">{kpis.lowStockCount}</div>
          <span className="text-[10px] text-amber-600">Dưới ngưỡng kho</span>
        </div>

        {/* KPI 6 */}
        <div className="bg-white p-4 rounded-2xl border border-rose-200/70 shadow-2xs bg-gradient-to-b from-rose-50/20 to-white">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium text-rose-700">Đã hết hàng</span>
            <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-rose-700">{kpis.outOfStockCount}</div>
          <span className="text-[10px] text-rose-600">Khả dụng = 0</span>
        </div>
      </div>

      {/* Grid Biểu đồ & Thẻ kho */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div
          className={`lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col ${variant === 'admin' ? 'justify-between' : ''}`}
        >
          <div className="mb-3">
            <h2 className="admin-panel-heading d-flex align-items-center gap-2">
              <TrendingUp size={16} className="text-blue-700" aria-hidden="true" />
              Phân bổ tồn kho theo kho
            </h2>
          </div>

          {variant === 'staff' ? (
            <StaffWarehouseDistribution warehouses={warehouseDistribution} />
          ) : (
            <div className="w-full h-64">
              {mounted && chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar
                      dataKey="Khả dụng"
                      fill="#1e40af"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                    <Bar
                      dataKey="Giữ chỗ"
                      fill="#38bdf8"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                  {mounted ? 'Không có dữ liệu kho theo bộ lọc' : 'Đang tải biểu đồ...'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danh sách kho và Top cảnh báo */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="admin-panel-heading d-flex align-items-center gap-2 mb-3">
              <WarehouseIcon size={16} className="text-blue-700" aria-hidden="true" />
              Mức sử dụng kho
            </h2>
            <div className="space-y-3.5">
              {warehouseDistribution.map((wh) => (
                <div
                  key={wh.warehouseId}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/70"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs font-bold text-slate-800 mb-1">
                    <span>{wh.warehouseCode}</span>
                    <span className="text-blue-800">
                      {wh.capacityRate === null
                        ? 'Không giới hạn'
                        : `${wh.capacityRate.toLocaleString('vi-VN')}%`}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-1.5 truncate">
                    {wh.warehouseName}
                  </div>
                  {wh.capacityRate !== null && (
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          wh.capacityRate > 100
                            ? 'bg-rose-500'
                            : wh.capacityRate >= 85
                            ? 'bg-amber-500'
                            : 'bg-blue-700'
                        }`}
                        style={{ width: `${Math.min(100, wh.capacityRate)}%` }}
                      />
                    </div>
                  )}
                  <div className="text-[11px] text-slate-600 mt-1">
                    Đang lưu {wh.occupiedStock.toLocaleString('vi-VN')}
                    {wh.capacity !== null && ` / ${wh.capacity.toLocaleString('vi-VN')}`} sản phẩm
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top 3 mặt hàng cần lưu ý */}
          {topLowStockProducts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-rose-700 block mb-1.5">
                Cần nhập hàng khẩn cấp:
              </span>
              <div className="space-y-1">
                {topLowStockProducts.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-[11px] text-slate-600"
                  >
                    <span className="truncate max-w-[170px]" title={item.name}>
                      {item.sku} - {item.name}
                    </span>
                    <span className="font-bold text-rose-600">
                      {item.totalAvailable === 0 ? 'Hết hàng' : `Còn ${item.totalAvailable}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
