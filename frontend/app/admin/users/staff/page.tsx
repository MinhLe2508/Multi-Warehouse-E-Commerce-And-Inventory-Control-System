'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table, } from 'react-bootstrap';
import { ChevronLeft, ChevronRight, Eye, LockKeyhole, Mail, Pencil, RefreshCw, Search, UnlockKeyhole, UserPlus, Users, } from 'lucide-react';
import { useAdminStaff } from '@/hooks/useAdminStaff';
import { AuthError } from '@/shared/lib/authApi';
import type { CreateStaffInput, Staff, StaffStatus, StaffStatusFilter, UpdateStaffInput, } from '@/shared/types/staff';

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; staff: Staff }
  | { kind: 'status'; staff: Staff }
  | { kind: 'resend'; staff: Staff }
  | null;

interface StaffForm {
  fullName: string;
  email: string;
  phone: string;
}

const EMPTY_STAFF_FORM: StaffForm = { fullName: '', email: '', phone: '' };
const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/;
const MAX_STATUS_REASON = 500;

const STATUS_TEXT: Record<StaffStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  PENDING_ACTIVATION: 'Chờ kích hoạt',
  LOCKED: 'Đã khóa',
};

const STATUS_BADGE: Record<StaffStatus, string> = {
  ACTIVE: 'success',
  PENDING_ACTIVATION: 'warning',
  LOCKED: 'secondary',
};

function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return (
    <Badge bg={STATUS_BADGE[status]} text={status === 'PENDING_ACTIVATION' ? 'dark' : undefined}>
      {STATUS_TEXT[status]}
    </Badge>
  );
}

function formatDate(date: string | null): string {
  if (!date) return 'Chưa có';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Không có dữ liệu';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function errorMessage(cause: unknown, operation?: 'create' | 'resend'): string {
  const basic = cause instanceof Error
    ? cause.message
    : 'Không thực hiện được thao tác. Vui lòng thử lại.';
  // Khi chưa có phản hồi hoặc máy chủ báo lỗi, nghiệp vụ gửi mail có thể đã được thực hiện. Không gợi ý người dùng tự gửi lại ngay.
  if (operation && cause instanceof AuthError &&
      (cause.status === 0 || cause.status >= 500)) {
    return `${basic} Yêu cầu có thể đã được xử lý. Hãy kiểm tra danh sách và email trước khi thử lại.`;
  }
  return basic;
}

// Kiểm tra các trường form ở Frontend; Backend vẫn kiểm tra bằng DTO
function validateStaffForm(form: StaffForm, isCreate: boolean): string | null {
  const fullName = form.fullName.trim();
  const phone = form.phone.trim();
  if (!fullName) return 'Vui lòng nhập họ và tên nhân viên.';
  if (fullName.length > 150) return 'Họ và tên không được vượt quá 150 ký tự.';
  if (isCreate) {
    const email = form.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return 'Vui lòng nhập địa chỉ email hợp lệ.';
    }
  }
  if (phone && !PHONE_PATTERN.test(phone)) {
    return 'Số điện thoại phải có dạng 0xxxxxxxxx hoặc +84xxxxxxxxx.';
  }
  return null;
}

export default function AdminStaffPage() {
  const { items, total, page, pageSize, totalPages, search, statusFilter, loading, error, notice, mutation, selectedStaff, 
    detailLoading, detailError, canManage, setSearch, setStatusFilter, setPage, setPageSize, refresh, clearFeedback, clearSelectedStaff,
    loadStaff, createStaff, updateStaff, setStaffStatus, resendStaffInvitation, } = useAdminStaff();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [form, setForm] = useState<StaffForm>({ ...EMPTY_STAFF_FORM });
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = mutation !== null;
  const dialogStaff = dialog && 'staff' in dialog ? dialog.staff : null;
  const detailStaff =
    dialog?.kind === 'detail' && selectedStaff?.id === dialog.id
      ? selectedStaff
      : null;

  function resetDialogFeedback() {
    clearFeedback();
    setFormError(null);
    setReason('');
  }

  function closeDialog() {
    // Không đóng khi request ghi đang xử lý để người dùng biết kết quả cuối
    if (isBusy) return;
    setDialog(null);
    setFormError(null);
    clearSelectedStaff();
  }

  function openCreate() {
    resetDialogFeedback();
    setForm({ ...EMPTY_STAFF_FORM });
    setDialog({ kind: 'create' });
  }

  function openDetail(staff: Staff) {
    resetDialogFeedback();
    clearSelectedStaff();
    setDialog({ kind: 'detail', id: staff.id });
    void loadStaff(staff.id).catch(() => undefined);
  }

  function openEdit(staff: Staff) {
    resetDialogFeedback();
    setForm({
      fullName: staff.fullName,
      email: staff.email, // Chỉ hiển thị, không gửi email lên PATCH
      phone: staff.phone ?? '',
    });
    setDialog({ kind: 'edit', staff });
  }

  function openStatus(staff: Staff) {
    resetDialogFeedback();
    setDialog({ kind: 'status', staff });
  }

  function openResend(staff: Staff) {
    resetDialogFeedback();
    setDialog({ kind: 'resend', staff });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;
    const issue = validateStaffForm(form, true);
    if (issue) { setFormError(issue); return; }

    const phone = form.phone.trim();
    const payload: CreateStaffInput = {
      email: form.email.trim().toLowerCase(),
      fullName: form.fullName.trim(),
      ...(phone ? { phone } : {}),
    };

    setFormError(null);
    try {
      // Kể cả invitationSent=false, tài khoản vẫn đã được tạo.
      // Hook sẽ hiển thị cảnh báo và làm mới danh sách; không thử tạo lại.
      await createStaff(payload);
      closeAfterMutation();
    } catch (cause: unknown) {
      setFormError(errorMessage(cause, 'create'));
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || dialog?.kind !== 'edit') return;
    const issue = validateStaffForm(form, false);
    if (issue) { setFormError(issue); return; }

    const original = dialog.staff;
    const fullName = form.fullName.trim();
    const phone = form.phone.trim();
    const payload: UpdateStaffInput = {};

    // Chỉ gửi các trường đã thay đổi để không ghi đè thông tin không cần thiết.
    if (fullName !== original.fullName) payload.fullName = fullName;
    if (phone !== (original.phone ?? '')) payload.phone = phone || null;
    if (Object.keys(payload).length === 0) {
      setFormError('Bạn chưa thay đổi thông tin nào.');
      return;
    }

    setFormError(null);
    try {
      await updateStaff(original.id, payload);
      closeAfterMutation();
    } catch (cause: unknown) {
      setFormError(errorMessage(cause));
    }
  }

  async function submitStatus() {
    if (isBusy || dialog?.kind !== 'status') return;
    const nextIsActive = !dialog.staff.isActive;
    if (reason.trim().length > MAX_STATUS_REASON) {
      setFormError(`Lý do không được vượt quá ${MAX_STATUS_REASON} ký tự.`);
      return;
    }
    setFormError(null);
    try {
      await setStaffStatus(dialog.staff.id, {
        isActive: nextIsActive,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      closeAfterMutation();
    } catch (cause: unknown) {
      setFormError(errorMessage(cause));
    }
  }

  async function submitResend() {
    if (isBusy || dialog?.kind !== 'resend') return;
    setFormError(null);
    try {
      await resendStaffInvitation(dialog.staff.id);
      closeAfterMutation();
    } catch (cause: unknown) {
      // Không tự retry POST: email có thể đã được gửi trước khi timeout.
      setFormError(errorMessage(cause, 'resend'));
    }
  }

  function closeAfterMutation() {
    // Không dùng closeDialog() vì render hiện tại vẫn giữ isBusy=true.
    // Hook đã cập nhật notice/error và sẽ làm mới danh sách.
    setDialog(null);
    setFormError(null);
    clearSelectedStaff();
  }

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = total === 0 ? 0 : Math.min(page * pageSize, total);

  // Quyền hiển thị trên Frontend; JWT/RolesGuard ở Backend vẫn là lớp bảo vệ thật.
  if (!canManage) {
    return (
      <div className="container-fluid py-4">
        <Alert variant="warning" role="alert">
          Bạn cần đăng nhập bằng tài khoản Quản trị viên để xem và quản lý nhân viên kho.
        </Alert>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 px-2 px-md-4">
      {/* HEADER: không bọc thêm AdminShell vì layout admin đã có sẵn. */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-2 text-primary">
            <Users size={19} aria-hidden="true" />
            <span className="small fw-semibold text-uppercase">Tài khoản &amp; nhân sự</span>
          </div>
          <h1 className="h3 fw-bold mb-1">Quản lý nhân viên kho</h1>
          <p className="text-secondary small mb-0">
            Tạo tài khoản, theo dõi kích hoạt, cập nhật thông tin và kiểm soát quyền truy cập.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-secondary" disabled={loading || isBusy} onClick={refresh}>
            <RefreshCw size={16} className="me-2" aria-hidden="true" />
            Làm mới
          </Button>
          <Button variant="primary" disabled={isBusy} onClick={openCreate}>
            <UserPlus size={16} className="me-2" aria-hidden="true" />
            Thêm nhân viên
          </Button>
        </div>
      </div>

      {/* THÔNG BÁO: 503/timeout có thể xảy ra sau khi Staff đã được tạo. */}
      {notice && (
        <Alert
          variant={notice.type === 'success' ? 'success' : 'warning'}
          dismissible
          onClose={clearFeedback}
          role="status"
        >
          {notice.message}
          {notice.type === 'warning' && (
            <div className="small mt-1">
              Tài khoản có thể đã được tạo. Hãy kiểm tra danh sách trước khi gửi lại thư mời.
            </div>
          )}
        </Alert>
      )}
      {error && (
        <Alert variant="danger" dismissible onClose={clearFeedback} role="alert">
          {error}
        </Alert>
      )}

      <Card className="border-0 shadow-sm rounded-4 mb-3">
        <Card.Body className="p-3 p-md-4">
          <div className="d-flex flex-wrap gap-3 align-items-center justify-content-between mb-3">
            <div>
              <div className="text-secondary small">Nhân viên phù hợp bộ lọc</div>
              <div className="h4 fw-bold mb-0">{total.toLocaleString('vi-VN')}</div>
            </div>
            <div className="text-secondary small">
              Hiển thị <strong>{startIndex}–{endIndex}</strong> trong {total.toLocaleString('vi-VN')} kết quả
            </div>
          </div>
          <div className="row g-3 align-items-end">
            <div className="col-12 col-lg-6">
              <Form.Group controlId="staff-search">
                <Form.Label className="small fw-semibold">Tìm kiếm nhân viên</Form.Label>
                <div className="position-relative">
                  <Search
                    size={17}
                    className="position-absolute text-secondary"
                    style={{ left: 12, top: 12, pointerEvents: 'none' }}
                    aria-hidden="true"
                  />
                  <Form.Control
                    type="search"
                    value={search}
                    maxLength={100}
                    autoComplete="off"
                    placeholder="Họ tên, email, username hoặc số điện thoại"
                    style={{ paddingLeft: 38 }}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  />
                </div>
              </Form.Group>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <Form.Group controlId="staff-status-filter">
                <Form.Label className="small fw-semibold">Trạng thái</Form.Label>
                <Form.Select
                  value={statusFilter}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatusFilter(event.target.value as StaffStatusFilter)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="PENDING_ACTIVATION">Chờ kích hoạt</option>
                  <option value="LOCKED">Đã khóa</option>
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-12 col-sm-6 col-lg-3">
              <Form.Group controlId="staff-page-size">
                <Form.Label className="small fw-semibold">Số dòng mỗi trang</Form.Label>
                <Form.Select
                  value={pageSize}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setPageSize(Number(event.target.value))}
                >
                  <option value={10}>10 dòng</option>
                  <option value={20}>20 dòng</option>
                  <option value={50}>50 dòng</option>
                  <option value={100}>100 dòng</option>
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <Form.Text className="d-block mt-2">
            Tìm kiếm tự động sau khi ngừng nhập khoảng 350 ms.
          </Form.Text>
        </Card.Body>
      </Card>

      {/* DANH SÁCH: chỉ render dữ liệu lấy từ API thật. */}
      <Card className="border-0 shadow-sm rounded-4">
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="align-middle mb-0" aria-label="Danh sách nhân viên kho">
              <thead className="table-light">
                <tr>
                  <th scope="col" className="ps-3 ps-md-4">Nhân viên</th>
                  <th scope="col">Tài khoản</th>
                  <th scope="col">Số điện thoại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Ngày tạo</th>
                  <th scope="col" className="text-end pe-3 pe-md-4">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-5 text-center text-secondary">
                      <Spinner animation="border" size="sm" className="me-2" role="status" />
                      Đang tải danh sách nhân viên...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-5 text-center text-secondary">
                      {error ? 'Không tải được danh sách. Hãy kiểm tra kết nối rồi thử lại.' :
                        'Chưa có nhân viên nào phù hợp với bộ lọc.'}
                    </td>
                  </tr>
                ) : items.map((staff) => (
                  <tr key={staff.id}>
                    <td className="ps-3 ps-md-4">
                      <div className="fw-semibold text-dark">{staff.fullName}</div>
                      <div className="small text-secondary">{staff.email}</div>
                    </td>
                    <td className="small">{staff.username}</td>
                    <td className="small">{staff.phone || '—'}</td>
                    <td><StaffStatusBadge status={staff.status} /></td>
                    <td className="small text-secondary text-nowrap">{formatDate(staff.createdAt)}</td>
                    <td className="text-end pe-3 pe-md-4">
                      <div className="d-inline-flex flex-wrap justify-content-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline-secondary"
                          title={`Xem chi tiết ${staff.fullName}`}
                          aria-label={`Xem chi tiết ${staff.fullName}`}
                          disabled={isBusy}
                          onClick={() => openDetail(staff)}
                        >
                          <Eye size={15} aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline-primary"
                          title={`Sửa ${staff.fullName}`}
                          aria-label={`Sửa ${staff.fullName}`}
                          disabled={isBusy}
                          onClick={() => openEdit(staff)}
                        >
                          <Pencil size={15} aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={staff.isActive ? 'outline-danger' : 'outline-success'}
                          title={staff.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                          aria-label={`${staff.isActive ? 'Khóa' : 'Mở khóa'} ${staff.fullName}`}
                          disabled={isBusy}
                          onClick={() => openStatus(staff)}
                        >
                          {staff.isActive ? <LockKeyhole size={15} aria-hidden="true" /> :
                            <UnlockKeyhole size={15} aria-hidden="true" />}
                        </Button>
                        {staff.status === 'PENDING_ACTIVATION' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline-warning"
                            title="Gửi lại thư mời kích hoạt"
                            aria-label={`Gửi lại thư mời cho ${staff.fullName}`}
                            disabled={isBusy}
                            onClick={() => openResend(staff)}
                          >
                            <Mail size={15} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card.Body>
        <Card.Footer className="d-flex flex-wrap gap-2 align-items-center justify-content-between bg-white border-top rounded-bottom-4 px-3 px-md-4 py-3">
          <span className="text-secondary small">
            Trang <strong>{page}</strong> / {totalPages}
          </span>
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={loading || isBusy || page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={15} className="me-1" aria-hidden="true" />
              Trước
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={loading || isBusy || page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Sau
              <ChevronRight size={15} className="ms-1" aria-hidden="true" />
            </Button>
          </div>
        </Card.Footer>
      </Card>

      {/* MODAL DÙNG CHUNG: Create / Detail / Edit / Status / Resend. */}
      <Modal
        show={dialog !== null}
        onHide={closeDialog}
        backdrop="static"
        keyboard={!isBusy}
        centered
        size={dialog?.kind === 'detail' ? 'lg' : undefined}
        aria-labelledby="staff-dialog-title"
      >
        <Modal.Header closeButton={!isBusy}>
          <Modal.Title id="staff-dialog-title" className="h5">
            {dialog?.kind === 'create' && 'Thêm nhân viên kho'}
            {dialog?.kind === 'detail' && 'Chi tiết nhân viên'}
            {dialog?.kind === 'edit' && 'Chỉnh sửa nhân viên'}
            {dialog?.kind === 'status' && (dialog.staff.isActive ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản')}
            {dialog?.kind === 'resend' && 'Gửi lại thư mời kích hoạt'}
          </Modal.Title>
        </Modal.Header>

        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <Form onSubmit={dialog.kind === 'create' ? submitCreate : submitEdit}>
            <Modal.Body>
              {formError && <Alert variant="danger" role="alert">{formError}</Alert>}
              <Form.Group controlId="staff-form-full-name" className="mb-3">
                <Form.Label>Họ và tên <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  value={form.fullName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
                  maxLength={150}
                  required
                  autoFocus
                  disabled={isBusy}
                  placeholder="Lilith Litcht"
                />
              </Form.Group>
              <Form.Group controlId="staff-form-email" className="mb-3">
                <Form.Label>Email {dialog.kind === 'create' && <span className="text-danger">*</span>}</Form.Label>
                <Form.Control
                  type="email"
                  value={form.email}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, email: event.target.value }))}
                  maxLength={254}
                  required={dialog.kind === 'create'}
                  disabled={dialog.kind !== 'create' || isBusy}
                  autoComplete="off"
                  placeholder="staff@gmail.com"
                />
                {dialog.kind === 'edit' && <Form.Text>Email không thể thay đổi qua chức năng này.</Form.Text>}
              </Form.Group>
              <Form.Group controlId="staff-form-phone">
                <Form.Label>Số điện thoại (không bắt buộc)</Form.Label>
                <Form.Control
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
                  maxLength={20}
                  disabled={isBusy}
                  placeholder="0912345678 hoặc +84912345678"
                />
                <Form.Text>
                  {dialog.kind === 'edit'
                    ? 'Để trống nếu muốn xóa số điện thoại hiện tại.'
                    : 'Để trống nếu chưa có số điện thoại.'}
                </Form.Text>
              </Form.Group>
              {dialog.kind === 'create' && (
                <Alert variant="info" className="mt-3 mb-0 small">
                  Hệ thống tự tạo Username và gửi Link thiết lập mật khẩu qua email.
                  Không nhập mật khẩu hoặc phân quyền tại màn hình này.
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline-secondary" disabled={isBusy} onClick={closeDialog}>Hủy</Button>
              <Button type="submit" variant="primary" disabled={isBusy}>
                {isBusy && <Spinner animation="border" size="sm" className="me-2" />}
                {dialog.kind === 'create' ? 'Tạo nhân viên' : 'Lưu thay đổi'}
              </Button>
            </Modal.Footer>
          </Form>
        )}

        {dialog?.kind === 'detail' && (
          <>
            <Modal.Body>
              {detailLoading && (
                <div className="text-center py-4 text-secondary">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Đang tải chi tiết nhân viên...
                </div>
              )}
              {detailError && <Alert variant="danger" role="alert">{detailError}</Alert>}
              {!detailLoading && detailStaff && (
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Họ và tên</div>
                    <div className="fw-semibold">{detailStaff.fullName}</div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Trạng thái</div>
                    <StaffStatusBadge status={detailStaff.status} />
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Username</div>
                    <div>{detailStaff.username}</div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Email</div>
                    <div className="text-break">{detailStaff.email}</div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Số điện thoại</div>
                    <div>{detailStaff.phone || 'Chưa cung cấp'}</div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Ngày kích hoạt</div>
                    <div>{formatDate(detailStaff.activatedAt)}</div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Ngày tạo</div>
                    <div>{formatDate(detailStaff.createdAt)}</div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="small text-secondary">Cập nhật lần cuối</div>
                    <div>{formatDate(detailStaff.updatedAt)}</div>
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              {detailStaff && (
                <Button variant="primary" onClick={() => openEdit(detailStaff)}>
                  <Pencil size={15} className="me-2" aria-hidden="true" />
                  Chỉnh sửa
                </Button>
              )}
              <Button variant="outline-secondary" onClick={closeDialog}>Đóng</Button>
            </Modal.Footer>
          </>
        )}

        {dialog?.kind === 'status' && dialogStaff && (
          <>
            <Modal.Body>
              <p>
                Bạn có chắc muốn <strong>{dialogStaff.isActive ? 'khóa' : 'mở khóa'}</strong> tài khoản
                {' '}<strong>{dialogStaff.fullName}</strong> ({dialogStaff.username})?
              </p>
              {dialogStaff.isActive ? (
                <Alert variant="warning" className="small">
                  Khóa tài khoản sẽ chặn đăng nhập, vô hiệu hóa refresh token và link kích hoạt chưa dùng.
                </Alert>
              ) : (
                <Alert variant="info" className="small">
                  Mở khóa không tự động kích hoạt tài khoản hoặc gửi thư mời mới.
                  Nếu nhân viên vẫn chưa kích hoạt, hãy gửi lại thư mời sau khi mở khóa.
                </Alert>
              )}
              <Form.Group controlId="staff-status-reason">
                <Form.Label>Lý do (không bắt buộc)</Form.Label>
                <Form.Control
                  type="text"
                  value={reason}
                  maxLength={MAX_STATUS_REASON}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setReason(event.target.value)}
                  disabled={isBusy}
                  placeholder="Ví dụ: Thay đổi nhân sự"
                />
              </Form.Group>
              {formError && <Alert variant="danger" className="mt-3 mb-0" role="alert">{formError}</Alert>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" disabled={isBusy} onClick={closeDialog}>Hủy</Button>
              <Button
                variant={dialogStaff.isActive ? 'danger' : 'success'}
                disabled={isBusy}
                onClick={() => void submitStatus()}
              >
                {isBusy && <Spinner animation="border" size="sm" className="me-2" />}
                {dialogStaff.isActive ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
              </Button>
            </Modal.Footer>
          </>
        )}

        {dialog?.kind === 'resend' && dialogStaff && (
          <>
            <Modal.Body>
              <p className="mb-2">
                Gửi thư mời kích hoạt mới cho <strong>{dialogStaff.fullName}</strong>?
              </p>
              <p className="text-secondary small mb-0">
                Email nhận: <strong className="text-break">{dialogStaff.email}</strong>.
                Liên kết mời cũ sẽ không còn hiệu lực sau khi Token mới được tạo.
              </p>
              <Alert variant="warning" className="small mt-3 mb-0">
                Nếu gửi Email bị Timeout, không bấm gửi lặp ngay. Hãy kiểm tra trạng thái và Email trước.
              </Alert>
              {formError && <Alert variant="danger" className="mt-3 mb-0" role="alert">{formError}</Alert>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" disabled={isBusy} onClick={closeDialog}>Hủy</Button>
              <Button variant="primary" disabled={isBusy} onClick={() => void submitResend()}>
                {isBusy && <Spinner animation="border" size="sm" className="me-2" />}
                Gửi lại thư mời
              </Button>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </div>
  );
}
