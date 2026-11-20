'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive, Bell, ChevronDown, ClipboardList, History, LayoutDashboard, LogOut,
  Menu, Package, PanelLeftClose, PanelLeftOpen, ShieldAlert, Truck, UserRound,
  Warehouse, X,
} from 'lucide-react';
import { RoleGate } from '@/components/admin/RoleGate';
import { AdminProvider, useAdminCtx } from '@/components/admin/AdminContext';
import { useAdminResource } from '@/components/admin/operations/AdminUi';
import { useCurrentAdminUser } from '@/hooks/useCurrentAdminUser';
import {
  type Profile, STAFF_NOTIFICATIONS_CHANGED, STAFF_PROFILE_CHANGED,
} from './data';

const StaffProfileContext = createContext<Profile | undefined>(undefined);
export const useStaffProfile = () => useContext(StaffProfileContext);

export function useLinkedWarehouse(warehouse?: string) {
  const { warehouseId, warehouses, setWarehouseId } = useAdminCtx();
  const linked = warehouses.find(({ id }) => id === warehouse)?.id;
  useEffect(() => { if (linked) setWarehouseId(linked); }, [linked, setWarehouseId]);
  return warehouseId;
}

const groups = [
  { name: 'Công việc', links: [
    { name: 'Tổng quan', href: '/staff/dashboard', icon: LayoutDashboard },
    { name: 'Đơn hàng', href: '/staff/orders', icon: ClipboardList },
    { name: 'Xác nhận xuất kho', href: '/staff/dispatch', icon: Truck },
  ] },
  { name: 'Quản lý kho', links: [
    { name: 'Tồn kho', href: '/staff/inventory', icon: Archive },
    { name: 'Nhập kho', href: '/staff/inventory/restock', icon: Package },
    { name: 'Cảnh báo tồn kho', href: '/staff/inventory/alerts', icon: ShieldAlert },
    { name: 'Lịch sử thao tác', href: '/staff/inventory/audit-logs', icon: History },
    { name: 'Sản phẩm', href: '/staff/products', icon: Package },
  ] },
  { name: 'Cá nhân', links: [
    { name: 'Thông báo', href: '/staff/notifications', icon: Bell },
    { name: 'Hồ sơ', href: '/staff/profile', icon: UserRound },
  ] },
];

function PortalFrame({ children, fontClass }: { children: ReactNode; fontClass: string }) {
  const { user, logout } = useCurrentAdminUser();
  const { warehouseId, warehouses, setWarehouseId, refreshWarehouses } = useAdminCtx();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [profileRevision, setProfileRevision] = useState(0);
  const pathname = usePathname();
  const unread = useAdminResource<{ count: number }>('/notifications/unread-count', notificationRevision);
  const profile = useAdminResource<Profile>('/staff/profile', profileRevision);
  const current = groups.flatMap(({ links }) => links).find(({ href }) => href === pathname);
  const isOrderDetail = pathname.startsWith('/staff/orders/');
  const title = isOrderDetail ? 'Chi tiết đơn hàng' : current?.name ?? 'Tổng quan';
  const scoped = pathname === '/staff/dashboard' || pathname === '/staff/orders' ||
    pathname === '/staff/dispatch' || pathname.startsWith('/staff/inventory');
  const fullName = profile.data?.fullName ?? user.name;
  const initials = fullName.split(/\s+/).slice(-2).map((part) => part[0]).join('').toLocaleUpperCase('vi');

  useEffect(() => {
    const updateCount = () => setNotificationRevision((revision) => revision + 1);
    const updateProfile = () => setProfileRevision((revision) => revision + 1);
    const focus = () => { updateCount(); updateProfile(); refreshWarehouses(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobile(false); };
    window.addEventListener(STAFF_NOTIFICATIONS_CHANGED, updateCount);
    window.addEventListener(STAFF_PROFILE_CHANGED, updateProfile);
    window.addEventListener('focus', focus);
    window.addEventListener('keydown', escape);
    const interval = window.setInterval(updateCount, 30_000);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(STAFF_NOTIFICATIONS_CHANGED, updateCount);
      window.removeEventListener(STAFF_PROFILE_CHANGED, updateProfile);
      window.removeEventListener('focus', focus);
      window.removeEventListener('keydown', escape);
    };
  }, [refreshWarehouses]);

  return (
    <div className={`staff-portal ${fontClass} ${collapsed ? 'staff-collapsed' : ''} ${mobile ? 'staff-mobile-open' : ''}`}>
      <button type="button" className="staff-scrim" aria-label="Đóng menu" onClick={() => setMobile(false)} />
      <aside className="staff-sidebar" id="staff-navigation">
        <Link href="/staff/dashboard" className="staff-brand" onClick={() => setMobile(false)}>
          <span><Warehouse size={22} aria-hidden="true" /></span>
          <strong>Warehouse Staff</strong>
        </Link>
        <button type="button" className="staff-icon-button staff-close-menu" onClick={() => setMobile(false)} aria-label="Đóng menu">
          <X size={20} aria-hidden="true" />
        </button>
        <nav aria-label="Điều hướng nhân viên kho">
          {groups.map(({ name, links }) => (
            <div className="staff-nav-group" key={name}>
              <p>{name}</p>
              {links.map(({ name, href, icon: Icon }) => {
                const active = current?.href === href || (isOrderDetail && href === '/staff/orders');
                return <Link key={href} href={href} title={name} aria-label={name}
                  aria-current={active ? 'page' : undefined} onClick={() => setMobile(false)}>
                  <Icon size={18} aria-hidden="true" /><span>{name}</span>
                </Link>;
              })}
            </div>
          ))}
        </nav>
        <button className="staff-signout" type="button" onClick={() => void logout()} aria-label="Đăng xuất" title="Đăng xuất">
          <LogOut size={18} aria-hidden="true" /> <span>Đăng xuất</span>
        </button>
      </aside>
      <div className="staff-body">
        <header className="staff-topbar">
          <div className="staff-header-title">
            <button className="staff-icon-button staff-desktop-menu" type="button" aria-controls="staff-navigation"
              aria-expanded={!collapsed} aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
              onClick={() => setCollapsed((value) => !value)}>
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <button className="staff-icon-button staff-mobile-menu" type="button" aria-controls="staff-navigation"
              aria-expanded={mobile} aria-label="Mở menu" onClick={() => setMobile(true)}>
              <Menu size={21} aria-hidden="true" />
            </button>
            <span>{title}</span>
          </div>
          {scoped && (
            <label className="staff-header-scope">
              <Warehouse size={16} aria-hidden="true" />
              <select aria-label="Kho đang làm việc" value={warehouseId}
                onChange={(event) => setWarehouseId(event.target.value)} disabled={warehouses.length === 0}>
                <option value="ALL">{warehouses.length ? 'Tất cả kho được giao' : 'Chưa có kho được giao'}</option>
                {warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
              </select>
            </label>
          )}
          <div className="staff-header-actions">
            <Link href="/staff/notifications" className="staff-icon-button staff-bell"
              aria-label={unread.data?.count ? `Thông báo, ${unread.data.count} chưa đọc` : 'Thông báo'}>
              <Bell size={20} aria-hidden="true" />
              {Boolean(unread.data?.count) && <sup>{Math.min(unread.data?.count ?? 0, 99)}{(unread.data?.count ?? 0) > 99 ? '+' : ''}</sup>}
            </Link>
            <details className="staff-account">
              <summary aria-label="Menu hồ sơ">
                <span className="staff-avatar" aria-hidden="true">{initials}</span>
                <span className="staff-account-name">{fullName}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="staff-account-menu">
                <Link href="/staff/profile" onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}>Hồ sơ cá nhân</Link>
                <Link href="/change-password">Đổi mật khẩu</Link>
                <button type="button" onClick={() => void logout()}>Đăng xuất</button>
              </div>
            </details>
          </div>
        </header>
        <main className="staff-main">
          <StaffProfileContext.Provider value={profile.data}>{children}</StaffProfileContext.Provider>
        </main>
      </div>
    </div>
  );
}

export function StaffShell({ children, fontClass }: { children: ReactNode; fontClass: string }) {
  const { user } = useCurrentAdminUser();
  return <RoleGate variant="staff"><AdminProvider key={user.id}>
    <PortalFrame fontClass={fontClass}>{children}</PortalFrame>
  </AdminProvider></RoleGate>;
}
