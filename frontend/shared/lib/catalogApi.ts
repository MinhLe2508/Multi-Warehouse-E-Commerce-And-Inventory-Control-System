import type { Category, Product, ProductPage, ProductQuery } from '@/shared/types/product';
import { getCategories, getProductById, queryProducts } from './mockData';

export const MOCK_CATALOG = process.env.NEXT_PUBLIC_CATALOG_MODE === 'mock';
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

interface ApiProduct {
  id: string; name: string; basePrice: string; discountPercent: string;
  imageUrl: string | null; categoryId: string | null; categoryName: string | null;
  description: string; stockByWarehouse: Product['stockByWarehouse'];
}

export class CatalogError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new CatalogError(response.status, `Catalog HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function adaptProduct(value: ApiProduct): Product {
  return {
    id: value.id, name: value.name,
    // Compatibility with week-1 cart. Exact decimal remains in basePrice for display.
    // Checkout totals must come from P3's Pricing API, never from this number.
    price: Number(value.basePrice), basePrice: value.basePrice,
    image: value.imageUrl || '/product-placeholder.svg', category: value.categoryId ?? '',
    categoryName: value.categoryName ?? '', description: value.description,
    stockByWarehouse: value.stockByWarehouse,
  };
}

export function productQueryString(query: ProductQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '' && value !== 'all') params.set(key, String(value));
  }
  return params.toString();
}

export async function fetchProducts(query: ProductQuery, signal?: AbortSignal): Promise<ProductPage> {
  if (MOCK_CATALOG) return queryProducts(query);
  const result = await request<Omit<ProductPage, 'items'> & { items: ApiProduct[] }>(`/products?${productQueryString(query)}`, signal);
  return { ...result, items: result.items.map(adaptProduct) };
}

export async function fetchProduct(id: string, signal?: AbortSignal): Promise<Product> {
  if (MOCK_CATALOG) {
    const product = getProductById(id);
    if (!product) throw new CatalogError(404, 'Product not found');
    return product;
  }
  return adaptProduct(await request<ApiProduct>(`/products/${encodeURIComponent(id)}`, signal));
}

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  if (MOCK_CATALOG) return getCategories();
  const result = await request<{ id: string; name: string }[]>('/products/categories', signal);
  return result.map((c) => ({ id: c.id, name: { vi: c.name, en: c.name }, icon: '📦' }));
}
