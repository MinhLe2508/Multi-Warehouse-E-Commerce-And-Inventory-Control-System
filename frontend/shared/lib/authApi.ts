import { apiErrorMessage } from "./authContract";
import type { UserRole } from "./roleRedirect";

export interface AuthUser { id: string; username: string; email: string; fullName: string; role: UserRole; mustChangePassword: boolean }
export interface AuthSession { tokens: { accessToken: string; refreshToken: string; accessTokenExpiresAt: number }; user: AuthUser }
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "");
export async function authRequest<T>(path: string, body?: unknown, accessToken?: string, method?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"), cache: "no-store", referrerPolicy: "no-referrer",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new AuthError(0, "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."); }
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throw new AuthError(response.status, apiErrorMessage(data, response.status));
  return data as T;
}
