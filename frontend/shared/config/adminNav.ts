export type AdminRole = 'ADMIN' | 'WAREHOUSE_STAFF';

export interface AdminNavItem {
  href: string;
  label: string;
  roles: AdminRole[];
  ready: boolean;
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
        label: 'Dashboard',
        roles: ['ADMIN'],
        ready: true,
      },
    ],
  },
  {
    id: 'business',
    title: 'Kinh doanh',
    items: [
      {
        href: '/admin/orders',
        label: 'Đơn hàng',
        roles: ['ADMIN'],
        ready: true,
      },
      {
        href: '/admin/payments',
        label: 'Thanh toán',
        roles: ['ADMIN'],
        ready: false,
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
        ready: false,
      },
      {
        href: '/admin/inventory',
        label: 'Tồn kho',
        roles: ['ADMIN'],
        ready: true,
      },
      {
        href: '/admin/inventory/reservations',
        label: 'Giữ hàng',
        roles: ['ADMIN'],
        ready: false,
      },
      {
        href: '/admin/inventory/alerts',
        label: 'Cảnh báo tồn kho',
        roles: ['ADMIN'],
        ready: true,
      },
      {
        href: '/admin/inventory/audit-logs',
        label: 'Lịch sử biến động',
        roles: ['ADMIN'],
        ready: false,
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
        ready: true,
      },
      {
        href: '/admin/categories',
        label: 'Danh mục',
        roles: ['ADMIN'],
        ready: false,
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
        ready: false,
      },
      {
        href: '/admin/ai/knowledge',
        label: 'Kho tri thức RAG',
        roles: ['ADMIN'],
        ready: false,
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
        ready: false,
      },
      {
        href: '/admin/users/staff',
        label: 'Nhân viên',
        roles: ['ADMIN'],
        ready: false,
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
        label: 'Thống kê & báo cáo',
        roles: ['ADMIN'],
        ready: false,
      },
    ],
  },
  {
    id: 'settings',
    title: 'Cài đặt & tính năng chờ BE',
    isSingle: true,
    items: [
      {
        href: '/admin/settings',
        label: 'Cài đặt & tính năng chờ BE',
        roles: ['ADMIN'],
        ready: true,
      },
    ],
  },
];

// Menu dành cho Nhân viên kho (Staff - Khớp Ảnh 3)
export const STAFF_NAV_GROUPS: AdminNavGroup[] = [
  { id: 'staff-products', title: 'Sản phẩm', isSingle: true, items: [{ href: '/staff/products', label: 'Sản phẩm', roles: ['WAREHOUSE_STAFF'], ready: true }] },
  {
    id: 'staff-overview',
    title: 'Dashboard',
    isSingle: true,
    items: [
      {
        href: '/staff/dashboard',
        label: 'Dashboard',
        roles: ['WAREHOUSE_STAFF'],
        ready: true,
      },
    ],
  },
  {
    id: 'staff-orders',
    title: 'Quản lý đơn hàng',
    isSingle: true,
    items: [
      {
        href: '/staff/orders',
        label: 'Quản lý đơn hàng',
        roles: ['WAREHOUSE_STAFF'],
        ready: true,
      },
    ],
  },
  {
    id: 'staff-inventory',
    title: 'Kho & tồn kho',
    items: [
      {
        href: '/staff/inventory',
        label: 'Tồn kho',
        roles: ['WAREHOUSE_STAFF'],
        ready: true,
      },
      {
        href: '/staff/inventory/alerts',
        label: 'Cảnh báo tồn kho',
        roles: ['WAREHOUSE_STAFF'],
        ready: true,
      },
    ],
  },
];
