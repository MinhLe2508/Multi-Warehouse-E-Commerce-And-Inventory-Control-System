"use client";

import { useCallback, useEffect, useState } from 'react';
import { fetchCategories, fetchProduct, fetchProducts, productQueryString } from '@/shared/lib/catalogApi';
import type { ProductQuery } from '@/shared/types/product';

function useRequest<T>(key: string, loader: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; attempt: number; data?: T; error?: unknown }>();
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Catalog timeout')), 10000);
    let active = true;
    loader(controller.signal).then(
      (data) => { if (active) setState({ key, attempt, data }); },
      (error: unknown) => { if (active) setState({ key, attempt, error }); },
    ).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [key, loader, attempt]);
  const current = state?.key === key && state.attempt === attempt ? state : undefined;
  return { data: current?.data, error: current?.error, loading: !current,
    retry: () => setAttempt((value) => value + 1) };
}

export function useProducts(query: ProductQuery) {
  const key = productQueryString(query);
  const loader = useCallback((signal: AbortSignal) => {
    const params = new URLSearchParams(key);
    return fetchProducts({ category: params.get('category') ?? undefined,
      search: params.get('search') ?? undefined,
      sort: (params.get('sort') ?? 'default') as ProductQuery['sort'],
      page: Number(params.get('page') ?? 1), pageSize: Number(params.get('pageSize') ?? 12) }, signal);
  }, [key]);
  return useRequest(key, loader);
}

export function useProduct(id: string) {
  const loader = useCallback((signal: AbortSignal) => fetchProduct(id, signal), [id]);
  return useRequest(id, loader);
}

export function useCategories() {
  return useRequest('categories', fetchCategories);
}
