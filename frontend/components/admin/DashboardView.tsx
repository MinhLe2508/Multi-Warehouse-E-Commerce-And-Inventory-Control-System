'use client';

import React from 'react';
import Link from 'next/link';
import { Row, Col, Card } from 'react-bootstrap';
import {
  DollarSign,
  Package,
  TrendingUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Tooltip,
} from 'recharts';
import { RevealWrapper } from './RevealWrapper';

// Dữ liệu mẫu 14 ngày gần nhất khớp hình mockup
const FOURTEEN_DAYS_DATA = [
  { day: 'D1', revenue: 32000000 },
  { day: 'D2', revenue: 42000000 },
  { day: 'D3', revenue: 38000000 },
  { day: 'D4', revenue: 51000000 },
  { day: 'D5', revenue: 48000000 },
  { day: 'D6', revenue: 62000000 },
  { day: 'D7', revenue: 54000000 },
  { day: 'D8', revenue: 68000000 },
  { day: 'D9', revenue: 64000000 },
  { day: 'D10', revenue: 75000000 },
  { day: 'D11', revenue: 71000000 },
  { day: 'D12', revenue: 82000000 },
  { day: 'D13', revenue: 70000000 },
  { day: 'D14', revenue: 89000000 },
];

export function DashboardView() {
  return (
    <div className="container-fluid p-0" style={{ maxWidth: '1100px' }}>
      {/* Tiêu đề trang */}
      <h1 className="h4 fw-bold mb-3 text-dark" style={{ letterSpacing: '-0.02em' }}>
        Dashboard
      </h1>

      {/* Hàng 1: 3 Thẻ KPI chính với hiệu ứng Hover & Icon Gradient Tím */}
      <RevealWrapper className="mb-3">
        <Row className="g-3">
          <Col xs={12} md={4}>
            <Card className="admin-kpi-card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-secondary small fw-medium">
                  Doanh thu hôm nay
                </span>
                <div
                  className="kpi-icon-badge"
                  style={{
                    backgroundColor: '#f5f3ff',
                    color: '#7c3aed',
                    border: '1px solid #ede9fe',
                  }}
                >
                  <DollarSign size={18} />
                </div>
              </div>
              <div className="h3 fw-bold mb-0 text-dark">
                72.000.000 <u style={{ textDecorationThickness: '2px', color: '#7c3aed' }}>đ</u>
              </div>
            </Card>
          </Col>

          <Col xs={12} md={4}>
            <Card className="admin-kpi-card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-secondary small fw-medium">
                  Tổng số đơn
                </span>
                <div
                  className="kpi-icon-badge"
                  style={{
                    backgroundColor: '#ede9fe',
                    color: '#6d28d9',
                    border: '1px solid #ddd6fe',
                  }}
                >
                  <Package size={18} />
                </div>
              </div>
              <div className="h3 fw-bold mb-0 text-dark">
                128
              </div>
            </Card>
          </Col>

          <Col xs={12} md={4}>
            <Card className="admin-kpi-card p-3 h-100">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="text-secondary small fw-medium">
                  Tỉ lệ hoàn tất
                </span>
                <div
                  className="kpi-icon-badge"
                  style={{
                    backgroundColor: '#fae8ff',
                    color: '#a855f7',
                    border: '1px solid #f5d0fe',
                  }}
                >
                  <TrendingUp size={18} />
                </div>
              </div>
              <div className="h3 fw-bold mb-0 text-dark">
                87%
              </div>
            </Card>
          </Col>
        </Row>
      </RevealWrapper>

      {/* Hàng 2: Thẻ Cảnh báo chưa xử lý */}
      <RevealWrapper className="mb-3">
        <Row className="g-3">
          <Col xs={12} sm={6} md={3}>
            <Link href="/admin/inventory" className="text-decoration-none">
              <Card className="admin-kpi-card p-3 h-100">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="text-secondary small fw-medium">
                    Cảnh báo tồn kho
                  </span>
                  <div
                    className="kpi-icon-badge"
                    style={{
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                    }}
                  >
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className="h3 fw-bold mb-0" style={{ color: '#dc2626' }}>
                  3
                </div>
                <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
                  Xem ma trận đa kho →
                </div>
              </Card>
            </Link>
          </Col>
        </Row>
      </RevealWrapper>

      {/* Hàng 3: Biểu đồ Doanh thu 14 ngày gần nhất với Recharts Gradient Tím */}
      <RevealWrapper className="mb-3">
        <Card className="admin-kpi-card p-3">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <span className="fw-bold small text-dark">
              Doanh thu 14 ngày gần nhất
            </span>
            <span
              className="badge rounded-pill small"
              style={{
                backgroundColor: '#f5f3ff',
                color: '#7c3aed',
                border: '1px solid #ede9fe',
              }}
            >
              VND
            </span>
          </div>
          <div style={{ width: '100%', height: '145px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={FOURTEEN_DAYS_DATA} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                <Tooltip
                  formatter={(val) => [`${Number(val || 0).toLocaleString('vi-VN')} đ`, 'Doanh thu']}
                  labelFormatter={(lbl) => `Ngày ${String(lbl)}`}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #ede9fe',
                    fontSize: '0.825rem',
                    boxShadow: '0 4px 16px rgba(124, 58, 237, 0.1)',
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill="#7c3aed"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </RevealWrapper>

      {/* Hàng 4: Hộp "Việc cần chú ý" có dải màu nhấn tím và hiệu ứng hover */}
      <RevealWrapper className="mb-2">
        <div className="fw-bold mb-2 small text-dark d-flex align-items-center gap-1.5">
          <Info size={15} style={{ color: '#7c3aed' }} />
          <span>Việc cần chú ý</span>
        </div>
        <div
          className="admin-attention-card p-3 bg-white border rounded-3 small text-secondary"
          style={{ borderColor: '#ede9fe', lineHeight: '1.5' }}
        >
          2 mặt hàng hết hoặc gần hết · 1 giữ hàng quá hạn bất thường
        </div>
      </RevealWrapper>

      {/* Dòng ghi chú nhỏ ở đáy */}
      <div className="text-muted small mt-2" style={{ fontSize: '0.775rem' }}>
        Số liệu là dữ liệu mẫu. Giao diện thật dùng recharts.
      </div>
    </div>
  );
}
