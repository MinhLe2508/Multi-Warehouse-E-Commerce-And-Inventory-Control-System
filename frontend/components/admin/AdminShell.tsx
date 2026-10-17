'use client';

import React, { useState, type ReactNode } from 'react';
import { AdminProvider } from './AdminContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { RoleGate } from './RoleGate';
import { ScrollTopButton } from './ScrollTopButton';

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

  return (
    <AdminProvider>
      <div className={`admin-root ${fontClass}`}>
        <RoleGate variant={variant}>
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
        </RoleGate>

        {/* Nút cuộn lên đầu trang */}
        <ScrollTopButton />
      </div>
    </AdminProvider>
  );
}
