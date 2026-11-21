'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table, } from 'react-bootstrap';
import { ChevronLeft, ChevronRight, Eye, Mail, Pencil, RefreshCw, Search, UserMinus, UserPlus, Users, Warehouse } from 'lucide-react';
import { useAdminStaff } from '@/hooks/useAdminStaff';
import { StaffWarehousesDialog } from '@/components/admin/StaffWarehousesDialog';
import { AuthError } from '@/shared/lib/authApi';
import type { CreateStaffInput, ExistingCustomer, Staff, StaffStatus, StaffStatusFilter, UpdateStaffInput } from '@/shared/types/staff';

type Dialog =
  | { kind: 'create' }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; staff: Staff }
  | { kind: 'demote'; staff: Staff }
  | { kind: 'resend'; staff: Staff }
  | null;

interface StaffForm {
  fullName: string;
  email: string;
  phone: string;
}

const EMPTY_STAFF_FORM: StaffForm = { fullName: '', email: '', phone: '' };
const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/;

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

function errorMessage(cause: unknown, operation?: 'create' | 'resend' | 'role'): string {
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
    loadStaff, createStaff, updateStaff, changeStaffRole, resendStaffInvitation, } = useAdminStaff();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [assigning, setAssigning] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<StaffForm>({ ...EMPTY_STAFF_FORM });
  const [existingCustomer, setExistingCustomer] = useState<ExistingCustomer | null>(null);
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
    setExistingCustomer(null);
  }

  function closeDialog() {
    // Không đóng khi request ghi đang xử lý để người dùng biết kết quả cuối
    if (isBusy) return;
    setDialog(null);
    setFormError(null);
    setExistingCustomer(null);
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

  function openDemotion(staff: Staff) {
    resetDialogFeedback();
    setDialog({ kind: 'demote', staff });
  }

  function openResend(staff: Staff) {
    resetDialogFeedback();
    setDialog({ kind: 'resend', staff });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy || existingCustomer) return;
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
      const result = await createStaff(payload);
      if (result.kind === 'existing-customer') setExistingCustomer(result.customer);
      else closeAfterMutation();
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

  async function submitPromotion() {
    if (isBusy || dialog?.kind !== 'create' || !existingCustomer?.isActive) return;
    setFormError(null);
    try {
      await changeStaffRole(existingCustomer.id, 'WAREHOUSE_STAFF');
      closeAfterMutation();
    } catch (cause: unknown) {
      setFormError(errorMessage(cause, 'role'));
    }
  }

  async function submitDemotion() {
    if (isBusy || dialog?.kind !== 'demote') return;
    setFormError(null);
    try {
      await changeStaffRole(dialog.staff.id, 'CUSTOMER');
      closeAfterMutation();
    } catch (cause: unknown) {
      setFormError(errorMessage(cause, 'role'));
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
    setExistingCustomer(null);
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

      {notice && (
        <Alert
          variant={notice.type === 'success' ? 'success' : 'warning'}
          dismissible
          onClose={clearFeedback}
          role="status"
        >
          {notice.message}
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
                        <Button type="button" size="sm" variant="outline-primary"
                          title="Phân kho" aria-label={`Phân kho cho ${staff.fullName}`} disabled={isBusy}
                          onClick={() => setAssigning({ id: staff.id, name: staff.fullName })}>
                          <Warehouse size={15} aria-hidden="true" />
                        </Button>
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
                          variant="outline-danger"
                          title="Chuyển nhân viên xuống khách hàng"
                          aria-label={`Chuyển ${staff.fullName} xuống khách hàng`}
                          className="d-inline-flex align-items-center gap-1 text-nowrap"
                          disabled={isBusy}
                          onClick={() => openDemotion(staff)}
                        >
                          <UserMinus size={15} aria-hidden="true" />
                          <span className="d-none d-xl-inline">Chuyển xuống khách hàng</span>
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

      {assigning && <StaffWarehousesDialog key={assigning.id} {...assigning} onClose={() => setAssigning(null)} />}

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
            {dialog?.kind === 'demote' && 'Chuyển nhân viên xuống khách hàng'}
            {dialog?.kind === 'resend' && 'Gửi lại thư mời kích hoạt'}
          </Modal.Title>
        </Modal.Header>

        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <Form onSubmit={dialog.kind === 'create' ? submitCreate : submitEdit}>
            <Modal.Body>
              {formError && <Alert variant="danger" role="alert">{formError}</Alert>}
              {existingCustomer && (
                <Alert variant="warning" className="small" role="status">
                  <strong className="d-block mb-1">Email này đã thuộc về một khách hàng</strong>
                  <div className="text-break mb-2">{existingCustomer.fullName} · {existingCustomer.email}</div>
                  {existingCustomer.isActive
                    ? <>
                        <div>Bấm «Chuyển thành nhân viên» để thêm quyền nhân viên cho tài khoản này. Hồ sơ và các đơn hàng vẫn thuộc về cùng tài khoản.</div>
                        <div className="mt-2">{existingCustomer.emailVerifiedAt
                          ? 'Người này sẽ đăng nhập lại bằng mật khẩu hiện tại. Bạn có thể phân công kho sau khi chuyển.'
                          : 'Hệ thống sẽ gửi thư kích hoạt nhân viên mới tới Email này.'}</div>
                      </>
                    : 'Tài khoản đang bị khóa. Hãy kiểm tra hồ sơ khách hàng trước khi cấp quyền nhân viên.'}
                </Alert>
              )}
              <Form.Group controlId="staff-form-full-name" className="mb-3">
                <Form.Label>Họ và tên <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  value={form.fullName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
                  maxLength={150}
                  required
                  autoFocus
                  disabled={isBusy || !!existingCustomer}
                  placeholder="Lilith Litcht"
                />
              </Form.Group>
              <Form.Group controlId="staff-form-email" className="mb-3">
                <Form.Label>Email {dialog.kind === 'create' && <span className="text-danger">*</span>}</Form.Label>
                <Form.Control
                  type="email"
                  value={form.email}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setExistingCustomer(null);
                    setFormError(null);
                    setForm((previous) => ({ ...previous, email: event.target.value }));
                  }}
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
                  disabled={isBusy || !!existingCustomer}
                  placeholder="0912345678 hoặc +84912345678"
                />
                <Form.Text>
                  {dialog.kind === 'edit'
                    ? 'Để trống nếu muốn xóa số điện thoại hiện tại.'
                    : 'Để trống nếu chưa có số điện thoại.'}
                </Form.Text>
              </Form.Group>
              {dialog.kind === 'create' && !existingCustomer && (
                <Alert variant="info" className="mt-3 mb-0 small">
                  Hệ thống tự tạo Username và gửi Link thiết lập mật khẩu qua email.
                  Không nhập mật khẩu hoặc phân quyền tại màn hình này.
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline-secondary" disabled={isBusy} onClick={closeDialog}>Hủy</Button>
              {existingCustomer ? <Button type="button" variant="primary" disabled={isBusy || !existingCustomer.isActive} onClick={() => void submitPromotion()}>
                {isBusy && <Spinner animation="border" size="sm" className="me-2" />}
                Chuyển thành nhân viên
              </Button> : <Button type="submit" variant="primary" disabled={isBusy}>
                {isBusy && <Spinner animation="border" size="sm" className="me-2" />}
                {dialog.kind === 'create' ? 'Tạo nhân viên' : 'Lưu thay đổi'}
              </Button>}
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

        {dialog?.kind === 'demote' && dialogStaff && (
          <>
            <Modal.Body>
              <p>
                Sau khi chuyển, <strong>{dialogStaff.fullName}</strong> ({dialogStaff.username}) có thể tiếp tục mua sắm bằng tài khoản MultiMart hiện tại.
              </p>
              <Alert variant="warning" className="small mb-0">
                Hệ thống sẽ thu hồi quyền nhân viên, bỏ phân công kho và kết thúc các phiên đăng nhập.
                Đơn hàng và nhật ký kho vẫn được lưu.
                {!dialogStaff.isActive && ' Tài khoản đang khóa sẽ được mở lại với quyền khách hàng.'}
                {!dialogStaff.activatedAt && ' Người dùng sẽ nhận Email xác thực tài khoản khách hàng.'}
              </Alert>
              {formError && <Alert variant="danger" className="mt-3 mb-0" role="alert">{formError}</Alert>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" disabled={isBusy} onClick={closeDialog}>Hủy</Button>
              <Button
                variant="danger"
                disabled={isBusy}
                onClick={() => void submitDemotion()}
              >
                {isBusy && <Spinner animation="border" size="sm" className="me-2" />}
                Chuyển xuống khách hàng
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
