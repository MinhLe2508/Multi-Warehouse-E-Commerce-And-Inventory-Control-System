// Trạng thái tài khoản trả về từ StaffService
export type StaffStatus = 'LOCKED' | 'PENDING_ACTIVATION' | 'ACTIVE';

// Thông tin công khai của nhân viên kho. Không chứa token/mật khẩu
export interface Staff {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: StaffStatus;
  isActive: boolean;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phản hồi GET /admin/staff
export interface StaffListResponse {
  items: Staff[];
  total: number;
  limit: number;
  offset: number;
}

// Dữ liệu lọc ở UI. ALL nghĩa là KHÔNG gửi status lên API.
export type StaffStatusFilter = StaffStatus | 'ALL';

// Query hợp lệ của GET /admin/staff
export interface StaffListQuery {
  search?: string;
  status?: StaffStatus;
  limit?: number;
  offset?: number;
}

// POST /admin/staff. Mật khẩu và vai trò không được gửi từ Frontend
export interface CreateStaffInput {
  email: string;
  fullName: string;
  phone?: string;
}

// PATCH /admin/staff/:id. phone=null để xóa số điện thoại
export interface UpdateStaffInput {
  fullName?: string;
  phone?: string | null;
}

// PATCH /admin/staff/:id/status
export interface UpdateStaffStatusInput {
  isActive: boolean;
  reason?: string;
}

// POST /admin/staff: tài khoản có thể đã tạo dù gửi email thất bại
export interface CreateStaffResponse {
  staff: Staff;
  invitationSent: boolean;
  message: string;
}

// POST /admin/staff/:id/resend-invitation
export interface ResendStaffInvitationResponse {
  invitationSent: true;
  message: string;
}
