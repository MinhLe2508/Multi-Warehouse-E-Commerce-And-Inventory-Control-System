'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  ProductInventoryItem,
  WarehouseStockDetail,
  InventorySummaryResponse,
  StockAdjustPayload,
} from '../shared/types/admin';
import { filterInventoryProducts, determineProductStatus } from '../shared/lib/inventoryStatus';
import { apiGet, apiPost, apiPut, extractErrorMessage } from '../shared/lib/apiClient';
import {
  useInventoryRealtime,
  type InventoryChangedEvent,
  type LowStockRealtimeEvent,
  type RealtimeStatus,
} from './useInventoryRealtime';

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
    basePrice: string | number;
    costPrice?: string | number;
    isActive: boolean;
    category?: { id: string; name: string } | null;
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

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

export interface UseAdminInventoryReturn {
  products: ProductInventoryItem[];
  filteredProducts: ProductInventoryItem[];
  paginatedProducts: ProductInventoryItem[];
  summary: InventorySummaryResponse | null;
  loading: boolean;
  error: string | null;
  realtimeStatus: RealtimeStatus;
  highlightedInventoryIds: string[];
  search: string;
  category: string;
  warehouseId: string;
  status: string;
  page: number;
  pageSize: number;
  totalPages: number;
  totalFilteredCount: number;
  warehouses: WarehouseOption[];
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

function computeSummary(
  groupedList: ProductInventoryItem[],
  warehousesList: WarehouseOption[],
): InventorySummaryResponse {
  const totalStock = groupedList.reduce((acc, p) => acc + p.totalStock, 0);
  const totalReserved = groupedList.reduce((acc, p) => acc + p.totalReserved, 0);
  const totalAvailable = groupedList.reduce((acc, p) => acc + p.totalAvailable, 0);
  const lowStockCount = groupedList.filter((p) => p.status === 'LOW_STOCK').length;
  const outOfStockCount = groupedList.filter((p) => p.status === 'OUT_OF_STOCK').length;

  const whMap: Record<
    string,
    { totalStock: number; totalReserved: number; totalAvailable: number; code: string; name: string }
  > = {};

  for (const wh of warehousesList) {
    whMap[wh.id] = {
      totalStock: 0,
      totalReserved: 0,
      totalAvailable: 0,
      code: wh.code,
      name: wh.name,
    };
  }

  for (const p of groupedList) {
    for (const detail of Object.values(p.warehouses)) {
      if (!whMap[detail.warehouseId]) {
        whMap[detail.warehouseId] = {
          totalStock: 0,
          totalReserved: 0,
          totalAvailable: 0,
          code: detail.warehouseCode,
          name: detail.warehouseName,
        };
      }
      whMap[detail.warehouseId].totalStock += detail.stock;
      whMap[detail.warehouseId].totalReserved += detail.reservedStock;
      whMap[detail.warehouseId].totalAvailable += detail.availableStock;
    }
  }

  const warehouseDistribution = Object.entries(whMap).map(([id, stat]) => ({
    warehouseId: id,
    warehouseCode: stat.code,
    warehouseName: stat.name,
    totalStock: stat.totalStock,
    totalReserved: stat.totalReserved,
    totalAvailable: stat.totalAvailable,
    capacityRate: Math.min(100, Math.round((stat.totalStock / 5000) * 100)),
  }));

  return {
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
      .filter((p) => p.status !== 'IN_STOCK')
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        totalAvailable: p.totalAvailable,
        status: p.status,
      })),
  };
}

export function useAdminInventory(): UseAdminInventoryReturn {
  const [products, setProducts] = useState<ProductInventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<InventorySummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedInventoryIds, setHighlightedInventoryIds] = useState<string[]>([]);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const firstPage = await apiGet<ApiInventoryResponse>('/inventory?limit=100&offset=0');

      let allRows: ApiInventoryRow[] = firstPage.items || [];
      const total = firstPage.total || allRows.length;

      if (total > 100) {
        const remainingOffsets: number[] = [];
        for (let offset = 100; offset < total && offset < 1000; offset += 100) {
          remainingOffsets.push(offset);
        }

        const remainingPages = await Promise.all(
          remainingOffsets.map((offset) =>
            apiGet<ApiInventoryResponse>(`/inventory?limit=100&offset=${offset}`)
          )
        );

        for (const p of remainingPages) {
          if (p.items) allRows = allRows.concat(p.items);
        }
      }

      const productMap = new Map<string, ProductInventoryItem>();
      const whMap = new Map<string, WarehouseOption>();
      const catSet = new Set<string>();

      for (const row of allRows) {
        if (!whMap.has(row.warehouse.id)) {
          whMap.set(row.warehouse.id, {
            id: row.warehouse.id,
            code: row.warehouse.code,
            name: row.warehouse.name,
          });
        }

        const catName = row.product.category?.name || 'Chưa phân loại';
        catSet.add(catName);

        let prod = productMap.get(row.productId);
        if (!prod) {
          prod = {
            id: row.productId,
            sku: row.product.sku,
            name: row.product.name,
            category: catName,
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
      }

      const groupedList = Array.from(productMap.values()).map((p) => {
        const hasLow = Object.values(p.warehouses).some((w) => w.isLowStock);
        p.status = determineProductStatus(p.totalAvailable, hasLow);
        return p;
      });

      const whList = Array.from(whMap.values()).sort((a, b) => a.code.localeCompare(b.code));
      const catList = Array.from(catSet).sort((a, b) => a.localeCompare(b, 'vi'));

      setWarehouses(whList);
      setCategories(catList);
      setProducts(groupedList);
      setSummary(computeSummary(groupedList, whList));
      setError(null);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Không thể tải dữ liệu tồn kho từ máy chủ.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Cập nhật trực tiếp dòng tồn kho khi nhận sự kiện realtime (FR-INV-02, FR-NOT-01)
  const handleLowStockAlert = useCallback(
    (event: LowStockRealtimeEvent) => {
      setHighlightedInventoryIds((prev) =>
        prev.includes(event.inventoryId) ? prev : [...prev, event.inventoryId]
      );

      setProducts((prev) => {
        const next = prev.map((prod) => {
          const wh = prod.warehouses[event.warehouseId];
          if (!wh || wh.inventoryId !== event.inventoryId) return prod;

          const updatedWh: WarehouseStockDetail = {
            ...wh,
            availableStock: event.availableStock,
            effectiveThreshold: event.threshold,
            isLowStock: event.availableStock <= event.threshold,
            updatedAt: event.triggeredAt ?? new Date().toISOString(),
          };
          const nextWarehouses = {
            ...prod.warehouses,
            [event.warehouseId]: updatedWh,
          };
          const totalAvailable = Object.values(nextWarehouses).reduce(
            (s, d) => s + d.availableStock,
            0
          );
          const hasLow = Object.values(nextWarehouses).some((d) => d.isLowStock);

          return {
            ...prod,
            warehouses: nextWarehouses,
            totalAvailable,
            status: determineProductStatus(totalAvailable, hasLow),
          };
        });
        setSummary(computeSummary(next, warehouses));
        return next;
      });
    },
    [warehouses]
  );

  const handleInventoryChanged = useCallback(
    (event: InventoryChangedEvent) => {
      setProducts((prev) => {
        const next = prev.map((prod) => {
          const entry = Object.entries(prod.warehouses).find(
            ([, detail]) => detail.inventoryId === event.inventoryId
          );
          if (!entry) return prod;
          const [whId, detail] = entry;
          const effectiveThreshold = event.effectiveThreshold ?? detail.effectiveThreshold;
          const updatedWh: WarehouseStockDetail = {
            ...detail,
            stock: event.stock,
            reservedStock: event.reservedStock,
            availableStock: event.availableStock,
            effectiveThreshold,
            isLowStock: event.isLowStock ?? event.availableStock <= effectiveThreshold,
            updatedAt: new Date().toISOString(),
          };
          const nextWarehouses = { ...prod.warehouses, [whId]: updatedWh };
          const totalStock = Object.values(nextWarehouses).reduce((s, d) => s + d.stock, 0);
          const totalReserved = Object.values(nextWarehouses).reduce(
            (s, d) => s + d.reservedStock,
            0
          );
          const totalAvailable = Object.values(nextWarehouses).reduce(
            (s, d) => s + d.availableStock,
            0
          );
          const hasLow = Object.values(nextWarehouses).some((d) => d.isLowStock);
          return {
            ...prod,
            warehouses: nextWarehouses,
            totalStock,
            totalReserved,
            totalAvailable,
            status: determineProductStatus(totalAvailable, hasLow),
          };
        });
        setSummary(computeSummary(next, warehouses));
        return next;
      });
    },
    [warehouses]
  );

  const { status: realtimeStatus } = useInventoryRealtime({
    onLowStockAlert: handleLowStockAlert,
    onInventoryChanged: handleInventoryChanged,
    onReconnectSync: loadData,
  });

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
          await apiPost(`/inventory/${payload.inventoryId}/restock`, {
            quantity: payload.quantity,
            note: payload.note,
          });
        } else {
          await apiPut(`/inventory/${payload.inventoryId}`, {
            stock: payload.newStock,
            threshold: payload.threshold,
            note: payload.note,
          });
        }

        await loadData();
        setEditingTarget(null);
        return { success: true };
      } catch (err: unknown) {
        return {
          success: false,
          error: extractErrorMessage(err, 'Lỗi cập nhật tồn kho từ máy chủ.'),
        };
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
    realtimeStatus,
    highlightedInventoryIds,
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
    refreshData: loadData,
  };
}
