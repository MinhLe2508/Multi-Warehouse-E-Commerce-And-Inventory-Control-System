"use client";
import { create } from "zustand";
import { AuthError, authRequest, type AuthSession } from "@/shared/lib/authApi";

const SESSION_STORAGE_KEY = "mwh-auth-session";
const ACCESS_REFRESH_LEEWAY_MS = 10_000;

// Mỗi lần đổi phiên (login/logout/refresh không hợp lệ) tăng generation.
// Kết quả từ request cũ không được phép ghi đè phiên mới.
let generation = 0;

interface RefreshInFlight {
  generation: number;
  refreshToken: string;
  promise: Promise<AuthSession>;
}

// Một request refresh cho một phiên tại một thời điểm.
let refreshing: RefreshInFlight | null = null;

interface AuthState {
  session: AuthSession | null;
  ready: boolean;
  initialize: () => Promise<void>;
  login: (username: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthSession>;
}

// Chỉ lưu trên trình duyệt. Nếu storage bị chặn, vẫn dùng được phiên trong RAM.
function persistSession(session: AuthSession | null): void {
  try {
    if (session) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Trình duyệt có thể chặn sessionStorage (privacy mode, quota...).
  }
}

// Chỉ phục hồi đúng cấu trúc cần dùng; không tin dữ liệu storage có sẵn.
function isStoredSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSession>;
  const tokens = candidate.tokens;
  const user = candidate.user;

  return (
    !!tokens &&
    typeof tokens.accessToken === "string" &&
    tokens.accessToken.length > 0 &&
    !tokens.accessToken.startsWith("mock-") &&
    typeof tokens.refreshToken === "string" &&
    tokens.refreshToken.length > 0 &&
    typeof tokens.accessTokenExpiresAt === "number" &&
    Number.isFinite(tokens.accessTokenExpiresAt) &&
    !!user &&
    typeof user.id === "string" &&
    user.id.length > 0 &&
    typeof user.role === "string" &&
    ["ADMIN", "WAREHOUSE_STAFF", "CUSTOMER"].includes(user.role) &&
    typeof user.mustChangePassword === "boolean"
  );
}

function clearSession(): void {
  generation += 1;
  persistSession(null);
  useAuthStore.setState({ session: null, ready: true });
}

function assertCurrentSession(session: AuthSession): void {
  if (useAuthStore.getState().session !== session) {
    throw new AuthError(401, "Phiên đăng nhập đã thay đổi. Vui lòng thử lại.");
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  ready: false,

  // Khôi phục phiên khi trang tải lại. Không phục hồi token mock từ bản cũ.
  initialize: async () => {
    if (get().ready) return;

    let stored: unknown = null;
    try {
      stored = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) || "null");
    } catch {
      // Phiên không đọc được hoặc JSON sai định dạng -> loại bỏ an toàn.
    }

    if (!isStoredSession(stored)) {
      clearSession();
      return;
    }

    set({ session: stored });

    try {
      // Backend quyết định phiên có hợp lệ, tài khoản có bị khóa hay không.
      // Đồng thời rotate refresh token để cập nhật phiên khi tải lại trang.
      await get().refresh();
    } catch {
      // refresh() tự xóa phiên khi refresh thất bại.
      // Không cho phép coi một phiên chưa được xác minh là đã đăng nhập.
    }

    set({ ready: true });
  },

  // Chỉ chấp nhận phản hồi từ Backend; không fallback sang Admin/Staff giả lập.
  login: async (username, password) => {
    const currentGeneration = ++generation;
    const normalizedUsername = username.trim().toLowerCase();
    const result = await authRequest<AuthSession>("/auth/login", {
      username: normalizedUsername,
      password,
    });

    if (currentGeneration !== generation) {
      throw new AuthError(401, "Phiên đăng nhập đã thay đổi. Vui lòng thử lại.");
    }

    persistSession(result);
    set({ session: result, ready: true });
    return result;
  },

  // Khi nhiều request cùng cần refresh, chỉ gọi /auth/refresh một lần.
  // Refresh token của Backend là opaque token được rotate mỗi lần sử dụng.
  refresh: () => {
    const session = get().session;
    if (!session) {
      return Promise.reject(new AuthError(401, "Vui lòng đăng nhập."));
    }

    // Phiên mock tồn dư (nếu có) không được gửi đến Backend.
    if (session.tokens.accessToken.startsWith("mock-")) {
      clearSession();
      return Promise.reject(new AuthError(401, "Phiên xem trước không còn được hỗ trợ."));
    }

    const currentGeneration = generation;
    const originalRefreshToken = session.tokens.refreshToken;

    // Chỉ tái sử dụng request refresh của đúng phiên hiện tại.
    if (
      refreshing &&
      refreshing.generation === currentGeneration &&
      refreshing.refreshToken === originalRefreshToken
    ) {
      return refreshing.promise;
    }

    const promise = authRequest<AuthSession>("/auth/refresh", {
      refreshToken: originalRefreshToken,
    })
      .then((next) => {
        // Không hồi sinh phiên nếu người dùng vừa logout/đăng nhập phiên khác.
        if (
          currentGeneration !== generation ||
          get().session?.tokens.refreshToken !== originalRefreshToken
        ) {
          throw new AuthError(401, "Phiên đăng nhập đã thay đổi.");
        }

        persistSession(next);
        set({ session: next, ready: true });
        return next;
      })
      .catch((error: unknown) => {
        // Chỉ xóa phiên đã thất bại, không xóa phiên mới của người khác.
        if (
          currentGeneration === generation &&
          get().session?.tokens.refreshToken === originalRefreshToken
        ) {
          clearSession();
        }
        throw error;
      })
      .finally(() => {
        // Không xóa tham chiếu của một refresh mới đang chạy.
        if (refreshing?.promise === promise) refreshing = null;
      });

    refreshing = {
      generation: currentGeneration,
      refreshToken: originalRefreshToken,
      promise,
    };
    return promise;
  },

  // Xóa phiên local ngay, sau đó cố gắng thu hồi refresh token ở Backend.
  logout: async () => {
    const session = get().session;
    clearSession();

    if (session && !session.tokens.accessToken.startsWith("mock-")) {
      try {
        await authRequest<void>(
          "/auth/logout",
          { refreshToken: session.tokens.refreshToken },
          session.tokens.accessToken,
        );
      } catch {
        // Dù mất kết nối, đăng xuất phía trình duyệt vẫn hoàn thành.
      }
    }
  },
}));

/**
 * Gọi API cần xác thực bằng access token.
 *
 * - Tự refresh trước request khi token gần hết hạn.
 * - HTTP 401: CHỈ retry một lần với GET/HEAD (request đọc an toàn).
 * - POST, PUT, PATCH, DELETE không tự retry để tránh tạo/ghi dữ liệu hai lần.
 * - Không thay đổi chữ ký hàm để tương thích với những nơi đang gọi.
 */
export async function authenticatedRequest<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  let session = useAuthStore.getState().session;
  if (!session) throw new AuthError(401, "Vui lòng đăng nhập.");

  if (session.tokens.accessToken.startsWith("mock-")) {
    clearSession();
    throw new AuthError(401, "Phiên xem trước không còn được hỗ trợ.");
  }

  // Mặc định của authRequest: không có body -> GET, có body -> POST.
  const effectiveMethod = (method ?? (body === undefined ? "GET" : "POST")).toUpperCase();
  const mayRetry = effectiveMethod === "GET" || effectiveMethod === "HEAD";

  if (session.tokens.accessTokenExpiresAt * 1000 <= Date.now() + ACCESS_REFRESH_LEEWAY_MS) {
    session = await useAuthStore.getState().refresh();
  }

  // Nếu người dùng logout trong lúc chờ refresh thì không gửi request cũ.
  assertCurrentSession(session);

  try {
    return await authRequest<T>(path, body, session.tokens.accessToken, method);
  } catch (error) {
    if (!(error instanceof AuthError) || error.status !== 401 || !mayRetry) {
      throw error;
    }

    // Với GET/HEAD, một lần refresh rồi retry là an toàn về mặt chủ đích.
    session = await useAuthStore.getState().refresh();
    assertCurrentSession(session);
    return authRequest<T>(path, body, session.tokens.accessToken, method);
  }
}
