import { apiErrorMessage } from "./authContract";
import type { UserRole } from "./roleRedirect";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface AuthSession {
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: number;
  };
  user: AuthUser;
}

// status = 0: chưa nhận được HTTP response (mất mạng, timeout, CORS...).
// status > 0: mã HTTP mà Backend trả về, trừ lỗi response không đúng JSON.
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthRequestOptions {
  // Mặc định 15 giây. Các nghiệp vụ SMTP có thể cần 45 giây hoặc hơn.
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 120_000;
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001")
  .trim()
  .replace(/\/+$/, "");


export async function authRequest<T>(
  path: string,
  body?: unknown,
  accessToken?: string,
  method?: string,
  options: AuthRequestOptions = {},
): Promise<T> {
  const resolvedMethod = (method ?? (body === undefined ? "GET" : "POST"))
    .trim()
    .toUpperCase();

  // Fetch không cho gửi body với GET/HEAD; báo lỗi lập trình thay vì lỗi mạng 0.
  if ((resolvedMethod === "GET" || resolvedMethod === "HEAD") && body !== undefined) {
    throw new TypeError(`${resolvedMethod} không được gửi JSON body.`);
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new RangeError(`timeoutMs phải là số nguyên từ 1 đến ${MAX_TIMEOUT_MS}.`);
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: resolvedMethod,
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause: unknown) {
    const timeout =
      cause instanceof Error &&
      (cause.name === "TimeoutError" || cause.name === "AbortError");

    if (timeout) {
      throw new AuthError(
        0,
        "Hết thời gian chờ phản hồi. Nếu vừa tạo hoặc cập nhật dữ liệu, hãy kiểm tra kết quả trước khi thử lại.",
      );
    }

    throw new AuthError(
      0,
      "Không kết nối được máy chủ. Kiểm tra mạng, địa chỉ API và CORS rồi thử lại.",
    );
  }

  const noBody =
    response.status === 204 ||
    response.status === 205 ||
    resolvedMethod === "HEAD";
  const data: unknown = noBody
    ? undefined
    : await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new AuthError(response.status, apiErrorMessage(data, response.status));
  }

  return data as T;
}
