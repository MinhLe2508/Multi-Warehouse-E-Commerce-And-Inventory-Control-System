'use client';

import React from 'react';
import { Alert, Button, Placeholder } from 'react-bootstrap';

export interface DataStateProps {
  loading?: boolean;
  error?: string | Error | null;
  empty?: boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  children: React.ReactNode;
  /**
   * Kiểu skeleton: 'card' (thẻ), 'table' (bảng), hoặc 'chart' (biểu đồ)
   */
  skeletonType?: 'card' | 'table' | 'chart';
  skeletonRows?: number;
}

export function DataState({
  loading = false,
  error = null,
  empty = false,
  emptyMessage = 'Không có dữ liệu hiển thị.',
  onRetry,
  children,
  skeletonType = 'card',
  skeletonRows = 4,
}: DataStateProps) {
  // Trạng thái 1: Đang tải (dùng Placeholder của Bootstrap làm skeleton)
  if (loading) {
    if (skeletonType === 'table') {
      return (
        <div className="table-responsive p-3" aria-busy="true" aria-live="polite">
          <Placeholder as="div" animation="glow" className="mb-3">
            <Placeholder xs={12} size="lg" className="bg-secondary rounded opacity-25" />
          </Placeholder>
          {Array.from({ length: skeletonRows }).map((_, idx) => (
            <Placeholder as="div" key={idx} animation="glow" className="mb-2.5">
              <Placeholder xs={3} className="me-2 bg-secondary rounded opacity-25" />
              <Placeholder xs={4} className="me-2 bg-secondary rounded opacity-25" />
              <Placeholder xs={2} className="me-2 bg-secondary rounded opacity-25" />
              <Placeholder xs={2} className="bg-secondary rounded opacity-25" />
            </Placeholder>
          ))}
        </div>
      );
    }

    if (skeletonType === 'chart') {
      return (
        <div className="card p-4 text-center" aria-busy="true" aria-live="polite">
          <Placeholder as="div" animation="glow">
            <Placeholder xs={4} size="lg" className="mb-4 bg-secondary rounded opacity-25" />
            <div
              className="bg-secondary rounded opacity-25 w-100"
              style={{ height: '240px' }}
            />
          </Placeholder>
        </div>
      );
    }

    // Default: card skeleton
    return (
      <div className="card p-4" aria-busy="true" aria-live="polite">
        <Placeholder as="p" animation="glow">
          <Placeholder xs={6} className="bg-secondary rounded opacity-25" />
        </Placeholder>
        <Placeholder as="p" animation="glow">
          <Placeholder xs={7} className="bg-secondary rounded opacity-25 me-1" />
          <Placeholder xs={4} className="bg-secondary rounded opacity-25" />
        </Placeholder>
      </div>
    );
  }

  // Trạng thái 2: Lỗi (Alert variant danger + nút Tải lại)
  if (error) {
    const errorText = typeof error === 'string' ? error : error.message || 'Đã xảy ra lỗi khi tải dữ liệu.';
    return (
      <Alert variant="danger" className="d-flex flex-column align-items-start gap-2 my-3">
        <div className="d-flex align-items-center gap-2">
          <strong>Lỗi nạp dữ liệu:</strong> {errorText}
        </div>
        {onRetry && (
          <Button
            variant="outline-danger"
            size="sm"
            onClick={onRetry}
            className="btn-compact mt-1"
          >
            Tải lại
          </Button>
        )}
      </Alert>
    );
  }

  // Trạng thái 3: Rỗng
  if (empty) {
    return (
      <div className="card p-5 text-center text-muted bg-white border">
        <p className="mb-2 fs-5">📭</p>
        <p className="mb-0 small">{emptyMessage}</p>
      </div>
    );
  }

  // Trạng thái 4: Có dữ liệu
  return <>{children}</>;
}
