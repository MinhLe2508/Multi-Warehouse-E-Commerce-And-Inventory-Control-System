'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrentAdminUser } from '../../hooks/useCurrentAdminUser';

export interface RoleGateProps {
  variant?: 'admin' | 'staff';
  children: React.ReactNode;
}

export function RoleGate({
  variant = 'admin',
  children,
}: RoleGateProps) {
  const { isCustomer, isAdmin, isStaff, ready, authenticated, mustChangePassword } = useCurrentAdminUser();
  const router = useRouter();
  const pathname = usePathname();

  const isBypassPage =
    pathname === '/admin/dev-login' ||
    pathname === '/admin/forbidden';

  useEffect(() => {
    if (isBypassPage || !ready) return;
    if (!authenticated) { router.replace('/login'); return; }
    if (mustChangePassword) { router.replace('/change-password'); return; }

    // CUSTOMER vào khu vực quản trị -> điều hướng sang trang 403 Forbidden
    if (isCustomer) {
      router.replace('/admin/forbidden');
      return;
    }

    // Nếu đang ở khu vực /admin mà user là STAFF -> điều hướng sang /staff/dashboard
    if (variant === 'admin' && isStaff && !isAdmin) {
      router.replace('/staff/dashboard');
      return;
    }

    // Nếu đang ở khu vực /staff mà user không phải STAFF hoặc ADMIN
    if (variant === 'staff' && !isStaff && !isAdmin) {
      router.replace('/admin/forbidden');
      return;
    }
  }, [isBypassPage, ready, authenticated, mustChangePassword, isCustomer, isStaff, isAdmin, variant, router]);

  if (isBypassPage) {
    return <>{children}</>;
  }

  if (!ready) return <p className="p-4">Đang xác thực tài khoản…</p>;
  if (!authenticated || mustChangePassword) return null;

  // Chặn render nếu vi phạm quyền để chờ redirect
  if (isCustomer) return null;
  if (variant === 'admin' && isStaff && !isAdmin) return null;
  if (variant === 'staff' && !isStaff && !isAdmin) return null;

  return <>{children}</>;
}
