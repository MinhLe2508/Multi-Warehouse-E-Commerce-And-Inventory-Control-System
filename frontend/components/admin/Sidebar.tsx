'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Collapse, Offcanvas } from 'react-bootstrap';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Warehouse,
  Tag,
  Sparkles,
  Users,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import {
  ADMIN_NAV_GROUPS,
  STAFF_NAV_GROUPS,
  type AdminNavGroup,
} from '../../shared/config/adminNav';
import { useCurrentAdminUser } from '../../hooks/useCurrentAdminUser';

export interface SidebarProps {
  variant?: 'admin' | 'staff';
  showMobile?: boolean;
  onHideMobile?: () => void;
}

// Bảng icon cho CÁC PHẦN CHÍNH (Level 1)
function getNavGroupIcon(groupId: string) {
  switch (groupId) {
    case 'overview':
    case 'staff-overview':
      return <LayoutDashboard size={18} className="admin-nav-icon" />;
    case 'business':
      return <ShoppingBag size={18} className="admin-nav-icon" />;
    case 'staff-orders':
      return <Package size={18} className="admin-nav-icon" />;
    case 'inventory':
    case 'staff-inventory':
      return <Warehouse size={18} className="admin-nav-icon" />;
    case 'products':
      return <Tag size={18} className="admin-nav-icon" />;
    case 'ai-assistant':
      return <Sparkles size={18} className="admin-nav-icon" />;
    case 'accounts':
      return <Users size={18} className="admin-nav-icon" />;
    case 'reports':
      return <BarChart3 size={18} className="admin-nav-icon" />;
    case 'settings':
      return <Settings size={18} className="admin-nav-icon" />;
    default:
      return <LayoutDashboard size={18} className="admin-nav-icon" />;
  }
}

export function SidebarContent({
  variant = 'admin',
  onNavigate,
}: {
  variant?: 'admin' | 'staff';
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { logout } = useCurrentAdminUser();

  const isStaffVariant = variant === 'staff';
  const navGroups = isStaffVariant ? STAFF_NAV_GROUPS : ADMIN_NAV_GROUPS;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    business: false,
    inventory: false,
    products: false,
    'ai-assistant': false,
    accounts: false,
    'staff-inventory': false,
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isItemActive = (href: string) => {
    if (href === '/admin/dashboard' || href === '/staff/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const renderNavGroup = (group: AdminNavGroup) => {
    // Chỉ các phần chính mới có icon
    const groupIcon = getNavGroupIcon(group.id);

    // Mục phẳng (Single item)
    if (group.isSingle || group.items.length === 1) {
      const item = group.items[0];
      const active = isItemActive(item.href);
      return (
        <div key={group.id} className="mb-1">
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`admin-nav-item-btn ${active ? 'active' : ''}`}
          >
            <div className="d-flex align-items-center min-w-0">
              {groupIcon}
              <span className="text-truncate">{item.label}</span>
            </div>
            {!item.ready && (
              <span
                className="badge rounded-pill"
                style={{
                  backgroundColor: '#f5f3ff',
                  color: '#7c3aed',
                  fontSize: '0.675rem',
                  border: '1px solid #ddd6fe',
                }}
              >
                Sắp có
              </span>
            )}
          </Link>
        </div>
      );
    }

    // Nhóm có menu con (Accordion)
    const isOpen = openGroups[group.id] ?? false;
    const hasActiveChild = group.items.some(it => isItemActive(it.href));

    return (
      <div key={group.id} className="mb-1">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleGroup(group.id)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleGroup(group.id);
            }
          }}
          className={`admin-nav-item-btn ${hasActiveChild ? 'fw-semibold text-primary' : ''}`}
          aria-expanded={isOpen}
        >
          <div className="d-flex align-items-center min-w-0">
            {groupIcon}
            <span className="text-truncate">{group.title}</span>
          </div>
          <span className={`admin-nav-chevron ${isOpen ? 'open' : ''}`}>
            ▶
          </span>
        </div>

        {/* Các mục con bên trong KHÔNG CÓ ICON (đúng yêu cầu: chỉ các phần chính có icon) */}
        <Collapse in={isOpen}>
          <div className="pt-1">
            {group.items.map(item => {
              const active = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`admin-subnav-link ${active ? 'active' : ''}`}
                >
                  <span className="text-truncate">{item.label}</span>
                  {!item.ready && (
                    <span
                      className="badge rounded-pill ms-2"
                      style={{
                        backgroundColor: '#f5f3ff',
                        color: '#7c3aed',
                        fontSize: '0.65rem',
                        border: '1px solid #ddd6fe',
                      }}
                    >
                      Sắp có
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </Collapse>
      </div>
    );
  };

  const displayName = isStaffVariant ? 'Nguyễn Minh Anh' : 'Quản trị viên';
  const displaySubtitle = isStaffVariant ? 'Nhân viên kho · WH-HCM' : 'Admin · toàn quyền';
  const displayAvatarText = isStaffVariant ? 'MA' : 'tv';

  return (
    <div className="d-flex flex-column h-100 bg-white">
      {/* Brand Header — Gradient Tím Trắng */}
      <div className="p-3 pb-2 d-flex align-items-center gap-2">
        <div
          className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
          style={{
            width: '34px',
            height: '34px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
            fontSize: '0.95rem',
            boxShadow: '0 4px 10px rgba(124, 58, 237, 0.3)',
          }}
        >
          {isStaffVariant ? 'S' : 'M'}
        </div>
        <div>
          <h2
            className="h5 fw-bold mb-0"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}
          >
            {isStaffVariant ? 'MWH Staff' : 'MWH Admin'}
          </h2>
        </div>
      </div>

      {/* Danh sách Menu cuộn riêng */}
      <nav aria-label="Điều hướng" className="admin-sidebar-scroll flex-grow-1">
        {navGroups.map(renderNavGroup)}
      </nav>

      {/* Khối tài khoản & Nút đăng xuất ở góc dưới bên trái */}
      <div
        className="admin-sidebar-footer p-3 border-top d-flex align-items-center justify-content-between"
        style={{ borderColor: '#ede9fe' }}
      >
        <div className="d-flex align-items-center gap-2 min-w-0">
          <div
            className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold flex-shrink-0"
            style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              fontSize: '0.85rem',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
            }}
          >
            {displayAvatarText}
          </div>
          <div className="min-w-0">
            <div
              className="fw-bold small text-truncate text-dark leading-tight"
              style={{ lineHeight: 1.2 }}
            >
              {displayName}
            </div>
            <div
              className="text-muted text-truncate"
              style={{ fontSize: '0.725rem' }}
            >
              {displaySubtitle}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="btn btn-outline-secondary btn-sm flex-shrink-0 d-flex align-items-center gap-1"
          style={{
            fontSize: '0.775rem',
            padding: '0.3rem 0.65rem',
            borderRadius: '6px',
            borderColor: '#e5e7eb',
            color: '#4b5563',
            backgroundColor: '#ffffff',
            transition: 'all 0.2s ease',
          }}
          title="Đăng xuất khỏi hệ thống"
        >
          <LogOut size={13} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  variant = 'admin',
  showMobile = false,
  onHideMobile,
}: SidebarProps) {
  return (
    <>
      <aside
        className="admin-sidebar-desktop d-none d-lg-flex"
        aria-label="Sidebar điều hướng"
      >
        <SidebarContent variant={variant} />
      </aside>

      <Offcanvas
        show={showMobile}
        onHide={onHideMobile}
        placement="start"
        className="admin-offcanvas-sidebar d-lg-none"
        style={{ width: '254px' }}
      >
        <Offcanvas.Header closeButton className="p-3 border-bottom">
          <Offcanvas.Title
            className="fs-6 fw-bold"
            style={{ color: '#7c3aed' }}
          >
            {variant === 'staff' ? 'MWH Staff' : 'MWH Admin'}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          <SidebarContent variant={variant} onNavigate={onHideMobile} />
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
