'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminCtx } from './AdminContext';
import { ALERTS } from '../../shared/mock/adminMock';

export interface HeaderProps {
  variant?: 'admin' | 'staff';
  onToggleMobileSidebar?: () => void;
}

export function Header({
  variant = 'admin',
  onToggleMobileSidebar,
}: HeaderProps) {
  const pathname = usePathname();
  const { warehouses, warehouseId, setWarehouseId } = useAdminCtx();
  const [hasScrolled, setHasScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const openAlertsCount = ALERTS.filter(a => a.status === 'OPEN').length;

  // Lấy tiêu đề trang ngắn gọn theo pathname
  const getPageTitle = () => {
    if (pathname.includes('/dashboard')) return 'Dashboard';
    if (pathname.includes('/orders')) return 'Quản lý đơn hàng';
    if (pathname.includes('/inventory/alerts') || pathname.includes('/alerts')) return 'Cảnh báo tồn kho';
    if (pathname.includes('/inventory')) return 'Quản lý tồn kho';
    if (pathname.includes('/settings')) return 'Cài đặt hệ thống';
    return 'Dashboard';
  };

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setHasScrolled(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const isStaff = variant === 'staff';

  return (
    <>
      <div ref={sentinelRef} className="admin-scroll-sentinel" />

      <header
        className={`admin-header ${hasScrolled ? 'has-shadow' : ''} px-3 px-md-4`}
        style={{
          height: '56px',
          borderBottom: '1px solid #ede9fe',
        }}
      >
        <div className="d-flex align-items-center justify-content-between h-100 w-100">
          {/* Cụm trái: Nút hamburger (mobile) & Tiêu đề trang (Khớp Ảnh 2 & 3) */}
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary d-lg-none d-flex align-items-center justify-content-center p-0"
              style={{ width: '36px', height: '36px', borderRadius: '6px' }}
              onClick={onToggleMobileSidebar}
              aria-label="Mở menu điều hướng"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <span className="fw-semibold text-dark fs-6" style={{ letterSpacing: '-0.01em' }}>
              {getPageTitle()}
            </span>

            {/* Dropdown chọn kho đang xem */}
            <div className="d-none d-md-flex align-items-center gap-2 ms-3">
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
                className="form-select form-select-sm"
                style={{
                  minHeight: '34px',
                  fontSize: '0.8rem',
                  borderColor: '#d1d5db',
                  borderRadius: '6px',
                  maxWidth: '180px',
                }}
                aria-label="Chọn kho xem dữ liệu"
              >
                <option value="ALL">Tất cả kho hàng</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cụm phải: Chuông cảnh báo & Nhãn vai trò (Khớp Ảnh 2 & 3: "Trang quản trị (Admin)" / "Trang nhân viên (Staff)") */}
          <div className="d-flex align-items-center gap-3">
            <Link
              href={isStaff ? '/staff/inventory/alerts' : '/admin/inventory/alerts'}
              className="position-relative d-inline-flex align-items-center justify-content-center text-secondary text-decoration-none"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '6px',
              }}
              aria-label="Cảnh báo tồn kho"
              title="Cảnh báo tồn kho"
            >
              <svg
                className={openAlertsCount > 0 ? 'bell-shake-once' : ''}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>

              {openAlertsCount > 0 && (
                <span
                  className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                  style={{ fontSize: '0.65rem' }}
                >
                  {openAlertsCount}
                </span>
              )}
            </Link>

            <span
              className="small text-secondary fw-normal d-none d-sm-inline-block"
              style={{ fontSize: '0.85rem' }}
            >
              {isStaff ? 'Trang nhân viên (Staff)' : 'Trang quản trị (Admin)'}
            </span>
          </div>
        </div>
      </header>
    </>
  );
}
