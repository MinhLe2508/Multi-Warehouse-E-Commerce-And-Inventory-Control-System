'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname, notFound } from 'next/navigation';
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

  useEffect(() => {
    if (!ready) return;

    // Chưa đăng nhập -> Chuyển /login?next=..., không hiển thị gì của admin/staff (T3)
    if (!authenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (mustChangePassword) {
      router.replace('/change-password');
      return;
    }

    // STAFF vào route chỉ dành cho ADMIN -> Chuyển về /staff/dashboard kèm thông báo ngắn (T3)
    if (variant === 'admin' && isStaff && !isAdmin) {
      router.replace('/staff/dashboard?notice=' + encodeURIComponent('Bạn không có quyền truy cập mục này.'));
      return;
    }

    // ADMIN vào route chỉ dành cho STAFF -> Chuyển /admin/dashboard (T3)
    if (variant === 'staff' && !isStaff && isAdmin) {
      router.replace('/admin/dashboard');
      return;
    }
  }, [ready, authenticated, mustChangePassword, isStaff, isAdmin, variant, router, pathname]);

  // Chưa tải xong phiên -> hiển thị spinner, không render bất kỳ menu/layout nào tránh nháy giao diện (T2)
  if (!ready) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center min-vh-100 bg-light">
        <div className="spinner-border text-primary" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
          <span className="visually-hidden">Đang xác thực tài khoản…</span>
        </div>
        <p className="mt-3 text-secondary small">Đang xác thực phiên làm việc…</p>
      </div>
    );
  }

  // CUSTOMER vào /admin/** hoặc /staff/** -> Báo 404 chung, không tiết lộ khu vực này tồn tại (T3)
  if (isCustomer) {
    notFound();
  }

  // Chặn render giao diện khi chưa đạt quyền để chờ redirect
  if (!authenticated || mustChangePassword) return null;
  if (variant === 'admin' && isStaff && !isAdmin) return null;
  if (variant === 'staff' && !isStaff && !isAdmin) return null;

  return <>{children}</>;
}
