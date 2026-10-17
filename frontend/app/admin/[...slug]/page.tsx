'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Card, Badge } from 'react-bootstrap';

export default function ComingSoonPage() {
  const pathname = usePathname();

  return (
    <div className="container-fluid py-4">
      <div className="row justify-content-center">
        <div className="col-12 col-md-10 col-lg-8">
          <Card className="shadow-sm border-0 text-center p-4 p-md-5">
            <Card.Body>
              <div
                className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                style={{
                  width: '76px',
                  height: '76px',
                  backgroundColor: '#f5f3ff',
                  border: '2px solid #ede9fe',
                  color: '#7c3aed',
                  fontSize: '2rem',
                }}
              >
                🚧
              </div>
              <h1 className="h4 fw-bold mb-2">Tính năng đang được phát triển</h1>
              <p className="text-muted mb-3">
                Đường dẫn: <code>{pathname}</code>
              </p>
              <div className="mb-4">
                <Badge bg="warning" text="dark" className="px-3 py-2 fs-6 fw-normal">
                  Kế hoạch triển khai: Các tuần tiếp theo (Tuần 3 & 4)
                </Badge>
              </div>
              <p className="text-secondary small mb-4 mx-auto" style={{ maxWidth: '480px' }}>
                Hệ thống đang hoàn thiện các module nghiệp vụ Backend (OrdersService, InventoryService, AI Chatbot RAG). Mục này được hiển thị trước trên thanh điều hướng cho vai trò Quản trị viên theo đặc tả giao diện.
              </p>
              <div className="d-flex justify-content-center gap-2">
                <Link href="/admin/dashboard" className="btn btn-gradient-purple" style={{ minHeight: '40px', padding: '0.45rem 1.25rem' }}>
                  Quay lại Dashboard
                </Link>
                <Link href="/admin/inventory" className="btn btn-outline-purple" style={{ minHeight: '40px', padding: '0.45rem 1.25rem' }}>
                  Xem Quản lý Tồn kho
                </Link>
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}
