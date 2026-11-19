'use client';

import { AuthError } from '@/shared/lib/authApi';
import { authenticatedRequest } from '@/store/useAuthStore';

export { AuthError };

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');
}

export async function apiGet<T>(path: string): Promise<T> {
  return authenticatedRequest<T>(path, undefined, 'GET');
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return authenticatedRequest<T>(path, body ?? {}, 'POST');
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return authenticatedRequest<T>(path, body ?? {}, 'PUT');
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return authenticatedRequest<T>(path, body ?? {}, 'PATCH');
}

export async function apiDelete(path: string): Promise<void> {
  await authenticatedRequest<void>(path, undefined, 'DELETE');
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AuthError) {
    if (err.status === 403) {
      return 'Bạn không đủ quyền thực hiện thao tác này (403).';
    }
    if (
      err.status === 404 &&
      /^Cannot (GET|POST|PATCH|PUT|DELETE) \/admin\//.test(err.message)
    ) {
      return 'Backend đang chạy chưa cung cấp chức năng này. Hãy khởi động lại backend từ cùng bản mã nguồn với frontend và kiểm tra NEXT_PUBLIC_API_URL.';
    }
    return err.message || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

