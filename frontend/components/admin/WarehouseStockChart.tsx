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
}

const emptySubscribe = () => () => {};

export const WarehouseStockChart: React.FC<WarehouseStockChartProps> = ({ summary }) => {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!summary) return null;

  const { kpis, warehouseDistribution, topLowStockProducts } = summary;

  const chartData = warehouseDistribution.map((item) => ({
    name: item.warehouseCode,
    fullName: item.warehouseName,
    'Khả dụng': item.totalAvailable,
    'Giữ chỗ': item.totalReserved,
    'Tổng tồn': item.totalStock,
  }));

  return (
    <div className="space-y-6 mb-6">
      {/* 6 KPIs Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* KPI 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Tổng SP</span>
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-extrabold text-slate-800">{kpis.totalProducts}</div>
          <span className="text-[10px] text-slate-400">200 SKU kiểm kê</span>
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
            {kpis.totalStock.toLocaleString()}
          </div>
          <span className="text-[10px] text-slate-400">Toàn bộ 3 kho</span>
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
            {kpis.totalReserved.toLocaleString()}
          </div>
          <span className="text-[10px] text-amber-600 font-medium">Đơn chờ giao</span>
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
        {/* Biểu đồ Recharts */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                Phân bổ tồn kho theo từng kho hàng (FR-DASH-01)
              </h4>
              <p className="text-xs text-slate-500">
                So sánh số lượng Khả dụng (Tím) và Đang giữ chỗ (Xanh) giữa các kho
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              3 Trung tâm phân phối
            </span>
          </div>

          <div className="w-full h-64">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
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
                    fill="#7c3aed"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    dataKey="Giữ chỗ"
                    fill="#0284c7"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                Đang tải biểu đồ...
              </div>
            )}
          </div>
        </div>

        {/* Danh sách kho và Top cảnh báo */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <WarehouseIcon className="w-4 h-4 text-purple-600" />
              Sức chứa & Trọng tải kho
            </h4>
            <div className="space-y-3.5">
              {warehouseDistribution.map((wh) => (
                <div
                  key={wh.warehouseId}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/70"
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1">
                    <span>{wh.warehouseCode}</span>
                    <span className="text-purple-700">{wh.capacityRate}% dung lượng</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mb-1.5 truncate">
                    {wh.warehouseName}
                  </div>
                  {/* Thanh tiến trình sức chứa */}
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        wh.capacityRate > 85
                          ? 'bg-rose-500'
                          : wh.capacityRate > 60
                          ? 'bg-amber-500'
                          : 'bg-purple-600'
                      }`}
                      style={{ width: `${Math.min(100, wh.capacityRate)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                    <span>Tồn: {wh.totalStock.toLocaleString()} cái</span>
                    <span>Khả dụng: {wh.totalAvailable.toLocaleString()} cái</span>
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
