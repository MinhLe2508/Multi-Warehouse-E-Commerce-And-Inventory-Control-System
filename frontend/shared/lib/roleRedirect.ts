export type UserRole = 'ADMIN' | 'WAREHOUSE_STAFF' | 'CUSTOMER';

export function isBuyerRole(role?: UserRole): boolean {
  return role === 'CUSTOMER' || role === 'WAREHOUSE_STAFF';
}

const storefrontPaths = ['/products', '/cart', '/checkout', '/orders', '/account', '/notifications'];
const inArea = (path: string, area: string) => path === area || path.startsWith(area + '/');

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
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || /[\\\r\n\t]/.test(next)) {
    return getHomeByRole(role);
  }
  const { pathname, search, hash } = new URL(next, 'http://multimart.local');
  if (pathname.startsWith('//')) return getHomeByRole(role);
  const route = pathname + search + hash;
  if (role === 'ADMIN') {
    if (inArea(pathname, '/admin') && !inArea(pathname, '/admin/forbidden')) {
      return route;
    }
  } else if (role === 'WAREHOUSE_STAFF') {
    if (inArea(pathname, '/staff') || pathname === '/' ||
        storefrontPaths.some((path) => inArea(pathname, path))) {
      return route;
    }
  } else if (role === 'CUSTOMER') {
    if (!inArea(pathname, '/admin') && !inArea(pathname, '/staff')) {
      return route;
    }
  }

  return getHomeByRole(role);
}
