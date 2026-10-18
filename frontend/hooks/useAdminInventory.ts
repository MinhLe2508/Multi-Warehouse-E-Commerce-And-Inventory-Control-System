'use client';

import { useState, useMemo, useCallback } from 'react';
import type {
  ProductInventoryItem,
  WarehouseStockDetail,
  InventorySummaryResponse,
  StockAdjustPayload,
} from '../shared/types/admin';
import { filterInventoryProducts } from '../shared/lib/inventoryStatus';
import {
  adminInventoryData,
  adjustMockStock,
  getMockInventorySummary,
  MOCK_WAREHOUSES,
  MOCK_CATEGORIES,
} from '../shared/mock/adminInventoryMock';

export interface UseAdminInventoryReturn {
  products: ProductInventoryItem[];
  filteredProducts: ProductInventoryItem[];
  paginatedProducts: ProductInventoryItem[];
  summary: InventorySummaryResponse | null;
  loading: boolean;
  error: string | null;
  search: string;
  category: string;
  warehouseId: string;
  status: string;
  page: number;
  pageSize: number;
  totalPages: number;
  totalFilteredCount: number;
  warehouses: typeof MOCK_WAREHOUSES;
  categories: string[];
  editingTarget: {
    product: ProductInventoryItem;
    detail: WarehouseStockDetail;
  } | null;
  setSearch: (search: string) => void;
  setCategory: (category: string) => void;
  setWarehouseId: (warehouseId: string) => void;
  setStatus: (status: string) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  resetFilters: () => void;
  openAdjustModal: (product: ProductInventoryItem, detail: WarehouseStockDetail) => void;
  closeAdjustModal: () => void;
  submitStockAdjustment: (payload: StockAdjustPayload) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => void;
}

export function useAdminInventory(): UseAdminInventoryReturn {
  const [products, setProducts] = useState<ProductInventoryItem[]>(() =>
    JSON.parse(JSON.stringify(adminInventoryData))
  );
  const [summary, setSummary] = useState<InventorySummaryResponse | null>(() =>
    getMockInventorySummary()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearchState] = useState<string>('');
  const [category, setCategoryState] = useState<string>('ALL');
  const [warehouseId, setWarehouseIdState] = useState<string>('ALL');
  const [status, setStatusState] = useState<string>('ALL');

  // Pagination state
  const [page, setPageState] = useState<number>(1);
  const [pageSize, setPageSizeState] = useState<number>(10);

  // Modal target state
  const [editingTarget, setEditingTarget] = useState<{
    product: ProductInventoryItem;
    detail: WarehouseStockDetail;
  } | null>(null);

  // Load / Refresh data
  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const dataCopy = JSON.parse(JSON.stringify(adminInventoryData));
      setProducts(dataCopy);
      setSummary(getMockInventorySummary());
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      setError(`Không thể tải dữ liệu tồn kho: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handler reset page when filter changes
  const setSearch = useCallback((val: string) => {
    setSearchState(val);
    setPageState(1);
  }, []);

  const setCategory = useCallback((val: string) => {
    setCategoryState(val);
    setPageState(1);
  }, []);

  const setWarehouseId = useCallback((val: string) => {
    setWarehouseIdState(val);
    setPageState(1);
  }, []);

  const setStatus = useCallback((val: string) => {
    setStatusState(val);
    setPageState(1);
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPageState(1);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchState('');
    setCategoryState('ALL');
    setWarehouseIdState('ALL');
    setStatusState('ALL');
    setPageState(1);
  }, []);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return filterInventoryProducts(products, {
      search,
      category,
      warehouseId,
      status,
    });
  }, [products, search, category, warehouseId, status]);

  const totalFilteredCount = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));

  // Paginated slice
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  // Adjust modal triggers
  const openAdjustModal = useCallback(
    (product: ProductInventoryItem, detail: WarehouseStockDetail) => {
      setEditingTarget({ product, detail });
    },
    []
  );

  const closeAdjustModal = useCallback(() => {
    setEditingTarget(null);
  }, []);

  // Submit stock adjustment
  const submitStockAdjustment = useCallback(
    async (payload: StockAdjustPayload): Promise<{ success: boolean; error?: string }> => {
      try {
        // Thực hiện điều chỉnh qua mock service
        adjustMockStock(payload);

        // Cập nhật lại state in-memory để UI phản ánh lập tức
        const refreshed = JSON.parse(JSON.stringify(adminInventoryData));
        setProducts(refreshed);
        setSummary(getMockInventorySummary());

        // Đóng modal
        setEditingTarget(null);
        return { success: true };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Lỗi điều chỉnh tồn kho';
        return { success: false, error: errorMsg };
      }
    },
    []
  );

  return {
    products,
    filteredProducts,
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
    warehouses: MOCK_WAREHOUSES,
    categories: MOCK_CATEGORIES,
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
    refreshData: loadData,
  };
}
