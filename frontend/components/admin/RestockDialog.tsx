'use client';

import { useEffect, useState } from 'react';
import type { StockAlert } from '../../shared/types/admin';

interface Props {
  alert: StockAlert | null;
  onClose: () => void;
  onSubmit: (alert: StockAlert, qty: number) => void;
}

export function RestockDialog({ alert, onClose, onSubmit }: Props) {
  const [qty, setQty] = useState(50);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!alert) return null;

  return (
    <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3" style={{ backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1050 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restock-title"
        className="w-100 bg-white p-4 rounded-3 shadow-lg"
        style={{ maxWidth: '420px', border: '1px solid #ede9fe' }}
      >
        <h2 id="restock-title" className="h5 fw-bold mb-1 text-dark">
          Tạo yêu cầu nhập kho
        </h2>
        <p className="text-secondary small mb-3">
          {alert.sku} · {alert.productName} tại <strong>{alert.warehouseCode}</strong>
        </p>

        <label className="d-block small fw-medium text-dark mb-3">
          Số lượng cần nhập
          <input
            type="number"
            min={1}
            value={qty}
            onChange={e => setQty(Math.max(1, Number(e.target.value)))}
            className="form-control mt-1"
            style={{
              minHeight: '42px',
              borderRadius: '8px',
              borderColor: '#ede9fe',
            }}
          />
        </label>

        <div className="d-flex justify-content-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline-purple small"
            style={{ minHeight: '40px', padding: '0.45rem 1.1rem' }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onSubmit(alert, qty);
              onClose();
            }}
            className="btn btn-gradient-purple small"
            style={{ minHeight: '40px', padding: '0.45rem 1.35rem' }}
          >
            Tạo yêu cầu
          </button>
        </div>
      </div>
    </div>
  );
}
