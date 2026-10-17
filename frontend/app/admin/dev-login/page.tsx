'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentAdminUser } from '../../../hooks/useCurrentAdminUser';
import { getHomeByRole } from '../../../shared/lib/roleRedirect';

export default function DevLoginPage() {
  const router = useRouter();
  const { loginAs } = useCurrentAdminUser();
  const [email, setEmail] = useState('admin@shop.vn');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes('staff')) {
      loginAs('WAREHOUSE_STAFF');
      router.push(getHomeByRole('WAREHOUSE_STAFF'));
    } else {
      loginAs('ADMIN');
      router.push(getHomeByRole('ADMIN'));
    }
  };

  const handleQuickAdmin = () => {
    loginAs('ADMIN');
    router.push(getHomeByRole('ADMIN'));
  };

  const handleQuickStaff = () => {
    loginAs('WAREHOUSE_STAFF');
    router.push(getHomeByRole('WAREHOUSE_STAFF'));
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center min-vh-100"
      style={{
        background: 'linear-gradient(180deg, #faf5ff 0%, #f3f0ff 50%, #f8f7fc 100%)',
      }}
    >
      <div
        className="card shadow-sm border-0 p-4 p-sm-5"
        style={{
          width: '100%',
          maxWidth: '460px',
          borderRadius: '16px',
          backgroundColor: '#ffffff',
          boxShadow: '0 10px 30px -5px rgba(124, 58, 237, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.04)',
          border: '1px solid #ede9fe',
        }}
      >
        <div className="d-flex align-items-center gap-2 mb-4">
          <div
            className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm"
            style={{
              width: '36px',
              height: '36px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              fontSize: '1rem',
              boxShadow: '0 4px 10px rgba(124, 58, 237, 0.3)',
            }}
          >
            M
          </div>
          <h1
            className="h4 fw-bold mb-0"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}
          >
            MWH — Đăng nhập
          </h1>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-3 text-start">
            <label
              htmlFor="email-input"
              className="form-label small fw-medium mb-1 text-secondary"
            >
              Email
            </label>
            <input
              id="email-input"
              type="email"
              required
              className="form-control"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                borderColor: '#ede9fe',
                minHeight: '44px',
                borderRadius: '8px',
                backgroundColor: '#faf5ff',
              }}
            />
          </div>

          <div className="mb-4 text-start">
            <label
              htmlFor="password-input"
              className="form-label small fw-medium mb-1 text-secondary"
            >
              Mật khẩu
            </label>
            <input
              id="password-input"
              type="password"
              placeholder="Mật khẩu"
              className="form-control"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                borderColor: '#ede9fe',
                minHeight: '44px',
                borderRadius: '8px',
                backgroundColor: '#faf5ff',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn w-100 text-white fw-semibold mb-3 d-flex align-items-center justify-content-center shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              minHeight: '44px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              border: 'none',
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            Đăng nhập
          </button>
        </form>

        <p
          className="text-secondary small mb-3 text-start"
          style={{ fontSize: '0.8125rem', lineHeight: '1.45' }}
        >
          Mô phỏng: mật khẩu bất kỳ. Backend trả về vai trò để chuyển đúng trang (Admin hoặc Staff).
        </p>

        <div className="d-flex gap-2">
          <button
            type="button"
            onClick={handleQuickAdmin}
            className="btn btn-outline-secondary w-50 py-2 small fw-medium"
            style={{
              borderRadius: '8px',
              fontSize: '0.8125rem',
              borderColor: '#ede9fe',
              backgroundColor: '#ffffff',
              color: '#6d28d9',
              transition: 'all 0.2s ease',
            }}
          >
            Thử tài khoản Admin
          </button>

          <button
            type="button"
            onClick={handleQuickStaff}
            className="btn btn-outline-secondary w-50 py-2 small fw-medium"
            style={{
              borderRadius: '8px',
              fontSize: '0.8125rem',
              borderColor: '#ede9fe',
              backgroundColor: '#ffffff',
              color: '#6d28d9',
              transition: 'all 0.2s ease',
            }}
          >
            Thử tài khoản nhân viên
          </button>
        </div>
      </div>
    </div>
  );
}
