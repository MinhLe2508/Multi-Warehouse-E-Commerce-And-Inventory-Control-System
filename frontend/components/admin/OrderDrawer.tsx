'use client';

import React from 'react';
import { Offcanvas } from 'react-bootstrap';
import { NEXT_STATUS, STATUS_LABEL, formatTime, formatVnd } from '../../shared/lib/format';
import type { AdminOrder } from '../../shared/types/admin';
import { OrderBadge } from './StatusBadge';

interface Props {
  order: AdminOrder | null;
  onClose: () => void;
  onAdvance: (id: string) => void;
}

export function OrderDrawer({ order, onClose, onAdvance }: Props) {
  if (!order) return null;
  const next = NEXT_STATUS[order.status];

  return (
    <Offcanvas
      show={!!order}
      onHide={onClose}
      placement="end"
      backdrop={true}
      enforceFocus={true}
      restoreFocus={true}
      keyboard={true}
      className="order-detail-offcanvas shadow-lg"
      style={{
        zIndex: 1060,
        maxWidth: '100%',
      }}
    >
      <Offcanvas.Header closeButton className="p-3 border-bottom bg-light">
        <Offcanvas.Title className="fs-6 fw-bold m-0 d-flex align-items-center gap-2">
          <span>{order.orderCode}</span>
          <OrderBadge status={order.status} />
        </Offcanvas.Title>
      </Offcanvas.Header>

      <Offcanvas.Body className="p-4 d-flex flex-column gap-4">
        {/* Địa chỉ giao hàng */}
        <div>
          <h6 className="fw-bold text-dark text-uppercase small" style={{ letterSpacing: '0.04em' }}>
            Địa chỉ giao hàng
          </h6>
          <div className="card p-3 border-0 bg-light rounded-3 mt-2">
            <div className="fw-semibold text-dark small">{order.shipping.recipient}</div>
            <div className="text-secondary small">{order.shipping.phone}</div>
            <div className="text-secondary small mt-1">{order.shipping.address}</div>
          </div>
        </div>

        {/* Danh sách sản phẩm */}
        <div>
          <h6 className="fw-bold text-dark text-uppercase small" style={{ letterSpacing: '0.04em' }}>
            Sản phẩm ({order.items.length})
          </h6>
          <div className="list-group list-group-flush mt-2 border rounded-3">
            {order.items.map(item => (
              <div key={item.sku} className="list-group-item d-flex justify-content-between align-items-center p-3">
                <div className="min-w-0 pe-2">
                  <div className="fw-semibold text-dark small text-truncate">
                    {item.productName} × {item.quantity}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                    SKU: {item.sku} · Kho: <strong>{item.warehouseCode}</strong>
                  </div>
                </div>
                <div className="fw-bold text-dark small text-nowrap">
                  {formatVnd(item.lineTotal)}
                </div>
              </div>
            ))}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
            <span className="fw-bold text-dark">Tổng tiền đơn hàng:</span>
            <span className="fs-5 fw-bold text-primary">{formatVnd(order.grandTotal)}</span>
          </div>
        </div>

        {/* Lịch sử trạng thái */}
        <div>
          <h6 className="fw-bold text-dark text-uppercase small" style={{ letterSpacing: '0.04em' }}>
            Lịch sử trạng thái
          </h6>
          <ol className="list-group list-group-numbered mt-2 border rounded-3">
            {order.history.map((h, i) => (
              <li key={i} className="list-group-item small text-secondary p-2.5">
                <span className="fw-semibold text-dark">
                  {h.fromStatus ? STATUS_LABEL[h.fromStatus] : 'Tạo đơn'}
                </span>{' '}
                → <span className="fw-semibold text-primary">{STATUS_LABEL[h.toStatus]}</span>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Bởi {h.actor} · {formatTime(h.createdAt)}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Nút hành động */}
        <div className="mt-auto pt-3 border-top">
          {next ? (
            <button
              type="button"
              onClick={() => onAdvance(order.id)}
              className="btn btn-primary w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
              style={{ minHeight: '44px', borderRadius: '8px' }}
            >
              <span>Chuyển trạng thái: “{STATUS_LABEL[next]}”</span>
            </button>
          ) : (
            <div className="alert alert-light border small text-muted text-center mb-0" role="status">
              Đơn hàng ở trạng thái “{STATUS_LABEL[order.status]}” (kết thúc luồng xử lý).
            </div>
          )}
        </div>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
