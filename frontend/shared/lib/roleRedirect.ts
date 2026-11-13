export type UserRole = 'ADMIN' | 'WAREHOUSE_STAFF' | 'CUSTOMER';

/**
 * Điều hướng trang chủ dựa trên vai trò người dùng (SRS mục 5.7).
 * - ADMIN           → /admin/dashboard
 * - WAREHOUSE_STAFF → /staff/dashboard
 * - CUSTOMER        → / (Storefront)
 */
export function getHomeByRole(role: UserRole | string): string {
  switch (role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'WAREHOUSE_STAFF':
      return '/staff/dashboard';
    case 'CUSTOMER':
      return '/';
    default:
      return '/login';
  }
}

/**
 * Kiểm tra tham số next có an toàn và thuộc đúng khu vực của vai trò không (tránh open redirect).
 */
export function getSafeNextRoute(role: UserRole | string, next: string | null | undefined): string {
  if (!next || typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return getHomeByRole(role);
  }

  if (role === 'ADMIN') {
    if (next.startsWith('/admin') && !next.startsWith('/admin/forbidden')) {
      return next;
    }
  } else if (role === 'WAREHOUSE_STAFF') {
    if (next.startsWith('/staff')) {
      return next;
    }
  } else if (role === 'CUSTOMER') {
    if (!next.startsWith('/admin') && !next.startsWith('/staff')) {
      return next;
    }
  }

  return getHomeByRole(role);
}
