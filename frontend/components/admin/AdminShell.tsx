'use client';

import React, { useState, type ReactNode } from 'react';
import { AdminProvider } from './AdminContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RoleGate } from './RoleGate';
import { ScrollTopButton } from './ScrollTopButton';
import { useCurrentAdminUser } from '../../hooks/useCurrentAdminUser';

export interface AdminShellProps {
  children: ReactNode;
  fontClass?: string;
  variant?: 'admin' | 'staff';
}

export function AdminShell({
  children,
  fontClass = '',
  variant = 'admin',
}: AdminShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { user } = useCurrentAdminUser();

  return (
    <RoleGate variant={variant}>
      {/* Remount provider khi đổi người dùng qua key={user?.id} để xóa toàn bộ context/state cũ (T2) */}
      <AdminProvider key={user?.id || 'anonymous'}>
        <div className={`admin-root ${fontClass}`}>
          <div className="admin-layout-wrapper">
            {/* Sidebar (Desktop cố định & Mobile Offcanvas) */}
            <Sidebar
              variant={variant}
              showMobile={mobileSidebarOpen}
              onHideMobile={() => setMobileSidebarOpen(false)}
            />

            {/* Khung nội dung chính */}
            <div className="admin-main-container">
              <Header
                variant={variant}
                onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
              />
              <main className="flex-grow-1 p-3 p-md-4" style={{ minWidth: 0 }}>
                {children}
              </main>
            </div>
          </div>

          {/* Nút cuộn lên đầu trang */}
          <ScrollTopButton />
        </div>
      </AdminProvider>
    </RoleGate>
  );
}
