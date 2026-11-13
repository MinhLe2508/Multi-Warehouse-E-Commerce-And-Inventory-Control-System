'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { useCurrentAdminUser } from '../../../hooks/useCurrentAdminUser';
import { getHomeByRole } from '../../../shared/lib/roleRedirect';

export default function ForbiddenPage() {
  const { role, authenticated } = useCurrentAdminUser();
  const home = authenticated ? getHomeByRole(role) : '/login';

  return (
    <div className="container py-5 d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div
        className="card text-center p-4 p-md-5 border-0 shadow-sm"
        style={{ maxWidth: '420px', width: '100%', borderRadius: '16px', border: '1px solid #ede9fe' }}
      >
        <div className="d-inline-flex align-items-center justify-content-center mx-auto mb-3 text-danger">
          <ShieldAlert size={56} />
        </div>
        <h1 className="h4 fw-bold text-dark mb-2">Bạn không có quyền truy cập</h1>
        <p className="text-secondary small mb-4">
          Tài khoản của bạn không được phân quyền để truy cập vào trang này.
        </p>
        <div>
          <Link
            href={home}
            className="btn btn-primary px-4 py-2"
            style={{ borderRadius: '8px', minHeight: '40px' }}
          >
            Về trang của tôi
          </Link>
        </div>
      </div>
    </div>
  );
}
