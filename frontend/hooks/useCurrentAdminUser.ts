'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRole } from '../shared/config/adminNav';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole | 'CUSTOMER';
  avatarUrl?: string | null;
  avatarText: string;
  subtitle: string;
  assignedWarehouseId?: string;
}

export const ADMIN_SAMPLE_USER: AdminUser = {
  id: 'usr-admin-01',
  name: 'Quản trị viên',
  email: 'admin@shop.vn',
  role: 'ADMIN',
  avatarUrl: null,
  avatarText: 'tv',
  subtitle: 'Admin · toàn quyền',
};

export const STAFF_SAMPLE_USER: AdminUser = {
  id: 'usr-staff-01',
  name: 'Nguyễn Minh Anh',
  email: 'staff.hcm@shop.vn',
  role: 'WAREHOUSE_STAFF',
  avatarUrl: null,
  avatarText: 'MA',
  subtitle: 'Nhân viên kho · WH-HCM',
};

const STORAGE_KEY = 'mwh_admin_current_user';

function getInitialUser(): AdminUser {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved) as AdminUser;
      }
    } catch {
      // Bỏ qua lỗi truy cập localStorage
    }
  }
  return ADMIN_SAMPLE_USER;
}

/**
 * Hook quản lý người dùng Admin / Staff hiện tại.
 * TODO(AUTH): Thay thế bằng JWT token từ AuthModule khi P3 hoàn thành FR-AUTH-02.
 */
export function useCurrentAdminUser() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser>(getInitialUser);

  const loginAs = (role: 'ADMIN' | 'WAREHOUSE_STAFF') => {
    const targetUser = role === 'ADMIN' ? ADMIN_SAMPLE_USER : STAFF_SAMPLE_USER;
    setUser(targetUser);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(targetUser));
      } catch {
        // Bỏ qua
      }
    }
  };

  const logout = () => {
    const customerUser: AdminUser = {
      id: 'usr-customer-01',
      name: 'Khách hàng',
      email: 'customer@gmail.com',
      role: 'CUSTOMER',
      avatarUrl: null,
      avatarText: 'KH',
      subtitle: 'Tài khoản khách hàng',
    };
    setUser(customerUser);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customerUser));
      } catch {
        // Bỏ qua
      }
      router.push('/admin/dev-login');
    }
  };

  return {
    user,
    role: user.role,
    isAdmin: user.role === 'ADMIN',
    isStaff: user.role === 'WAREHOUSE_STAFF',
    isCustomer: user.role === 'CUSTOMER',
    loginAs,
    logout,
  };
}
