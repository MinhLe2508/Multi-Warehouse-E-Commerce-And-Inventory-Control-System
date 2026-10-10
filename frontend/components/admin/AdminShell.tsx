'use client';
import type { ReactNode } from 'react';
import { AdminProvider } from './AdminContext';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AdminShell({ children, fontClass }: { children: ReactNode; fontClass: string }) {
  return (
    <AdminProvider>
      <div className={`${fontClass} flex min-h-screen bg-slate-50 text-slate-900`}>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AdminProvider>
  );
}
