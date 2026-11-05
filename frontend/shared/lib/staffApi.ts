import { authenticatedRequest } from '@/store/useAuthStore';
import type {
  CreateStaffInput,
  CreateStaffResponse,
  ResendStaffInvitationResponse,
  Staff,
  StaffListQuery,
  StaffListResponse,
  StaffStatusFilter,
  UpdateStaffInput,
  UpdateStaffStatusInput,
} from '@/shared/types/staff';

const STAFF_ENDPOINT = '/admin/staff';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_STATUSES = ['LOCKED', 'PENDING_ACTIVATION', 'ACTIVE'] as const;
const MAX_SEARCH_LENGTH = 100;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

// Cho phép chọn ALL ở UI nhưng không đưa ALL vào query của Backend
export interface StaffListOptions extends Omit<StaffListQuery, 'status'> {
  status?: StaffStatusFilter;
}

function staffUrl(id: string): string {
  if (typeof id !== 'string' || !UUID_V4.test(id)) {
    throw new TypeError('ID nhân viên không đúng định dạng UUID v4.');
  }
  return `${STAFF_ENDPOINT}/${encodeURIComponent(id)}`;
}

function buildListQuery(options: StaffListOptions): string {
  const params = new URLSearchParams();

  if (options.search !== undefined) {
    const search = options.search.trim();
    if (search.length > MAX_SEARCH_LENGTH) {
      throw new RangeError(`Từ khóa tìm kiếm không được vượt quá ${MAX_SEARCH_LENGTH} ký tự.`);
    }
    if (search) params.set('search', search);
  }

  if (options.status !== undefined && options.status !== 'ALL') {
    if (!STAFF_STATUSES.some((status) => status === options.status)) {
      throw new TypeError('Trạng thái lọc nhân viên không hợp lệ.');
    }
    params.set('status', options.status);
  }

  if (options.limit !== undefined) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > MAX_LIMIT) {
      throw new RangeError(`Limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`);
    }
    params.set('limit', String(options.limit));
  }

  if (options.offset !== undefined) {
    if (!Number.isSafeInteger(options.offset) || options.offset < 0 || options.offset > MAX_OFFSET) {
      throw new RangeError(`Offset phải là số nguyên từ 0 đến ${MAX_OFFSET}.`);
    }
    params.set('offset', String(options.offset));
  }

  const query = params.toString();
  return query ? `${STAFF_ENDPOINT}?${query}` : STAFF_ENDPOINT;
}

// GET /admin/staff — danh sách, tìm kiếm, lọc và phân trang.
export function listStaff(options: StaffListOptions = {}): Promise<StaffListResponse> {
  return authenticatedRequest<StaffListResponse>(buildListQuery(options), undefined, 'GET');
}

// GET /admin/staff/:id — xem chi tiết một nhân viên kho
export function getStaff(id: string): Promise<Staff> {
  return authenticatedRequest<Staff>(staffUrl(id), undefined, 'GET');
}

/**
 * POST /admin/staff — tạo nhân viên, phát hành token mời, gửi Gmail.
 * Chỉ gửi email/fullName/phone; username và vai trò được Backend tự xử lý.
 * Nếu invitationSent=false, tài khoản ĐÃ được tạo: chỉ dùng gửi lại lời mời.
 */
export function createStaff(input: CreateStaffInput): Promise<CreateStaffResponse> {
  const phone = input.phone?.trim();
  const payload: CreateStaffInput = {
    email: input.email.trim().toLowerCase(),
    fullName: input.fullName.trim(),
    ...(phone ? { phone } : {}),
  };
  return authenticatedRequest<CreateStaffResponse>(STAFF_ENDPOINT, payload, 'POST');
}

export function updateStaff(id: string, input: UpdateStaffInput): Promise<Staff> {
  const url = staffUrl(id);
  if (input.fullName === undefined && input.phone === undefined) {
    throw new TypeError('Cần cung cấp họ tên hoặc SĐT để cập nhật nhân viên.');
  }

  const payload: UpdateStaffInput = {};
  if (input.fullName !== undefined) payload.fullName = input.fullName.trim();
  if (input.phone !== undefined) {
    payload.phone = input.phone === null ? null : input.phone.trim() || null;
  }
  return authenticatedRequest<Staff>(url, payload, 'PATCH');
}


export function setStaffStatus(
  id: string,
  input: UpdateStaffStatusInput,
): Promise<Staff> {
  const url = `${staffUrl(id)}/status`;
  if (typeof input.isActive !== 'boolean') {
    throw new TypeError('isActive phải là Boolean True hoặc False.');
  }
  const reason = input.reason?.trim();
  const payload: UpdateStaffStatusInput = {
    isActive: input.isActive,
    ...(reason ? { reason } : {}),
  };
  return authenticatedRequest<Staff>(url, payload, 'PATCH');
}


export function resendStaffInvitation(id: string): Promise<ResendStaffInvitationResponse> {
  return authenticatedRequest<ResendStaffInvitationResponse>(
    `${staffUrl(id)}/resend-invitation`,
    undefined,
    'POST',
  );
}

// Cú pháp gọn cho UI/hook: staffApi.list(), staffApi.create()...
export const staffApi = {
  list: listStaff,
  get: getStaff,
  create: createStaff,
  update: updateStaff,
  setStatus: setStaffStatus,
  resendInvitation: resendStaffInvitation,
} as const;
