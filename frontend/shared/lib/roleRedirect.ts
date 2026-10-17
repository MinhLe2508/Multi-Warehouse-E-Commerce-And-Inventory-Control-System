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
      return '/admin/dev-login';
  }
}
