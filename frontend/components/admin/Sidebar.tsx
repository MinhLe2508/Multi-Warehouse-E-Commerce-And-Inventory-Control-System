'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const NAV = [
  { href: '/admin', label: 'Tổng quan' },
  { href: '/admin/orders', label: 'Đơn hàng' },
  { href: '/admin/inventory', label: 'Tồn kho' },
  { href: '/admin/alerts', label: 'Cảnh báo' },
  { href: '/admin/settings', label: 'Cài đặt' },
];

export function useIsActive() {
  const p = usePathname();
  return (href: string) => (href === '/admin' ? p === href : p.startsWith(href));
}

export function Sidebar() {
  const isActive = useIsActive();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="px-5 py-5 text-base font-bold text-teal-800">MWH Admin</div>
      <nav aria-label="Điều hướng quản trị" className="flex flex-col gap-1 px-3">
        {NAV.map(n => (
          <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}
            className={`rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
              isActive(n.href) ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-600 hover:bg-slate-100'}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
