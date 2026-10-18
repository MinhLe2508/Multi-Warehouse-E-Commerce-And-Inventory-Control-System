'use client';

import React from 'react';
import { Edit3, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { ProductInventoryItem, Warehouse, WarehouseStockDetail } from '../../shared/types/admin';
import { calculateAvailabilityRate } from '../../shared/lib/inventoryStatus';
import { StockBadge } from './StatusBadge';

interface InventoryTableProps {
  products: ProductInventoryItem[];
  warehouses: Warehouse[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalFilteredCount: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpenAdjust: (product: ProductInventoryItem, detail: WarehouseStockDetail) => void;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({
  products,
  warehouses,
  page,
  pageSize,
  totalPages,
  totalFilteredCount,
  onPageChange,
  onPageSizeChange,
  onOpenAdjust,
}) => {
  const startItem = totalFilteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalFilteredCount);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col transition-all">
      {/* Table Container với scroll ngang mượt mà */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50/90 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
              <th className="py-3.5 px-4 sticky left-0 bg-slate-50/95 backdrop-blur z-20 min-w-[240px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                Sản phẩm & SKU
              </th>
              <th className="py-3.5 px-3 min-w-[110px]">Danh mục</th>
              <th className="py-3.5 px-3 min-w-[160px] bg-purple-50/60 text-purple-900 border-x border-purple-100/80 text-center">
                Tổng toàn quốc
              </th>
              {warehouses.map((wh) => (
                <th
                  key={wh.id}
                  className="py-3.5 px-3 min-w-[170px] text-center border-r border-slate-200/70"
                >
                  <div className="font-semibold text-slate-800">{wh.name}</div>
                  <div className="text-[10px] text-slate-400 font-normal tracking-normal uppercase">
                    Mã kho: {wh.code}
                  </div>
                </th>
              ))}
              <th className="py-3.5 px-4 text-center min-w-[110px]">Trạng thái</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + warehouses.length}
                  className="py-12 text-center text-slate-400 font-medium"
                >
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  Không tìm thấy sản phẩm nào phù hợp với bộ lọc hiện tại.
                </td>
              </tr>
            ) : (
              products.map((item) => {
                // Highlight dòng theo trạng thái tổng thể
                const rowHighlight =
                  item.status === 'OUT_OF_STOCK'
                    ? 'bg-rose-50/30 hover:bg-rose-50/60'
                    : item.status === 'LOW_STOCK'
                    ? 'bg-amber-50/20 hover:bg-amber-50/50'
                    : 'hover:bg-slate-50/70';

                const availabilityRate = calculateAvailabilityRate(
                  item.totalAvailable,
                  item.totalStock
                );

                return (
                  <tr key={item.id} className={`transition-colors ${rowHighlight}`}>
                    {/* Cột 1: Tên & SKU (Sticky bên trái) */}
                    <td className="py-3.5 px-4 sticky left-0 bg-white/95 backdrop-blur z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <div className="font-bold text-slate-900 line-clamp-1" title={item.name}>
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-[11px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/60">
                          {item.sku}
                        </code>
                        <span className="text-[10px] text-slate-400">
                          Ngưỡng chuẩn: {item.effectiveThreshold}
                        </span>
                      </div>
                    </td>

                    {/* Cột 2: Danh mục */}
                    <td className="py-3.5 px-3 text-slate-600">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px]">
                        {item.category}
                      </span>
                    </td>

                    {/* Cột 3: Tổng toàn quốc */}
                    <td className="py-3.5 px-3 bg-purple-50/30 border-x border-purple-100/60 text-center">
                      <div className="flex items-center justify-center gap-1.5 font-bold text-sm text-purple-900">
                        <span>{item.totalAvailable}</span>
                        <span className="text-[10px] font-normal text-purple-600">khả dụng</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Tồn: <strong>{item.totalStock}</strong> | Giữ:{' '}
                        <strong className="text-amber-600">{item.totalReserved}</strong>
                      </div>
                      <div className="text-[10px] text-purple-700 font-semibold mt-0.5">
                        Tỷ lệ: {availabilityRate}
                      </div>
                    </td>

                    {/* Cột 4+: Các kho hàng */}
                    {warehouses.map((wh) => {
                      const whDetail = item.warehouses[wh.id] as
                        | WarehouseStockDetail
                        | undefined;

                      if (!whDetail) {
                        return (
                          <td
                            key={wh.id}
                            className="py-3.5 px-3 text-center text-slate-400 italic border-r border-slate-100"
                          >
                            Chưa có dữ liệu
                          </td>
                        );
                      }

                      // Ô kho được tô màu cảnh báo nếu ô đó dưới ngưỡng
                      const cellBg = whDetail.isLowStock
                        ? whDetail.availableStock === 0
                          ? 'bg-rose-50/60 text-rose-900'
                          : 'bg-amber-50/50 text-amber-900'
                        : 'text-slate-700';

                      return (
                        <td
                          key={wh.id}
                          className={`py-3 px-3 border-r border-slate-100 text-center transition-colors ${cellBg}`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-semibold text-slate-500">
                              {whDetail.availableStock === 0 ? (
                                <span className="text-rose-600 font-bold">Hết</span>
                              ) : whDetail.isLowStock ? (
                                <span className="text-amber-600 font-bold">Sắp hết</span>
                              ) : (
                                <span className="text-emerald-600">Đủ</span>
                              )}
                            </span>
                            <button
                              onClick={() => onOpenAdjust(item, whDetail)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white hover:bg-purple-50 text-purple-700 border border-purple-200/80 shadow-2xs transition-all hover:scale-105"
                              title={`Điều chỉnh tồn kho tại ${wh.name}`}
                            >
                              <Edit3 className="w-3 h-3" />
                              Sửa
                            </button>
                          </div>

                          <div className="font-extrabold text-sm">
                            {whDetail.availableStock}{' '}
                            <span className="text-[10px] font-normal text-slate-400">kd</span>
                          </div>

                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-center gap-1.5">
                            <span>T: {whDetail.stock}</span>
                            <span>•</span>
                            <span className="text-amber-600 font-medium">
                              G: {whDetail.reservedStock}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            Ngưỡng: {whDetail.effectiveThreshold}
                          </div>
                        </td>
                      );
                    })}

                    {/* Cột cuối: Trạng thái tổng thể */}
                    <td className="py-3.5 px-4 text-center">
                      <StockBadge status={item.status} size="sm" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-5 py-4 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <span>
            Hiển thị <strong>{startItem}</strong> - <strong>{endItem}</strong> trong tổng số{' '}
            <strong>{totalFilteredCount}</strong> sản phẩm
          </span>

          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-300">
            <span>Hiển thị</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium text-slate-700"
            >
              <option value={10}>10 SP/trang</option>
              <option value={20}>20 SP/trang</option>
              <option value={50}>50 SP/trang</option>
            </select>
          </div>
        </div>

        {/* Nút phân trang */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang đầu"
          >
            <ChevronsLeft className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang trước"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>

          <span className="px-3 py-1 text-xs font-semibold text-slate-700">
            Trang {page} / {totalPages}
          </span>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang tiếp"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang cuối"
          >
            <ChevronsRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
