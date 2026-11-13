'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown } from 'react-bootstrap';
import { Bell, AlertTriangle } from 'lucide-react';
import { useAdminCtx } from './AdminContext';
import { useStockAlerts } from '../../hooks/useStockAlerts';
import { formatTime } from '../../shared/lib/format';

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
  const { alerts, total: openAlertsCount } = useStockAlerts();

  // Lấy tiêu đề trang ngắn gọn theo pathname
  const getPageTitle = () => {
    if (pathname.includes('/dashboard')) return 'Dashboard';
    if (pathname.includes('/orders')) return 'Quản lý đơn hàng';
    if (pathname.includes('/inventory/alerts') || pathname.includes('/alerts')) return 'Cảnh báo tồn kho';
    if (pathname.includes('/inventory')) return 'Quản lý tồn kho';
    if (pathname.includes('/products')) return 'Quản lý sản phẩm';
    if (pathname.includes('/categories')) return 'Danh mục sản phẩm';
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
  const alertsPageUrl = isStaff ? '/staff/inventory/alerts' : '/admin/inventory/alerts';

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
          {/* Cụm trái: Nút hamburger (mobile) & Tiêu đề trang */}
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

          {/* Cụm phải: Chuông cảnh báo (Dropdown T5) & Nhãn vai trò */}
          <div className="d-flex align-items-center gap-3">
            <Dropdown align="end">
              <Dropdown.Toggle
                as="button"
                className="position-relative d-inline-flex align-items-center justify-content-center text-secondary border-0 bg-transparent p-0"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
                aria-label="Thông báo cảnh báo tồn kho"
                title="Cảnh báo tồn kho"
              >
                <Bell size={20} className={openAlertsCount > 0 ? 'bell-shake-once text-dark' : 'text-secondary'} />

                {openAlertsCount > 0 && (
                  <span
                    className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                    style={{ fontSize: '0.65rem' }}
                  >
                    {openAlertsCount > 99 ? '99+' : openAlertsCount}
                  </span>
                )}
              </Dropdown.Toggle>

              <Dropdown.Menu
                className="shadow-lg border-0 py-0"
                style={{
                  width: '320px',
                  maxWidth: '90vw',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  zIndex: 1055,
                }}
              >
                <div className="p-3 bg-light border-bottom d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <AlertTriangle size={16} className="text-danger" />
                    <span className="fw-bold small text-dark">Cảnh báo tồn kho</span>
                  </div>
                  <span className="badge bg-danger rounded-pill small">
                    {openAlertsCount} đang mở
                  </span>
                </div>

                <div
                  className="list-group list-group-flush"
                  style={{ maxHeight: '300px', overflowY: 'auto' }}
                >
                  {alerts.length === 0 ? (
                    <div className="p-4 text-center text-muted small">
                      Không có cảnh báo
                    </div>
                  ) : (
                    alerts.slice(0, 5).map(alert => {
                      const current = alert.currentAvailable ?? alert.availableAtTrigger;
                      return (
                        <div key={alert.id} className="list-group-item p-3 border-bottom small">
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <span className="fw-semibold text-dark text-truncate">
                              {alert.productName}
                            </span>
                            <span
                              className={`badge ${
                                alert.alertLevel === 'CRITICAL' ? 'bg-danger' : 'bg-warning text-dark'
                              }`}
                              style={{ fontSize: '0.65rem' }}
                            >
                              {alert.alertLevel === 'CRITICAL' ? 'Hết hàng' : 'Tồn thấp'}
                            </span>
                          </div>
                          <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                            Kho: <strong>{alert.warehouseName || alert.warehouseCode}</strong> · Còn:{' '}
                            <strong className="text-danger">{current}</strong> / Ngưỡng:{' '}
                            {alert.thresholdAtTrigger}
                          </div>
                          <div className="text-muted mt-0.5" style={{ fontSize: '0.7rem' }}>
                            {formatTime(alert.triggeredAt)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="p-2 border-top bg-light text-center">
                  <Link
                    href={alertsPageUrl}
                    className="text-decoration-none small fw-semibold text-primary"
                  >
                    Xem tất cả cảnh báo →
                  </Link>
                </div>
              </Dropdown.Menu>
            </Dropdown>

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
