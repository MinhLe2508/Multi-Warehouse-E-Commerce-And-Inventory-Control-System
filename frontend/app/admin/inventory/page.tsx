'use client';

import React from 'react';
import { RefreshCw, Download, Layers } from 'lucide-react';
import { useAdminInventory } from '../../../hooks/useAdminInventory';
import { WarehouseStockChart } from '../../../components/admin/WarehouseStockChart';
import { InventoryFilterBar } from '../../../components/admin/InventoryFilterBar';
import { InventoryTable } from '../../../components/admin/InventoryTable';
import { StockAdjustModal } from '../../../components/admin/StockAdjustModal';

export default function AdminInventoryPage() {
  const {
    products,
    paginatedProducts,
    summary,
    loading,
    error,
    search,
    category,
    warehouseId,
    status,
    page,
    pageSize,
    totalPages,
    totalFilteredCount,
    warehouses,
    categories,
    editingTarget,
    setSearch,
    setCategory,
    setWarehouseId,
    setStatus,
    setPage,
    setPageSize,
    resetFilters,
    openAdjustModal,
    closeAdjustModal,
    submitStockAdjustment,
    refreshData,
  } = useAdminInventory();

  const handleExportCSV = () => {
    // Xuất CSV đơn giản cho quản trị viên
    const headers = ['Mã SKU', 'Tên sản phẩm', 'Danh mục', 'Tổng tồn', 'Tổng giữ chỗ', 'Tổng khả dụng', 'Trạng thái'];
    const rows = products.map((p) => [
      `"${p.sku}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category}"`,
      p.totalStock,
      p.totalReserved,
      p.totalAvailable,
      p.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bao_cao_ton_kho_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <Layers className="w-5 h-5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              Quản Trị Tồn Kho Đa Kho (FR-INV-01)
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Ma Trận Kiểm Soát Tồn Kho Toàn Quốc
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kiểm tra lượng tồn khả dụng, số lượng giữ chỗ và cảnh báo ngưỡng an toàn theo thời gian thực
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-all hover:scale-[1.02] active:scale-95"
            title="Làm mới dữ liệu tồn kho"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`} />
            Làm mới
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-200 transition-all hover:scale-[1.02] active:scale-95"
            title="Xuất báo cáo CSV"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất file CSV
          </button>
        </div>
      </div>

      {/* Thông báo lỗi nếu có */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Phân hệ Biểu đồ & 6 KPIs (FR-DASH-01) */}
      <WarehouseStockChart summary={summary} />

      {/* Bộ lọc tìm kiếm & Kho hàng (FR-INV-01, FR-DASH-01) */}
      <InventoryFilterBar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        categories={categories}
        warehouseId={warehouseId}
        onWarehouseChange={setWarehouseId}
        warehouses={warehouses}
        status={status}
        onStatusChange={setStatus}
        onReset={resetFilters}
        totalFilteredCount={totalFilteredCount}
        totalProductsCount={products.length}
      />

      {/* Bảng Ma trận Tồn kho Sản phẩm x Kho hàng */}
      <InventoryTable
        products={paginatedProducts}
        warehouses={warehouses}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        totalFilteredCount={totalFilteredCount}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onOpenAdjust={openAdjustModal}
      />

      {/* Modal Điều chỉnh Tồn kho (Optimistic Lock & Audit) */}
      <StockAdjustModal
        target={editingTarget}
        onClose={closeAdjustModal}
        onSubmit={submitStockAdjustment}
      />
    </div>
  );
}
