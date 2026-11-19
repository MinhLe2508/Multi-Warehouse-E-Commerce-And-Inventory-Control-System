import { apiDelete, apiGet, apiPatch, apiPost } from './apiClient';

export interface ProductCategory {
  id: string;
  name: string;
}

export interface ManagedProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
  categoryId: string | null;
  category: ProductCategory | null;
  basePrice: string;
  costPrice?: string | null;
  discountPercent: string;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ManagedProductsPage {
  items: ManagedProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductFields {
  sku: string;
  name: string;
  basePrice: string;
  discountPercent: string;
  imageUrl: string | null;
  description: string | null;
}

interface ProductCreateInput extends ProductFields {
  slug: string;
  categoryId: string;
  costPrice: string;
}

type ProductUpdateInput = Partial<ProductCreateInput> & { isActive?: boolean };

const PRODUCTS = '/admin/products';

export async function listManagedProducts({
  search,
  categoryId,
  page,
  pageSize,
}: {
  search?: string;
  categoryId?: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search?.trim()) params.set('search', search.trim());
  if (categoryId) params.set('category', categoryId);
  const data = await apiGet<ManagedProductsPage>(`${PRODUCTS}?${params}`);
  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    data.page !== page ||
    data.pageSize !== pageSize ||
    data.totalPages !== Math.ceil(data.total / pageSize)
  ) {
    throw new Error('Máy chủ trả về danh sách sản phẩm không hợp lệ.');
  }
  return data;
}

export function listProductCategories() {
  return apiGet<ProductCategory[]>('/products/categories');
}

export function createManagedProduct(input: ProductCreateInput) {
  return apiPost<ManagedProduct>(PRODUCTS, input);
}

export function updateManagedProduct(id: string, input: ProductUpdateInput) {
  return apiPatch<ManagedProduct>(
    `${PRODUCTS}/${encodeURIComponent(id)}`,
    input,
  );
}

export function deleteManagedProduct(id: string) {
  return apiDelete(`${PRODUCTS}/${encodeURIComponent(id)}`);
}
