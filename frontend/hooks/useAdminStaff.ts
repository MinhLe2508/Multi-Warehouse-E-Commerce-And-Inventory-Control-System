'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthError } from '@/shared/lib/authApi';
import { staffApi } from '@/shared/lib/staffApi';
import { useAuthStore } from '@/store/useAuthStore';
import type {
  CreateStaffInput,
  CreateStaffResponse,
  ResendStaffInvitationResponse,
  Staff,
  StaffStatusFilter,
  UpdateStaffInput,
  UpdateStaffStatusInput,
} from '@/shared/types/staff';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 100_000;
const MAX_SEARCH_LENGTH = 100;
const SEARCH_DEBOUNCE_MS = 350;

type StaffMutation = 'create' | 'update' | 'status' | 'resend';

// Kết quả luôn gắn với đúng bộ lọc và danh tính Admin đã yêu cầu.
// Khi đổi bộ lọc/tài khoản, dữ liệu cũ tự ẩn ngay trong render,
// không cần setState đồng bộ trong useEffect.
interface StaffListSnapshot {
  key: string;
  items: Staff[];
  total: number;
  error: string | null;
}

const EMPTY_STAFF: Staff[] = [];

export interface StaffNotice {
  type: 'success' | 'warning';
  message: string;
}

export interface UseAdminStaffResult {
  items: Staff[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  statusFilter: StaffStatusFilter;
  loading: boolean;
  error: string | null;
  notice: StaffNotice | null;
  mutation: StaffMutation | null;
  selectedStaff: Staff | null;
  detailLoading: boolean;
  detailError: string | null;
  canManage: boolean;

  setSearch: (value: string) => void;
  setStatusFilter: (value: StaffStatusFilter) => void;
  setPage: (value: number) => void;
  setPageSize: (value: number) => void;

  refresh: () => void;
  clearFeedback: () => void;
  clearSelectedStaff: () => void;

  loadStaff: (id: string) => Promise<Staff>;

  createStaff: (
    input: CreateStaffInput,
  ) => Promise<CreateStaffResponse>;

  updateStaff: (
    id: string,
    input: UpdateStaffInput,
  ) => Promise<Staff>;

  setStaffStatus: (
    id: string,
    input: UpdateStaffStatusInput,
  ) => Promise<Staff>;

  resendStaffInvitation: (
    id: string,
  ) => Promise<ResendStaffInvitationResponse>;
}

// =============================================================================
// HELPER: CHUYỂN LỖI API THÀNH THÔNG BÁO CHO NGƯỜI DÙNG
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.status === 401) {
      return 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.';
    }

    if (error.status === 403) {
      return 'Tài khoản hiện tại không có quyền quản lý nhân viên.';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Không thực hiện được yêu cầu. Vui lòng thử lại.';
}

// =============================================================================
// HOOK CHÍNH: QUẢN LÝ STAFF
// =============================================================================

export function useAdminStaff(): UseAdminStaffResult {
  // ---------------------------------------------------------------------------
  // 1. LẤY PHIÊN ĐĂNG NHẬP TỪ ZUSTAND
  // ---------------------------------------------------------------------------

  const ready = useAuthStore((state) => state.ready);

  const userId = useAuthStore(
    (state) => state.session?.user.id ?? null,
  );

  const role = useAuthStore(
    (state) => state.session?.user.role ?? null,
  );

  const canManage =
    ready &&
    Boolean(userId) &&
    role === 'ADMIN';

  // ---------------------------------------------------------------------------
  // 2. STATE DANH SÁCH, BỘ LỌC VÀ PHÂN TRANG
  // ---------------------------------------------------------------------------

  const [listSnapshot, setListSnapshot] =
    useState<StaffListSnapshot | null>(null);

  const [page, setCurrentPage] = useState(1);

  const [pageSize, setCurrentPageSize] =
    useState(DEFAULT_PAGE_SIZE);

  const [search, setSearchInput] = useState('');

  const [debouncedSearch, setDebouncedSearch] =
    useState('');

  const [statusFilter, setCurrentStatusFilter] =
    useState<StaffStatusFilter>('ALL');

  // ---------------------------------------------------------------------------
  // 3. STATE THÔNG BÁO VÀ THAO TÁC
  // ---------------------------------------------------------------------------

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [notice, setNotice] =
    useState<StaffNotice | null>(null);

  const [mutation, setMutation] =
    useState<StaffMutation | null>(null);

  // ---------------------------------------------------------------------------
  // 4. STATE CHI TIẾT NHÂN VIÊN
  // ---------------------------------------------------------------------------

  const [selectedStaff, setSelectedStaff] =
    useState<Staff | null>(null);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailError, setDetailError] =
    useState<string | null>(null);

  const [reloadVersion, setReloadVersion] =
    useState(0);

  // ---------------------------------------------------------------------------
  // 5. REF KIỂM SOÁT REQUEST BẤT ĐỒNG BỘ
  // ---------------------------------------------------------------------------

  const mountedRef = useRef(false);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const mutationLockedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // 6. TÍNH TOÁN DỮ LIỆU HIỂN THỊ
  //
  // Thay vì setItems(), setTotal(), setLoading() trực tiếp trong useEffect,
  // ta xác định dữ liệu nào được phép hiển thị từ listSnapshot.
  //
  // queryKey bao gồm danh tính Admin, bộ lọc và phiên bản tải lại.
  // Vì vậy kết quả của truy vấn cũ sẽ không hiển thị ở truy vấn mới.
  // ---------------------------------------------------------------------------

  const queryKey = JSON.stringify([
    userId,
    debouncedSearch,
    statusFilter,
    page,
    pageSize,
    reloadVersion,
  ]);

  const waitingForSearch =
    search.trim() !== debouncedSearch;

  const visibleList =
    canManage &&
    !waitingForSearch &&
    listSnapshot?.key === queryKey
      ? listSnapshot
      : null;

  const items = visibleList?.items ?? EMPTY_STAFF;

  const total = visibleList?.total ?? 0;

  const listError = visibleList?.error ?? null;

  const loading = canManage && visibleList === null;

  const maxPageAllowed =
    Math.floor(MAX_OFFSET / pageSize) + 1;

  const totalPages = Math.max(
    1,
    Math.min(
      Math.ceil(total / pageSize),
      maxPageAllowed,
    ),
  );

  const error = actionError ?? listError;

  // ---------------------------------------------------------------------------
  // 7. THEO DÕI COMPONENT MOUNT / UNMOUNT
  //
  // Không cho response bất đồng bộ cập nhật state sau khi component unmount.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      listRequestRef.current += 1;
      detailRequestRef.current += 1;
      mutationRequestRef.current += 1;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 8. DEBOUNCE TÌM KIẾM
  //
  // Chờ 350ms sau lần nhập cuối mới gọi API.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  // ---------------------------------------------------------------------------
  // 9. THEO DÕI THAY ĐỔI PHIÊN ĐĂNG NHẬP
  //
  // SỬA LỖI ESLINT THỨ NHẤT:
  //
  // Không gọi setSelectedStaff(), setActionError(),...
  // đồng bộ ngay trong thân useEffect.
  //
  // Thay vào đó, subscribe sự kiện thay đổi từ Zustand.
  // Callback sẽ reset dữ liệu khi tài khoản Admin hoặc quyền quản lý thay đổi.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe(
      (next, previous) => {
        const previousId =
          previous.session?.user.id ?? null;

        const nextId =
          next.session?.user.id ?? null;

        const previousCanManage =
          previous.ready &&
          Boolean(previousId) &&
          previous.session?.user.role === 'ADMIN';

        const nextCanManage =
          next.ready &&
          Boolean(nextId) &&
          next.session?.user.role === 'ADMIN';

        if (
          previousId === nextId &&
          previousCanManage === nextCanManage
        ) {
          return;
        }

        // Hủy hiệu lực các request từ phiên trước.
        listRequestRef.current += 1;
        detailRequestRef.current += 1;
        mutationRequestRef.current += 1;

        mutationLockedRef.current = false;

        // Không để thông tin Staff của phiên cũ tồn tại.
        setListSnapshot(null);
        setSelectedStaff(null);
        setDetailError(null);
        setDetailLoading(false);
        setActionError(null);
        setNotice(null);
        setMutation(null);
      },
    );

    return unsubscribe;
  }, []);

  // ---------------------------------------------------------------------------
  // 10. LÀM MỚI DANH SÁCH STAFF
  // ---------------------------------------------------------------------------

  const refresh = useCallback(() => {
    // Hủy hiệu lực kết quả danh sách cũ.
    listRequestRef.current += 1;

    // Đổi queryKey để kích hoạt tải lại.
    setReloadVersion((value) => value + 1);
  }, []);

  // ---------------------------------------------------------------------------
  // 11. TẢI DANH SÁCH STAFF TỪ BACKEND
  //
  // SỬA LỖI ESLINT THỨ HAI:
  //
  // Không gọi setItems(), setLoading() hoặc setListError()
  // đồng bộ ngay trong thân useEffect.
  //
  // Chỉ ghi snapshot sau khi Promise của API hoàn thành.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const requestId = ++listRequestRef.current;

    if (!canManage) {
      return;
    }

    void staffApi
      .list({
        search: debouncedSearch,
        status: statusFilter,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
      .then((result) => {
        if (
          !mountedRef.current ||
          requestId !== listRequestRef.current
        ) {
          return;
        }

        const lastPage = Math.max(
          1,
          Math.min(
            Math.ceil(result.total / pageSize),
            maxPageAllowed,
          ),
        );

        // Nếu trang hiện tại không còn tồn tại,
        // tự quay về trang cuối hợp lệ.
        if (page > lastPage) {
          setCurrentPage(lastPage);
          return;
        }

        setListSnapshot({
          key: queryKey,
          items: result.items,
          total: result.total,
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (
          !mountedRef.current ||
          requestId !== listRequestRef.current
        ) {
          return;
        }

        setListSnapshot({
          key: queryKey,
          items: [],
          total: 0,
          error: getErrorMessage(cause),
        });
      });

    return () => {
      listRequestRef.current += 1;
    };
  }, [
    canManage,
    debouncedSearch,
    statusFilter,
    page,
    pageSize,
    maxPageAllowed,
    queryKey,
  ]);

  // ---------------------------------------------------------------------------
  // 12. THAY ĐỔI TỪ KHÓA TÌM KIẾM
  // ---------------------------------------------------------------------------

  const setSearch = useCallback((value: string) => {
    setSearchInput(value.slice(0, MAX_SEARCH_LENGTH));
    setCurrentPage(1);
  }, []);

  // ---------------------------------------------------------------------------
  // 13. LỌC TRẠNG THÁI STAFF
  // ---------------------------------------------------------------------------

  const setStatusFilter = useCallback(
    (value: StaffStatusFilter) => {
      const allowedStatuses: StaffStatusFilter[] = [
        'ALL',
        'LOCKED',
        'PENDING_ACTIVATION',
        'ACTIVE',
      ];

      if (!allowedStatuses.includes(value)) {
        throw new TypeError(
          'Trạng thái lọc không hợp lệ.',
        );
      }

      setCurrentStatusFilter(value);
      setCurrentPage(1);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // 14. CHUYỂN TRANG
  // ---------------------------------------------------------------------------

  const setPage = useCallback(
    (value: number) => {
      if (!Number.isSafeInteger(value)) {
        return;
      }

      setCurrentPage(
        Math.max(1, Math.min(value, totalPages)),
      );
    },
    [totalPages],
  );

  // ---------------------------------------------------------------------------
  // 15. THAY ĐỔI SỐ DÒNG MỖI TRANG
  // ---------------------------------------------------------------------------

  const setPageSize = useCallback((value: number) => {
    if (
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > MAX_PAGE_SIZE
    ) {
      throw new RangeError(
        `Số dòng/trang phải từ 1 đến ${MAX_PAGE_SIZE}.`,
      );
    }

    setCurrentPageSize(value);
    setCurrentPage(1);
  }, []);

  // ---------------------------------------------------------------------------
  // 16. XÓA THÔNG BÁO LỖI / THÀNH CÔNG
  // ---------------------------------------------------------------------------

  const clearFeedback = useCallback(() => {
    setActionError(null);
    setNotice(null);
  }, []);

  // ---------------------------------------------------------------------------
  // 17. XÓA NHÂN VIÊN ĐANG ĐƯỢC CHỌN
  // ---------------------------------------------------------------------------

  const clearSelectedStaff = useCallback(() => {
    detailRequestRef.current += 1;

    setSelectedStaff(null);
    setDetailError(null);
    setDetailLoading(false);
  }, []);

  // ---------------------------------------------------------------------------
  // 18. KIỂM TRA ADMIN HIỆN TẠI
  //
  // Ngăn response của phiên trước cập nhật giao diện của phiên mới.
  // ---------------------------------------------------------------------------

  const isSameAdmin = useCallback(() => {
    const current = useAuthStore.getState();

    return (
      mountedRef.current &&
      current.ready &&
      current.session?.user.id === userId &&
      current.session?.user.role === 'ADMIN'
    );
  }, [userId]);

  // ---------------------------------------------------------------------------
  // 19. GET /admin/staff/:id
  // XEM CHI TIẾT NHÂN VIÊN
  // ---------------------------------------------------------------------------

  const loadStaff = useCallback(
    async (id: string): Promise<Staff> => {
      if (!canManage) {
        throw new AuthError(
          403,
          'Bạn không có quyền xem nhân viên.',
        );
      }

      const requestId = ++detailRequestRef.current;

      setDetailLoading(true);
      setDetailError(null);
      setSelectedStaff(null);

      try {
        const staff = await staffApi.get(id);

        if (
          isSameAdmin() &&
          requestId === detailRequestRef.current
        ) {
          setSelectedStaff(staff);
        }

        return staff;
      } catch (cause: unknown) {
        if (
          isSameAdmin() &&
          requestId === detailRequestRef.current
        ) {
          setDetailError(getErrorMessage(cause));
        }

        throw cause;
      } finally {
        if (
          isSameAdmin() &&
          requestId === detailRequestRef.current
        ) {
          setDetailLoading(false);
        }
      }
    },
    [canManage, isSameAdmin],
  );

  // ---------------------------------------------------------------------------
  // 20. HELPER: THỰC HIỆN THAO TÁC GHI
  //
  // Chỉ cho phép một thao tác ghi chạy tại một thời điểm.
  //
  // Không tự retry POST/PATCH khi timeout,
  // vì Backend có thể đã ghi dữ liệu thành công.
  // ---------------------------------------------------------------------------

  const runMutation = useCallback(
    async <T,>(
      kind: StaffMutation,
      operation: () => Promise<T>,
      onSuccess: (value: T) => void,
    ): Promise<T> => {
      if (!canManage) {
        throw new AuthError(
          403,
          'Bạn không có quyền quản lý nhân viên.',
        );
      }

      if (mutationLockedRef.current) {
        throw new Error(
          'Đang xử lý một thao tác khác. Vui lòng đợi thao tác hoàn tất.',
        );
      }

      mutationLockedRef.current = true;

      const requestId = ++mutationRequestRef.current;

      setMutation(kind);
      setActionError(null);
      setNotice(null);

      try {
        const response = await operation();

        if (
          isSameAdmin() &&
          requestId === mutationRequestRef.current
        ) {
          onSuccess(response);
        }

        return response;
      } catch (cause: unknown) {
        if (
          isSameAdmin() &&
          requestId === mutationRequestRef.current
        ) {
          const ambiguous =
            cause instanceof AuthError &&
            (cause.status === 0 || cause.status >= 500);

          const guidance =
            ambiguous &&
            (kind === 'create' || kind === 'resend')
              ? ' Yêu cầu có thể đã được xử lý. Hãy kiểm tra danh sách/trạng thái trước khi thử lại.'
              : '';

          setActionError(
            `${getErrorMessage(cause)}${guidance}`,
          );

          // Không biết Backend đã xử lý thao tác hay chưa,
          // nên tải lại danh sách để đồng bộ.
          if (ambiguous) {
            refresh();
          }
        }

        throw cause;
      } finally {
        if (requestId === mutationRequestRef.current) {
          mutationLockedRef.current = false;

          if (mountedRef.current) {
            setMutation(null);
          }
        }
      }
    },
    [canManage, isSameAdmin, refresh],
  );

  // ---------------------------------------------------------------------------
  // 21. POST /admin/staff
  // TẠO NHÂN VIÊN VÀ GỬI THƯ MỜI
  // ---------------------------------------------------------------------------

  const createStaff = useCallback(
    (input: CreateStaffInput) =>
      runMutation(
        'create',
        () => staffApi.create(input),
        (result) => {
          setSelectedStaff(result.staff);

          setNotice({
            type: result.invitationSent
              ? 'success'
              : 'warning',
            message: result.message,
          });

          setCurrentPage(1);
          refresh();
        },
      ),
    [runMutation, refresh],
  );

  // ---------------------------------------------------------------------------
  // 22. PATCH /admin/staff/:id
  // CẬP NHẬT THÔNG TIN NHÂN VIÊN
  // ---------------------------------------------------------------------------

  const updateStaff = useCallback(
    (id: string, input: UpdateStaffInput) =>
      runMutation(
        'update',
        () => staffApi.update(id, input),
        (result) => {
          setSelectedStaff((previous) =>
            previous?.id === result.id
              ? result
              : previous,
          );

          setNotice({
            type: 'success',
            message: 'Đã cập nhật thông tin nhân viên.',
          });

          refresh();
        },
      ),
    [runMutation, refresh],
  );

  // ---------------------------------------------------------------------------
  // 23. PATCH /admin/staff/:id/status
  // KHÓA / MỞ KHÓA TÀI KHOẢN
  // ---------------------------------------------------------------------------

  const setStaffStatus = useCallback(
    (id: string, input: UpdateStaffStatusInput) =>
      runMutation(
        'status',
        () => staffApi.setStatus(id, input),
        (result) => {
          setSelectedStaff((previous) =>
            previous?.id === result.id
              ? result
              : previous,
          );

          setNotice({
            type: 'success',
            message: input.isActive
              ? 'Đã mở khóa tài khoản nhân viên.'
              : 'Đã khóa tài khoản nhân viên.',
          });

          refresh();
        },
      ),
    [runMutation, refresh],
  );

  // ---------------------------------------------------------------------------
  // 24. POST /admin/staff/:id/resend-invitation
  // GỬI LẠI THƯ MỜI KÍCH HOẠT TÀI KHOẢN
  // ---------------------------------------------------------------------------

  const resendStaffInvitation = useCallback(
    (id: string) =>
      runMutation(
        'resend',
        () => staffApi.resendInvitation(id),
        (result) => {
          setNotice({
            type: 'success',
            message: result.message,
          });

          refresh();
        },
      ),
    [runMutation, refresh],
  );

  // ---------------------------------------------------------------------------
  // 25. TRẢ VỀ STATE VÀ CÁC HÀM CHO PAGE.TSX
  // ---------------------------------------------------------------------------

  return useMemo(
    () => ({
      items,
      total,
      page,
      pageSize,
      totalPages,
      search,
      statusFilter,
      loading,
      error,
      notice,
      mutation,
      selectedStaff,
      detailLoading,
      detailError,
      canManage,

      setSearch,
      setStatusFilter,
      setPage,
      setPageSize,

      refresh,
      clearFeedback,
      clearSelectedStaff,

      loadStaff,
      createStaff,
      updateStaff,
      setStaffStatus,
      resendStaffInvitation,
    }),
    [
      items,
      total,
      page,
      pageSize,
      totalPages,
      search,
      statusFilter,
      loading,
      error,
      notice,
      mutation,
      selectedStaff,
      detailLoading,
      detailError,
      canManage,

      setSearch,
      setStatusFilter,
      setPage,
      setPageSize,

      refresh,
      clearFeedback,
      clearSelectedStaff,

      loadStaff,
      createStaff,
      updateStaff,
      setStaffStatus,
      resendStaffInvitation,
    ],
  );
}
