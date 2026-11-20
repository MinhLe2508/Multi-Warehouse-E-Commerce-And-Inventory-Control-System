'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdminInventorySummaryApi,
  InventorySummaryResponse,
  ProductInventoryItem,
  StockAdjustPayload,
  WarehouseStockDetail,
} from '../shared/types/admin';
import { determineProductStatus, filterInventoryProducts } from '../shared/lib/inventoryStatus';
import { apiGet, apiPost, apiPut, AuthError, extractErrorMessage } from '../shared/lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import {
  useInventoryRealtime,
  type LowStockRealtimeEvent,
  type RealtimeStatus,
} from './useInventoryRealtime';

interface ApiInventoryRow {
  id: string;
  productId: string;
  stock: number;
  reservedStock: number;
  availableStock: number;
  threshold: number | null;
  effectiveThreshold: number;
  isLowStock: boolean;
  version: number;
  updatedAt: string;
  product: {
    sku: string;
    name: string;
    category: { id: string; name: string } | null;
  };
  warehouse: WarehouseOption;
}

interface ApiInventoryPage {
  items: ApiInventoryRow[];
  total: number;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface InventoryCatalog {
  products: ProductInventoryItem[];
  warehouses: WarehouseOption[];
  categories: string[];
}

interface InventorySnapshot {
  scope: string;
  filters: string;
  catalog: InventoryCatalog;
  summary: AdminInventorySummaryApi;
}

interface CatalogRequest {
  scope: string;
  revision: number;
  promise: Promise<InventoryCatalog>;
  pending: boolean;
  refreshAfter: boolean;
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
  submitStockAdjustment: (
    payload: StockAdjustPayload
  ) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => void;
}

const API_PAGE_SIZE = 100;
const ALL_CATEGORIES = 'Tất cả danh mục';
const EMPTY_CATALOG: InventoryCatalog = {
  products: [],
  warehouses: [],
  categories: [ALL_CATEGORIES],
};

function accountScope(state: ReturnType<typeof useAuthStore.getState>): string {
  const user = state.session?.user;
  return user ? `${user.id}:${user.role}` : '';
}

async function loadCatalog(scope: string): Promise<InventoryCatalog> {
  const fetchPage = (offset: number) => {
    if (accountScope(useAuthStore.getState()) !== scope) {
      throw new AuthError(401, 'Phiên đăng nhập đã thay đổi.');
    }
    return apiGet<ApiInventoryPage>(
      `/admin/inventory?includeCategory=true&limit=${API_PAGE_SIZE}&offset=${offset}`
    );
  };
  const firstPage = await fetchPage(0);
  const rows = new Map(firstPage.items.map((row) => [row.id, row]));

  // The matrix and the CSV operate on complete product groups, across API pages.
  for (let offset = API_PAGE_SIZE; offset < firstPage.total; offset += API_PAGE_SIZE) {
    const nextPage = await fetchPage(offset);
    for (const row of nextPage.items) rows.set(row.id, row);
  }

  const products = new Map<string, ProductInventoryItem>();
  const warehouses = new Map<string, WarehouseOption>();
  const categories = new Set<string>();
  for (const row of rows.values()) {
    const warehouse = row.warehouse;
    warehouses.set(warehouse.id, { id: warehouse.id, code: warehouse.code, name: warehouse.name });
    const category = row.product.category?.name ?? 'Chưa phân loại';
    categories.add(category);
    const product: ProductInventoryItem = products.get(row.productId) ?? {
      id: row.productId,
      sku: row.product.sku,
      name: row.product.name,
      category,
      totalStock: 0,
      totalReserved: 0,
      totalAvailable: 0,
      effectiveThreshold: row.effectiveThreshold,
      status: 'IN_STOCK',
      warehouses: {},
    };

    product.totalStock += row.stock;
    product.totalReserved += row.reservedStock;
    product.totalAvailable += row.availableStock;
    product.warehouses[warehouse.id] = {
      inventoryId: row.id,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      stock: row.stock,
      reservedStock: row.reservedStock,
      availableStock: row.availableStock,
      threshold: row.threshold ?? row.effectiveThreshold,
      effectiveThreshold: row.effectiveThreshold,
      isLowStock: row.isLowStock,
      version: row.version,
      updatedAt: row.updatedAt,
    };
    products.set(product.id, product);
  }

  return {
    products: Array.from(products.values(), (product) => ({
      ...product,
      status: determineProductStatus(
        product.totalAvailable,
        Object.values(product.warehouses).some((warehouse) => warehouse.isLowStock)
      ),
    })),
    warehouses: [...warehouses.values()].sort((a, b) => a.code.localeCompare(b.code)),
    categories: [
      ALL_CATEGORIES,
      ...[...categories]
        .filter((name) => name !== ALL_CATEGORIES)
        .sort((a, b) => a.localeCompare(b, 'vi')),
    ],
  };
}

function toInventorySummary(
  data: AdminInventorySummaryApi,
  products: ProductInventoryItem[]
): InventorySummaryResponse {
  return {
    kpis: {
      totalProducts: data.totalProducts,
      totalStock: data.totalStock,
      totalReserved: data.totalReserved,
      totalAvailable: data.totalAvailable,
      lowStockCount: data.productsByStatus.LOW_STOCK,
      outOfStockCount: data.productsByStatus.OUT_OF_STOCK,
    },
    warehouseDistribution: data.byWarehouse.map((warehouse) => ({
      warehouseId: warehouse.warehouseId,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      totalStock: warehouse.totalStock,
      totalReserved: warehouse.totalReserved,
      totalAvailable: warehouse.totalAvailable,
      capacity: warehouse.capacity,
      occupiedStock: warehouse.occupiedStock,
      capacityRate: warehouse.capacityRate,
    })),
    topLowStockProducts: products
      .filter((product) => product.status !== 'IN_STOCK')
      .sort((a, b) => a.totalAvailable - b.totalAvailable || a.sku.localeCompare(b.sku))
      .slice(0, 5)
      .map(({ id, sku, name, totalAvailable, status }) => ({
        id,
        sku,
        name,
        totalAvailable,
        status,
      })),
  };
}

interface InventoryOptions {
  initialSearch?: string;
  warehouseScope?: {
    warehouseId: string;
    setWarehouseId: (id: string) => void;
  };
}

export function useAdminInventory({
  initialSearch = '',
  warehouseScope,
}: InventoryOptions = {}): UseAdminInventoryReturn {
  const scope = useAuthStore(accountScope);
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const catalogRequest = useRef<CatalogRequest | null>(null);
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedInventoryIds, setHighlightedInventoryIds] = useState<string[]>([]);
  const [search, setSearchState] = useState(initialSearch);
  const [category, setCategoryState] = useState('ALL');
  const [localWarehouseId, setWarehouseIdState] = useState('ALL');
  const warehouseId = warehouseScope?.warehouseId ?? localWarehouseId;
  const [status, setStatusState] = useState('ALL');
  const [paging, setPaging] = useState({ warehouseId, page: 1 });
  if (paging.warehouseId !== warehouseId) {
    setPaging({ warehouseId, page: 1 });
  }
  const [pageSize, setPageSizeState] = useState(10);
  const [editingTarget, setEditingTarget] =
    useState<UseAdminInventoryReturn['editingTarget']>(null);

  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (category !== 'ALL') params.set('category', category);
  if (warehouseId !== 'ALL') params.set('warehouseId', warehouseId);
  if (status !== 'ALL') params.set('status', status);
  const filters = params.toString();

  useEffect(() => {
    if (!scope) return;
    let active = true;
    const timer = setTimeout(
      async () => {
        if (accountScope(useAuthStore.getState()) !== scope) return;
        setLoading(true);
        let request = catalogRequest.current;
        if (request?.scope !== scope || request.revision !== revision) {
          const next: CatalogRequest = {
            scope,
            revision,
            promise: loadCatalog(scope),
            pending: true,
            refreshAfter: false,
          };
          const settled = () => {
            next.pending = false;
            if (next.refreshAfter && catalogRequest.current === next) {
              setRevision((value) => value + 1);
            }
          };
          void next.promise.then(settled, settled);
          catalogRequest.current = next;
          request = next;
        }
        try {
          const path = filters ? `/admin/inventory/summary?${filters}` : '/admin/inventory/summary';
          const [catalog, summary] = await Promise.all([
            request.promise,
            apiGet<AdminInventorySummaryApi>(path),
          ]);
          if (active) {
            setSnapshot({ scope, filters, catalog, summary });
            setError(null);
          }
        } catch (err) {
          if (active && catalogRequest.current === request) catalogRequest.current = null;
          if (active) {
            if (err instanceof AuthError && (err.status === 401 || err.status === 403)) {
              setSnapshot(null);
            }
            setError(extractErrorMessage(err, 'Không thể tải dữ liệu tồn kho từ máy chủ.'));
          }
        } finally {
          if (active) setLoading(false);
        }
      },
      filters.startsWith('search=') ? 180 : 0
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [scope, filters, revision]);

  const refreshData = useCallback(() => {
    if (realtimeTimer.current !== null) {
      clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
    }
    const request = catalogRequest.current;
    if (request?.pending && request.scope === accountScope(useAuthStore.getState())) {
      request.refreshAfter = true;
      return;
    }
    setRevision((value) => value + 1);
  }, [setRevision]);

  const refreshFromEvent = useCallback(() => {
    if (realtimeTimer.current !== null) return;
    realtimeTimer.current = setTimeout(refreshData, 250);
  }, [refreshData]);

  useEffect(
    () => () => {
      if (realtimeTimer.current !== null) {
        clearTimeout(realtimeTimer.current);
        realtimeTimer.current = null;
      }
      if (catalogRequest.current?.scope === scope) catalogRequest.current = null;
    },
    [scope]
  );

  const handleLowStockAlert = useCallback(
    (event: LowStockRealtimeEvent) => {
      setHighlightedInventoryIds((ids) =>
        ids.includes(event.inventoryId) ? ids : [...ids, event.inventoryId]
      );
      refreshFromEvent();
    },
    [refreshFromEvent, setHighlightedInventoryIds]
  );

  const { status: realtimeStatus } = useInventoryRealtime({
    onLowStockAlert: handleLowStockAlert,
    onInventoryChanged: refreshFromEvent,
    onReconnectSync: refreshData,
  });

  const current = snapshot?.scope === scope ? snapshot : null;
  const { products, warehouses, categories } = current?.catalog ?? EMPTY_CATALOG;
  const filteredProducts = useMemo(() => {
    const matches = filterInventoryProducts(products, { search, category, warehouseId, status });
    if (warehouseId === 'ALL') return matches;

    return matches.map((product) => {
      const stock = product.warehouses[warehouseId];
      return {
        ...product,
        totalStock: stock.stock,
        totalReserved: stock.reservedStock,
        totalAvailable: stock.availableStock,
        effectiveThreshold: stock.effectiveThreshold,
        status: determineProductStatus(stock.availableStock, stock.isLowStock),
        warehouses: { [warehouseId]: stock },
      };
    });
  }, [products, search, category, warehouseId, status]);

  const summary = useMemo(
    () =>
      current?.filters === filters ? toInventorySummary(current.summary, filteredProducts) : null,
    [current, filters, filteredProducts]
  );
  const totalFilteredCount = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const currentPage = Math.min(paging.page, totalPages);
  const start = (currentPage - 1) * pageSize;

  const setPageState = (page: number) => setPaging({ warehouseId, page });
  const setSearch = (value: string) => {
    setSearchState(value);
    setPageState(1);
  };
  const setCategory = (value: string) => {
    setCategoryState(value);
    setPageState(1);
  };
  const setWarehouseId = (value: string) => {
    const selectWarehouse = warehouseScope?.setWarehouseId ?? setWarehouseIdState;
    selectWarehouse(value);
    setPageState(1);
  };
  const setStatus = (value: string) => {
    setStatusState(value);
    setPageState(1);
  };
  const setPageSize = (value: number) => {
    setPageSizeState(value);
    setPageState(1);
  };
  const resetFilters = () => {
    setSearchState('');
    setCategoryState('ALL');
    if (!warehouseScope) setWarehouseIdState('ALL');
    setStatusState('ALL');
    setPageState(1);
  };

  const submitStockAdjustment = async (payload: StockAdjustPayload) => {
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
      refreshData();
      setEditingTarget(null);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: extractErrorMessage(err, 'Lỗi cập nhật tồn kho từ máy chủ.'),
      };
    }
  };

  return {
    products,
    filteredProducts,
    paginatedProducts: filteredProducts.slice(start, start + pageSize),
    summary,
    loading,
    error,
    realtimeStatus,
    highlightedInventoryIds,
    search,
    category,
    warehouseId,
    status,
    page: currentPage,
    pageSize,
    totalPages,
    totalFilteredCount,
    warehouses,
    categories,
    editingTarget: current ? editingTarget : null,
    setSearch,
    setCategory,
    setWarehouseId,
    setStatus,
    setPage: setPageState,
    setPageSize,
    resetFilters,
    openAdjustModal: (product, detail) => setEditingTarget({ product, detail }),
    closeAdjustModal: () => setEditingTarget(null),
    submitStockAdjustment,
    refreshData,
  };
}
