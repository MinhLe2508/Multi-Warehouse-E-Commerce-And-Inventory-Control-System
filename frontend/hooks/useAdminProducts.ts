'use client';

import { useEffect, useState } from 'react';
import {
  listManagedProducts,
  listProductCategories,
  type ManagedProductsPage,
  type ProductCategory,
} from '../shared/lib/adminProductsApi';
import { extractErrorMessage } from '../shared/lib/apiClient';

const PAGE_SIZE = 12;

export function useAdminProducts() {
  const [filters, setFilters] = useState({
    search: '',
    categoryId: '',
    page: 1,
  });
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    data?: ManagedProductsPage;
    error?: string;
  }>();
  const [categoryResult, setCategoryResult] = useState<{
    items?: ProductCategory[];
    error?: string;
  }>({});
  const key = JSON.stringify([filters, revision]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void listManagedProducts({ ...filters, pageSize: PAGE_SIZE }).then(
        (data) => {
          if (!active) return;
          const lastPage = Math.max(data.totalPages, 1);
          if (filters.page > lastPage) {
            setFilters((current) =>
              current === filters ? { ...current, page: lastPage } : current,
            );
            return;
          }
          setResult({ key, data });
        },
        (error: unknown) => {
          if (active) {
            setResult({
              key,
              error: extractErrorMessage(error, 'Không tải được sản phẩm.'),
            });
          }
        },
      );
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, key]);

  useEffect(() => {
    let active = true;
    void listProductCategories().then(
      (items) => {
        if (active) setCategoryResult({ items });
      },
      (error: unknown) => {
        if (active) {
          setCategoryResult({
            error: extractErrorMessage(error, 'Không tải được danh mục.'),
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [revision]);

  const current = result?.key === key ? result : undefined;
  return {
    ...filters,
    products: current?.data?.items ?? [],
    total: current?.data?.total ?? 0,
    totalPages: Math.max(current?.data?.totalPages ?? 0, 1),
    loading: !current,
    error: current?.error,
    categories: categoryResult.items ?? [],
    categoryError: categoryResult.error,
    setSearch: (search: string) =>
      setFilters((current) => ({ ...current, search, page: 1 })),
    setCategoryId: (categoryId: string) =>
      setFilters((current) => ({ ...current, categoryId, page: 1 })),
    setPage: (page: number) => setFilters((current) => ({ ...current, page })),
    refresh: () => setRevision((current) => current + 1),
  };
}
