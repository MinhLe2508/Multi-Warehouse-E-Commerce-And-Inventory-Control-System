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
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { RevealWrapper } from './RevealWrapper';
import { useDashboardAnalytics } from '../../hooks/useAdminAnalytics';
import { useAdminCtx } from './AdminContext';

function formatVndFromString(decimalStr: string): string {
  const intPart = decimalStr.split('.')[0] || '0';
  const num = Number(intPart);
  if (!Number.isFinite(num)) return `${intPart} đ`;
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`;
}

export function DashboardView() {
  const { warehouseId, setWarehouseId } = useAdminCtx();
  const {
    isAdmin,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    summary,
    series,
    inventorySummary,
    loading,
    error,
    refresh,
  } = useDashboardAnalytics(warehouseId);

  const totalOrders = summary
    ? Object.values(summary.ordersByStatus).reduce((acc, c) => acc + c, 0)
    : 0;
  const deliveredCount = summary?.ordersByStatus.DELIVERED ?? 0;
  const completionRate = totalOrders > 0 ? Math.round((deliveredCount / totalOrders) * 100) : 0;

  const lowStockCount = inventorySummary
    ? inventorySummary.lowStockCount + inventorySummary.outOfStockCount
    : 0;
  const expiredReservations = summary?.expiredReservations ?? 0;

  const chartData = series.map((pt) => ({
    day: pt.date.slice(5), // MM-DD
    fullDate: pt.date,
    revenue: Math.round(Number(pt.revenue.split('.')[0] || '0')),
    orderCount: pt.orderCount,
  }));

  const warehouseList = inventorySummary?.byWarehouse ?? [];

  return (
    <div className="container-fluid p-0" style={{ maxWidth: '1100px' }}>
      {/* Tiêu đề & Bộ lọc ngày / kho */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <h1 className="h4 fw-bold mb-0 text-dark" style={{ letterSpacing: '-0.02em' }}>
          Dashboard
        </h1>

        <div className="d-flex flex-wrap align-items-center gap-2">
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            aria-label="Lọc theo kho"
            className="form-select form-select-sm"
            style={{ width: '180px', borderColor: '#ede9fe', borderRadius: '8px' }}
          >
            <option value="">Toàn bộ kho</option>
            {warehouseList.map((w) => (
              <option key={w.warehouseId} value={w.warehouseId}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>

          {isAdmin && (
            <>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="Từ ngày"
                className="form-control form-control-sm"
                style={{ width: '145px', borderColor: '#ede9fe', borderRadius: '8px' }}
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="Đến ngày"
                className="form-control form-control-sm"
                style={{ width: '145px', borderColor: '#ede9fe', borderRadius: '8px' }}
              />
            </>
          )}

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"
            style={{ borderRadius: '8px' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      {/* Trạng thái Lỗi (FR-DASH-01) */}
      {error && (
        <div role="alert" className="alert alert-danger d-flex align-items-center justify-content-between gap-2 small mb-3">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} className="btn btn-danger btn-sm">
            Tải lại
          </button>
        </div>
      )}

      {/* Trạng thái Loading */}
      {loading && !inventorySummary && !summary ? (
        <div className="p-5 text-center bg-white border rounded-3 small text-secondary mb-3">
          Đang tải số liệu tổng quan từ máy chủ...
        </div>
      ) : (
        <>
          {/* Hàng 1: KPIs (Doanh thu chỉ hiển thị cho ADMIN) */}
          {isAdmin && summary && (
            <RevealWrapper className="mb-3">
              <Row className="g-3">
                <Col xs={12} md={4}>
                  <Card className="admin-kpi-card p-3 h-100">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="text-secondary small fw-medium">
                        Doanh thu ({summary.revenue.orderCount} đơn hợp lệ)
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
                      {formatVndFromString(summary.revenue.total)}
                    </div>
                  </Card>
                </Col>

                <Col xs={12} md={4}>
                  <Card className="admin-kpi-card p-3 h-100">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="text-secondary small fw-medium">Tổng số đơn</span>
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
                    <div className="h3 fw-bold mb-0 text-dark">{totalOrders}</div>
                  </Card>
                </Col>

                <Col xs={12} md={4}>
                  <Card className="admin-kpi-card p-3 h-100">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="text-secondary small fw-medium">Tỉ lệ hoàn tất</span>
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
                    <div className="h3 fw-bold mb-0 text-dark">{completionRate}%</div>
                  </Card>
                </Col>
              </Row>
            </RevealWrapper>
          )}

          {/* Hàng 2: Thẻ Tồn kho & Cảnh báo */}
          <RevealWrapper className="mb-3">
            <Row className="g-3">
              <Col xs={12} sm={6} md={4}>
                <Link href="/admin/alerts" className="text-decoration-none">
                  <Card className="admin-kpi-card p-3 h-100">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span className="text-secondary small fw-medium">Cảnh báo tồn thấp / hết</span>
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
                      {lowStockCount}
                    </div>
                    <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
                      Xem danh sách cảnh báo →
                    </div>
                  </Card>
                </Link>
              </Col>

              {inventorySummary && (
                <>
                  <Col xs={12} sm={6} md={4}>
                    <Card className="admin-kpi-card p-3 h-100">
                      <div className="text-secondary small fw-medium mb-2">Tổng khả dụng toàn hệ thống</div>
                      <div className="h3 fw-bold mb-0 text-dark">
                        {inventorySummary.totalAvailable.toLocaleString('vi-VN')}
                      </div>
                      <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
                        Tồn vật lý: {inventorySummary.totalStock.toLocaleString('vi-VN')} · Giữ chỗ:{' '}
                        {inventorySummary.totalReserved.toLocaleString('vi-VN')}
                      </div>
                    </Card>
                  </Col>

                  {isAdmin && summary && (
                    <Col xs={12} sm={6} md={4}>
                      <Card className="admin-kpi-card p-3 h-100">
                        <div className="text-secondary small fw-medium mb-2">Giữ chỗ hết hạn</div>
                        <div className="h3 fw-bold mb-0 text-dark">{expiredReservations}</div>
                        <div className="text-muted small mt-1" style={{ fontSize: '0.75rem' }}>
                          Trong khoảng {summary.range.fromDate} → {summary.range.toDate}
                        </div>
                      </Card>
                    </Col>
                  )}
                </>
              )}
            </Row>
          </RevealWrapper>

          {/* Hàng 3: Biểu đồ Doanh thu (ADMIN only) */}
          {isAdmin && (
            <RevealWrapper className="mb-3">
              <Card className="admin-kpi-card p-3" data-testid="revenue-chart">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <span className="fw-bold small text-dark">
                    Doanh thu theo ngày ({fromDate} → {toDate})
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
                {chartData.length === 0 ? (
                  <div className="py-4 text-center small text-muted">
                    Không có dữ liệu doanh thu trong khoảng ngày đã chọn.
                  </div>
                ) : (
                  <div style={{ width: '100%', height: '200px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(val) => [
                            `${Number(val || 0).toLocaleString('vi-VN')} đ`,
                            'Doanh thu',
                          ]}
                          labelFormatter={(lbl) => `Ngày ${String(lbl)}`}
                          contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #ede9fe',
                            fontSize: '0.825rem',
                            boxShadow: '0 4px 16px rgba(124, 58, 237, 0.1)',
                          }}
                        />
                        <Bar dataKey="revenue" fill="#7c3aed" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </RevealWrapper>
          )}

          {/* Hàng 4: Hộp "Việc cần chú ý" */}
          <RevealWrapper className="mb-2">
            <div className="fw-bold mb-2 small text-dark d-flex align-items-center gap-1.5">
              <Info size={15} style={{ color: '#7c3aed' }} />
              <span>Việc cần chú ý</span>
            </div>
            <div
              className="admin-attention-card p-3 bg-white border rounded-3 small text-secondary"
              style={{ borderColor: '#ede9fe', lineHeight: '1.5' }}
            >
              {lowStockCount} mặt hàng đang hết hoặc dưới ngưỡng an toàn
              {isAdmin ? ` · ${expiredReservations} lượt giữ chỗ hết hạn trong kỳ` : ''}
            </div>
          </RevealWrapper>
        </>
      )}
    </div>
  );
}
