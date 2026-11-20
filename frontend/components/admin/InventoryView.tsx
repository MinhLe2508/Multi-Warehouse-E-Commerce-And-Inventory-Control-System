'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Download, Plus } from 'lucide-react';
import { useAdminInventory } from '../../hooks/useAdminInventory';
import { useCurrentAdminUser } from '../../hooks/useCurrentAdminUser';
import { useAdminCtx } from './AdminContext';
import { WarehouseStockChart } from './WarehouseStockChart';
import { InventoryFilterBar } from './InventoryFilterBar';
import { InventoryTable } from './InventoryTable';
import { StockAdjustModal } from './StockAdjustModal';
import { CreateInventoryForm } from './CreateInventoryForm';
import {
  AdminPageFrame,
  RefreshButton,
} from './operations/AdminUi';

interface InventoryViewProps {
  variant?: 'admin' | 'staff';
  initialSearch?: string;
  initialWarehouseId?: string;
}

export function InventoryView({
  variant = 'admin',
  initialSearch,
  initialWarehouseId,
}: InventoryViewProps) {
  const { isAdmin } = useCurrentAdminUser();
  const isStaffView = variant === 'staff';
  const canEdit = isAdmin && !isStaffView;
  const warehouseScope = useAdminCtx();
  const { warehouses: warehouseOptions, setWarehouseId: setScopedWarehouse } = warehouseScope;
  const linkedWarehouseId = warehouseOptions.find(
    ({ id }) => id === initialWarehouseId,
  )?.id;
  useEffect(() => {
    if (isStaffView && linkedWarehouseId) setScopedWarehouse(linkedWarehouseId);
  }, [isStaffView, linkedWarehouseId, setScopedWarehouse]);

  const [creatingInventory, setCreatingInventory] = useState(false);
  const [notice, setNotice] = useState('');
  const {
    products,
    filteredProducts,
    paginatedProducts,
    summary,
    loading,
    error,
    realtimeStatus,
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
  } = useAdminInventory({
    initialSearch,
    warehouseScope: isStaffView ? warehouseScope : undefined,
  });
  const exportProducts = isStaffView ? filteredProducts : products;

  const handleExportCSV = () => {
    const headers = [
      'Mã SKU',
      'Tên sản phẩm',
      'Danh mục',
      'Tổng tồn',
      'Tổng giữ chỗ',
      'Tổng khả dụng',
      'Trạng thái',
    ];
    const rows = exportProducts.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.totalStock,
      p.totalReserved,
      p.totalAvailable,
      p.status,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((value) =>
            typeof value === 'number'
              ? value
              : `"${value.replace(/"/g, '""')}"`,
          )
          .join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao_cao_ton_kho_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <AdminPageFrame
      title="Tồn kho"
      description="Xem tồn vật lý, hàng đang giữ chỗ và số lượng khả dụng tại từng kho."
      actions={
        <>
          <RefreshButton onClick={refreshData} disabled={loading} />
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={loading || exportProducts.length === 0}
            className="btn btn-outline-primary btn-sm admin-workspace-button"
          >
            <Download size={16} aria-hidden="true" /> Tải CSV
          </button>
          {canEdit && (
            <button
              type="button"
              className="btn btn-gradient-purple btn-sm admin-workspace-button"
              onClick={() => {
                setNotice('');
                setCreatingInventory(true);
              }}
            >
              <Plus size={16} aria-hidden="true" /> Thêm tồn kho
            </button>
          )}
        </>
      }
    >
      {notice && (
        <p className="alert alert-success py-2 mb-0" role="status">
          {notice}
        </p>
      )}
      {canEdit && creatingInventory && (
        <CreateInventoryForm
          onCancel={() => setCreatingInventory(false)}
          onCreated={() => {
            setCreatingInventory(false);
            setNotice('Đã tạo dòng tồn kho.');
            void refreshData();
          }}
        />
      )}

      {/* Trạng thái realtime & Thông báo lỗi nếu có */}
      {realtimeStatus === 'reconnecting' && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
          <span>Đang kết nối lại kênh đồng bộ tồn kho realtime...</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={refreshData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tải lại
          </button>
        </div>
      )}

      {loading && products.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-sm text-slate-500">
          Đang tải dữ liệu tồn kho từ máy chủ...
        </div>
      ) : (
        <>
          {/* Phân hệ Biểu đồ & 6 KPIs (FR-DASH-01) */}
          <WarehouseStockChart summary={summary} variant={variant} />

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
            showWarehouseFilter={!isStaffView}
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
            selectedWarehouseId={warehouseId}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            totalFilteredCount={totalFilteredCount}
            isAdmin={canEdit}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onOpenAdjust={openAdjustModal}
          />
        </>
      )}

      {/* Modal Điều chỉnh Tồn kho (Chỉ hiển thị cho ADMIN - T10) */}
      {canEdit && (
        <StockAdjustModal
          target={editingTarget}
          onClose={closeAdjustModal}
          onSubmit={submitStockAdjustment}
        />
      )}
    </AdminPageFrame>
  );
}
