export type AdminRole = 'ADMIN' | 'WAREHOUSE_STAFF';

export interface AdminNavItem {
  href: string;
  label: string;
  roles: AdminRole[];
  warehouseScoped?: boolean;
  badge?: string;
}

export interface AdminNavGroup {
  id: string;
  title: string;
  items: AdminNavItem[];
  isSingle?: boolean; // Hiển thị phẳng không cần accordion nếu chỉ có 1 item
}

// Menu dành cho Quản trị viên (Admin - Khớp Ảnh 2)
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'overview',
    title: 'Dashboard',
    isSingle: true,
    items: [
      {
        href: '/admin/dashboard',
        warehouseScoped: true,
        label: 'Dashboard',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'business',
    title: 'Kinh doanh',
    items: [
      {
        href: '/admin/orders',
        warehouseScoped: true,
        label: 'Đơn hàng',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/payments',
        label: 'Thanh toán',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Kho & tồn kho',
    items: [
      {
        href: '/admin/warehouses',
        label: 'Quản lý kho hàng',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/inventory',
        warehouseScoped: true,
        label: 'Tồn kho',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/inventory/reservations',
        warehouseScoped: true,
        label: 'Giữ hàng',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/inventory/alerts',
        warehouseScoped: true,
        label: 'Cảnh báo tồn kho',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/inventory/audit-logs',
        warehouseScoped: true,
        label: 'Lịch sử biến động',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'products',
    title: 'Sản phẩm',
    items: [
      {
        href: '/admin/products',
        label: 'Sản phẩm',
        roles: ['ADMIN', 'WAREHOUSE_STAFF'],
      },
      {
        href: '/admin/categories',
        label: 'Danh mục',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'ai-assistant',
    title: 'Hỗ trợ AI',
    items: [
      {
        href: '/admin/ai/chats',
        label: 'Phiên hội thoại',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/ai/knowledge',
        label: 'Kho tri thức RAG',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Tài khoản & nhân sự',
    items: [
      {
        href: '/admin/users/customers',
        label: 'Khách hàng',
        roles: ['ADMIN'],
      },
      {
        href: '/admin/users/staff',
        label: 'Nhân viên',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Thống kê & báo cáo',
    isSingle: true,
    items: [
      {
        href: '/admin/reports',
        warehouseScoped: true,
        label: 'Thống kê & báo cáo',
        roles: ['ADMIN'],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Cài đặt',
    isSingle: true,
    items: [
      {
        href: '/admin/settings',
        label: 'Cài đặt',
        roles: ['ADMIN'],
      },
    ],
  },
];

// Menu dành cho Nhân viên kho (Staff - Khớp T6 và SRS FR-AUTH-02)
export const STAFF_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'staff-overview',
    title: 'Dashboard',
    isSingle: true,
    items: [
      {
        href: '/staff/dashboard',
        label: 'Dashboard',
        roles: ['WAREHOUSE_STAFF'],
      },
    ],
  },
  {
    id: 'staff-orders',
    title: 'Đơn hàng',
    isSingle: true,
    items: [
      {
        href: '/staff/orders',
        label: 'Đơn hàng',
        roles: ['WAREHOUSE_STAFF'],
      },
    ],
  },
  {
    id: 'staff-inventory-view',
    title: 'Tồn kho',
    isSingle: true,
    items: [
      {
        href: '/staff/inventory',
        label: 'Tồn kho',
        roles: ['WAREHOUSE_STAFF'],
      },
    ],
  },
  {
    id: 'staff-alerts-view',
    title: 'Cảnh báo',
    isSingle: true,
    items: [
      {
        href: '/staff/inventory/alerts',
        label: 'Cảnh báo',
        roles: ['WAREHOUSE_STAFF'],
      },
    ],
  },
  {
    id: 'staff-products-view',
    title: 'Sản phẩm',
    isSingle: true,
    items: [
      {
        href: '/staff/products',
        label: 'Sản phẩm',
        roles: ['WAREHOUSE_STAFF'],
      },
    ],
  },
];

export function activeAdminNavItem(path: string, groups: AdminNavGroup[]) {
  let match: AdminNavItem | undefined;
  for (const { items } of groups) {
    for (const item of items) {
      if (
        (path === item.href || path.startsWith(item.href + '/')) &&
        (!match || item.href.length > match.href.length)
      ) {
        match = item;
      }
    }
  }
  return match;
}
