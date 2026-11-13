'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Collapse, Offcanvas } from 'react-bootstrap';
import {
  LayoutDashboard,
  Warehouse,
  Tag,
  Sparkles,
  Users,
  BarChart3,
  Settings,
  LogOut,
  AlertTriangle,
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
    case 'staff-orders':
      return null; // Xóa icon của đơn hàng theo yêu cầu
    case 'inventory':
    case 'staff-inventory':
    case 'staff-inventory-view':
      return <Warehouse size={18} className="admin-nav-icon" />;
    case 'staff-alerts-view':
      return <AlertTriangle size={18} className="admin-nav-icon" />;
    case 'products':
    case 'staff-products':
    case 'staff-products-view':
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
  const { user, logout } = useCurrentAdminUser();

  const isStaffVariant = variant === 'staff';
  const navGroups = isStaffVariant ? STAFF_NAV_GROUPS : ADMIN_NAV_GROUPS;

  const isItemActive = useCallback(
    (href: string) => {
      if (href === '/admin/dashboard' || href === '/staff/dashboard') {
        return pathname === href;
      }
      return pathname.startsWith(href);
    },
    [pathname]
  );

  // Chỉ mở nhóm accordion chứa route đang active, các nhóm khác mặc định đóng (svg hướng xuống)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach(g => {
      initial[g.id] = !g.isSingle && g.items.some(it => isItemActive(it.href));
    });
    return initial;
  });

  useEffect(() => {
    navGroups.forEach(g => {
      if (!g.isSingle && g.items.some(it => isItemActive(it.href))) {
        setOpenGroups(prev => (prev[g.id] ? prev : { ...prev, [g.id]: true }));
      }
    });
  }, [pathname, navGroups, isItemActive]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderNavGroup = (group: AdminNavGroup) => {
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
            className={`admin-nav-item-btn ${active ? 'active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <div className="d-flex align-items-center gap-2">
              {groupIcon}
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span className="badge rounded-pill bg-danger" style={{ fontSize: '0.65rem' }}>
                {item.badge}
              </span>
            )}
            {!item.ready && (
              <span
                className="badge rounded-pill"
                style={{
                  fontSize: '0.625rem',
                  backgroundColor: '#f5f3ff',
                  color: '#7c3aed',
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
    const isExpanded = openGroups[group.id] ?? false;
    const hasActiveChild = group.items.some(it => isItemActive(it.href));

    return (
      <div key={group.id} className="mb-1">
        <button
          type="button"
          onClick={() => toggleGroup(group.id)}
          className={`admin-nav-item-btn w-100 ${hasActiveChild ? 'active' : ''}`}
          aria-expanded={isExpanded}
        >
          <div className="d-flex align-items-center gap-2">
            {groupIcon}
            <span>{group.title}</span>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              color: '#9ca3af',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <Collapse in={isExpanded}>
          <div>
            <div className="admin-nav-sub-menu">
              {group.items.map(subItem => {
                const subActive = isItemActive(subItem.href);
                return (
                  <Link
                    key={subItem.href}
                    href={subItem.href}
                    onClick={onNavigate}
                    className={`admin-nav-sub-item ${subActive ? 'active' : ''}`}
                    aria-current={subActive ? 'page' : undefined}
                  >
                    <span className="text-truncate me-2">{subItem.label}</span>
                    {!subItem.ready && (
                      <span
                        className="badge rounded-pill ms-auto flex-shrink-0"
                        style={{
                          fontSize: '0.625rem',
                          backgroundColor: '#f5f3ff',
                          color: '#7c3aed',
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
          </div>
        </Collapse>
      </div>
    );
  };

  const displayName = user.name || (isStaffVariant ? 'Nhân viên kho' : 'Quản trị viên');
  const displaySubtitle = user.subtitle;
  const displayAvatarText = user.avatarText;

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
        className="admin-sidebar-footer p-3 border-top d-flex align-items-center justify-content-between mt-auto"
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
