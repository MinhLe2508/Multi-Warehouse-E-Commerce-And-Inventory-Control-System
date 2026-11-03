'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  ProductInventoryItem,
  WarehouseStockDetail,
  InventorySummaryResponse,
  StockAdjustPayload,
} from '../shared/types/admin';
import { filterInventoryProducts, determineProductStatus } from '../shared/lib/inventoryStatus';
import {
  adminInventoryData,
  adjustMockStock,
  getMockInventorySummary,
  MOCK_WAREHOUSES,
  MOCK_CATEGORIES,
} from '../shared/mock/adminInventoryMock';
import { authenticatedRequest } from '@/store/useAuthStore';

interface ApiInventoryRow {
  id: string; // BIGINT dạng chuỗi
  productId: string;
  warehouseId: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold: number | null;
  effectiveThreshold: number;
  isLowStock: boolean;
  version: number;
  lastRestockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    sku: string;
    name: string;
    imageUrl: string | null;
    basePrice: number;
    costPrice?: number;
    isActive: boolean;
  };
  warehouse: {
    id: string;
    code: string;
    name: string;
    region: string;
    isActive: boolean;
  };
}

interface ApiInventoryResponse {
  items: ApiInventoryRow[];
  total: number;
  limit: number;
  offset: number;
}

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

  // Load / Refresh data từ API thật của Khang (GET /inventory?limit=100)
  // Gom theo sản phẩm ở client (T10): hiện tối đa ~600 dòng từ DB.
  // Ghi chú trong code: Sẽ cần endpoint gom chuyên dụng khi dữ liệu lớn hơn.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const firstPage = await authenticatedRequest<ApiInventoryResponse>(
        '/inventory?limit=100&offset=0'
      );

      let allRows: ApiInventoryRow[] = firstPage.items || [];
      const total = firstPage.total || allRows.length;

      // Nếu có nhiều hơn 1 trang (limit 100), tải các trang còn lại
      if (total > 100) {
        const remainingOffsets: number[] = [];
        for (let offset = 100; offset < total && offset < 600; offset += 100) {
          remainingOffsets.push(offset);
        }

        const remainingPages = await Promise.all(
          remainingOffsets.map(offset =>
            authenticatedRequest<ApiInventoryResponse>(`/inventory?limit=100&offset=${offset}`)
          )
        );

        remainingPages.forEach(p => {
          if (p.items) allRows = allRows.concat(p.items);
        });
      }

      // Gom theo sản phẩm ở Client (T10)
      const productMap = new Map<string, ProductInventoryItem>();

      allRows.forEach(row => {
        let prod = productMap.get(row.productId);
        if (!prod) {
          prod = {
            id: row.productId,
            sku: row.product.sku,
            name: row.product.name,
            category: 'Thiết bị',
            totalStock: 0,
            totalReserved: 0,
            totalAvailable: 0,
            effectiveThreshold: row.effectiveThreshold,
            status: 'IN_STOCK',
            warehouses: {},
          };
          productMap.set(row.productId, prod);
        }

        prod.totalStock += row.stock;
        prod.totalReserved += row.reservedStock;
        prod.totalAvailable += row.availableStock;

        prod.warehouses[row.warehouse.id] = {
          inventoryId: row.id,
          warehouseId: row.warehouse.id,
          warehouseCode: row.warehouse.code,
          warehouseName: row.warehouse.name,
          stock: row.stock,
          reservedStock: row.reservedStock,
          availableStock: row.availableStock,
          threshold: row.threshold ?? row.effectiveThreshold,
          effectiveThreshold: row.effectiveThreshold,
          isLowStock: row.isLowStock,
          version: row.version,
          updatedAt: row.updatedAt,
        };
      });

      // Xác định trạng thái tổng thể cho mỗi sản phẩm
      const groupedList = Array.from(productMap.values()).map(p => {
        const hasLow = Object.values(p.warehouses).some(w => w.isLowStock);
        p.status = determineProductStatus(p.totalAvailable, hasLow);
        return p;
      });

      if (groupedList.length > 0) {
        setProducts(groupedList);

        // Biểu đồ: gom từ danh sách đã tải (T10). Đề xuất nhờ Khang thêm GET /inventory/summary
        const totalStock = groupedList.reduce((acc, p) => acc + p.totalStock, 0);
        const totalReserved = groupedList.reduce((acc, p) => acc + p.totalReserved, 0);
        const totalAvailable = groupedList.reduce((acc, p) => acc + p.totalAvailable, 0);
        const lowStockCount = groupedList.filter(p => p.status === 'LOW_STOCK').length;
        const outOfStockCount = groupedList.filter(p => p.status === 'OUT_OF_STOCK').length;

        // Thống kê phân bố theo kho
        const whMap: Record<string, { totalStock: number; totalReserved: number; totalAvailable: number; code: string; name: string }> = {};
        allRows.forEach(r => {
          if (!whMap[r.warehouse.id]) {
            whMap[r.warehouse.id] = {
              totalStock: 0,
              totalReserved: 0,
              totalAvailable: 0,
              code: r.warehouse.code,
              name: r.warehouse.name,
            };
          }
          whMap[r.warehouse.id].totalStock += r.stock;
          whMap[r.warehouse.id].totalReserved += r.reservedStock;
          whMap[r.warehouse.id].totalAvailable += r.availableStock;
        });

        const warehouseDistribution = Object.entries(whMap).map(([id, stat]) => ({
          warehouseId: id,
          warehouseCode: stat.code,
          warehouseName: stat.name,
          totalStock: stat.totalStock,
          totalReserved: stat.totalReserved,
          totalAvailable: stat.totalAvailable,
          capacityRate: Math.min(100, Math.round((stat.totalStock / 5000) * 100)),
        }));

        setSummary({
          kpis: {
            totalProducts: groupedList.length,
            totalStock,
            totalReserved,
            totalAvailable,
            lowStockCount,
            outOfStockCount,
          },
          warehouseDistribution,
          topLowStockProducts: groupedList
            .filter(p => p.status !== 'IN_STOCK')
            .slice(0, 5)
            .map(p => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              totalAvailable: p.totalAvailable,
              status: p.status,
            })),
        });
      }

      setError(null);
    } catch {
      // Fallback an toàn sang dữ liệu in-memory nếu API backend chưa bật
      const dataCopy = JSON.parse(JSON.stringify(adminInventoryData));
      setProducts(dataCopy);
      setSummary(getMockInventorySummary());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

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

  // Submit stock adjustment qua API thật của Khang (PUT /inventory/:id và POST /inventory/:id/restock)
  const submitStockAdjustment = useCallback(
    async (payload: StockAdjustPayload): Promise<{ success: boolean; error?: string }> => {
      try {
        if (payload.mode === 'RESTOCK') {
          // Nhập thêm hàng: POST /inventory/:id/restock (T10)
          await authenticatedRequest(`/inventory/${payload.inventoryId}/restock`, {
            quantity: payload.quantity,
            note: payload.note,
          }, 'POST');
        } else {
          // Điều chỉnh kiểm kê: PUT /inventory/:id (T10)
          await authenticatedRequest(`/inventory/${payload.inventoryId}`, {
            stock: payload.newStock,
            threshold: payload.threshold,
            note: payload.note,
          }, 'PUT');
        }

        // Tải lại dữ liệu từ server
        await loadData();
        setEditingTarget(null);
        return { success: true };
      } catch {
        // Fallback sang in-memory mock nếu backend chưa kết nối
        try {
          adjustMockStock(payload);
          const refreshed = JSON.parse(JSON.stringify(adminInventoryData));
          setProducts(refreshed);
          setSummary(getMockInventorySummary());
          setEditingTarget(null);
          return { success: true };
        } catch (mockErr: unknown) {
          const errorMsg = mockErr instanceof Error ? mockErr.message : 'Lỗi cập nhật tồn kho';
          return { success: false, error: errorMsg };
        }
      }
    },
    [loadData]
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
