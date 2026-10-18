'use client';

import React from 'react';
import { Search, X, RotateCcw, Filter, Warehouse as WarehouseIcon } from 'lucide-react';
import type { Warehouse } from '../../shared/types/admin';

interface InventoryFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  category: string;
  onCategoryChange: (val: string) => void;
  categories: string[];
  warehouseId: string;
  onWarehouseChange: (val: string) => void;
  warehouses: Warehouse[];
  status: string;
  onStatusChange: (val: string) => void;
  onReset: () => void;
  totalFilteredCount: number;
  totalProductsCount: number;
}

export const InventoryFilterBar: React.FC<InventoryFilterBarProps> = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories,
  warehouseId,
  onWarehouseChange,
  warehouses,
  status,
  onStatusChange,
  onReset,
  totalFilteredCount,
  totalProductsCount,
}) => {
  const isFiltered =
    search.trim() !== '' ||
    category !== 'ALL' ||
    warehouseId !== 'ALL' ||
    status !== 'ALL';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 mb-6 transition-all">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-semibold">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Bộ lọc tồn kho</h3>
            <p className="text-xs text-slate-500">
              Tìm kiếm và phân loại sản phẩm theo kho hàng và trạng thái cảnh báo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-purple-50 text-purple-700 border border-purple-200">
            Hiển thị <strong>{totalFilteredCount}</strong> / {totalProductsCount} sản phẩm
          </span>

          {isFiltered && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors border border-rose-200"
              title="Đặt lại bộ lọc"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Đặt lại
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
        {/* Tìm kiếm */}
        <div className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Tìm kiếm theo SKU hoặc Tên
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Gõ mã SKU hoặc tên SP..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Danh mục */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Danh mục sản phẩm
          </label>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-slate-800"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat === 'Tất cả danh mục' ? 'ALL' : cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Kho hàng */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5 flex items-center gap-1">
            <WarehouseIcon className="w-3.5 h-3.5 text-purple-600" />
            Kho hàng
          </label>
          <select
            value={warehouseId}
            onChange={(e) => onWarehouseChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-slate-800"
          >
            <option value="ALL">Toàn bộ kho (Toàn quốc)</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.code} - {wh.name}
              </option>
            ))}
          </select>
        </div>

        {/* Trạng thái tồn kho */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Trạng thái tồn kho
          </label>
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all text-slate-800"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="IN_STOCK">Đủ hàng (An toàn)</option>
            <option value="LOW_STOCK">Sắp hết hàng (Dưới ngưỡng)</option>
            <option value="OUT_OF_STOCK">Hết hàng (Khả dụng = 0)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
