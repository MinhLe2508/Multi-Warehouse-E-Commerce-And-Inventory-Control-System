'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from 'react-bootstrap';
import { ShieldAlert, ShieldCheck, ArrowRight, ShoppingBag, LogIn } from 'lucide-react';
import { useCurrentAdminUser } from '../../../hooks/useCurrentAdminUser';

export default function ForbiddenPage() {
  const router = useRouter();
  const { isAdmin, isStaff, logout } = useCurrentAdminUser();

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-8 col-lg-6">
          <Card className="text-center shadow-sm border-0 p-4 p-md-5" style={{ borderRadius: '16px', border: '1px solid #ede9fe' }}>
            <Card.Body>
              {isAdmin ? (
                <>
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-4"
                    style={{
                      width: '84px',
                      height: '84px',
                      backgroundColor: '#f5f3ff',
                      color: '#7c3aed',
                      border: '2px solid #ddd6fe',
                    }}
                  >
                    <ShieldCheck size={44} />
                  </div>
                  <h1 className="h4 fw-bold text-dark mb-2">Tài khoản Admin đã có toàn quyền</h1>
                  <p className="text-secondary small mb-4">
                    Bạn hiện đang đăng nhập với vai trò <strong className="text-primary">ADMIN</strong> (Toàn quyền quản trị). Trang 403 này chỉ dùng để chặn tài khoản Khách hàng (CUSTOMER) khi họ cố tình truy cập vào khu vực quản trị.
                  </p>

                  <div className="d-flex flex-column flex-sm-row justify-content-center gap-2 mb-4">
                    <Link
                      href="/admin/dashboard"
                      className="btn btn-gradient-purple px-4"
                      style={{ minHeight: '42px' }}
                    >
                      <span>Vào trang Quản trị (Admin)</span>
                      <ArrowRight size={16} />
                    </Link>
                    <button
                      type="button"
                      className="btn btn-outline-purple px-3"
                      style={{ minHeight: '42px', fontSize: '0.85rem' }}
                      onClick={() => logout()}
                    >
                      Thử giả lập khách hàng (CUSTOMER)
                    </button>
                  </div>
                </>
              ) : isStaff ? (
                <>
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-4"
                    style={{
                      width: '84px',
                      height: '84px',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      border: '2px solid #bfdbfe',
                    }}
                  >
                    <ShieldCheck size={44} />
                  </div>
                  <h1 className="h4 fw-bold text-dark mb-2">Tài khoản Nhân viên kho</h1>
                  <p className="text-secondary small mb-4">
                    Bạn đang đăng nhập với vai trò <strong className="text-primary">WAREHOUSE_STAFF</strong>. Khu vực làm việc của bạn là trang dành riêng cho nhân viên kho.
                  </p>

                  <div className="d-flex justify-content-center gap-2 mb-4">
                    <Link
                      href="/staff/dashboard"
                      className="btn btn-gradient-purple px-4"
                      style={{ minHeight: '42px' }}
                    >
                      <span>Vào trang Nhân viên (Staff)</span>
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="d-inline-flex align-items-center justify-content-center rounded-circle mb-4"
                    style={{
                      width: '84px',
                      height: '84px',
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      border: '2px solid #fecaca',
                    }}
                  >
                    <ShieldAlert size={44} />
                  </div>
                  <h1 className="h4 fw-bold text-dark mb-2">403 — Không có quyền truy cập</h1>
                  <p className="text-secondary small mb-4">
                    Tài khoản hiện tại của bạn là <strong className="text-danger">CUSTOMER (Khách mua hàng)</strong>, không được cấp phép truy cập vào khu vực quản trị theo quy định phân quyền của hệ thống (SRS FR-AUTH-02 / NFR-02.2).
                  </p>

                  <div className="d-flex flex-column flex-sm-row justify-content-center gap-2 mb-4">
                    <Link
                      href="/"
                      className="btn btn-outline-purple px-4"
                      style={{ minHeight: '42px' }}
                    >
                      <ShoppingBag size={16} />
                      <span>Về trang mua sắm</span>
                    </Link>
                    <button
                      type="button"
                      className="btn btn-gradient-purple px-4"
                      style={{ minHeight: '42px' }}
                      onClick={() => {
                        router.push('/login');
                      }}
                    >
                      <LogIn size={16} />
                      <span>Đăng nhập tài khoản khác</span>
                    </button>
                  </div>
                </>
              )}

              <div className="border-top pt-3 text-muted small" style={{ borderColor: '#ede9fe' }}>
                Hệ thống phân quyền vai trò Multi-Warehouse System (Tuần 2) · FR-AUTH-02 / NFR-02.2
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}
