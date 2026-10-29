"use client";
import { create } from "zustand";
import { AuthError, authRequest, type AuthSession } from "@/shared/lib/authApi";

const KEY = "mwh-auth-session";
let generation = 0;
let refreshing: Promise<AuthSession> | null = null;
interface AuthState { session: AuthSession | null; ready: boolean; initialize: () => Promise<void>; login: (username: string, password: string) => Promise<AuthSession>; logout: () => Promise<void>; refresh: () => Promise<AuthSession>; }
function save(session: AuthSession | null) {
  try { if (session) sessionStorage.setItem(KEY, JSON.stringify(session)); else sessionStorage.removeItem(KEY); } catch { /* Memory session remains usable when storage is unavailable. */ }
}
function clear() { generation++; save(null); useAuthStore.setState({ session: null, ready: true }); }
export const useAuthStore = create<AuthState>((set, get) => ({
  session: null, ready: false,
  initialize: async () => {
    if (get().ready) return;
    let stored: AuthSession | null = null;
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || "null") as AuthSession | null; } catch { /* Invalid storage is discarded. */ }
    if (!stored?.tokens?.refreshToken || !stored.tokens.accessToken || !stored.user?.id) { clear(); return; }
    set({ session: stored });
    // Revalidate role/account with backend before rendering a protected page.
    try { await get().refresh(); } catch { /* refresh clears unusable session. */ }
    set({ ready: true });
  },
  login: async (username, password) => {
    const version = ++generation;
    const session = await authRequest<AuthSession>("/auth/login", { username: username.trim(), password });
    if (version !== generation) throw new Error("Phiên đăng nhập đã thay đổi. Vui lòng thử lại.");
    save(session); set({ session, ready: true }); return session;
  },
  refresh: () => {
    if (refreshing) return refreshing;
    const version = generation;
    const session = get().session;
    if (!session) return Promise.reject(new AuthError(401, "Vui lòng đăng nhập."));
    refreshing = authRequest<AuthSession>("/auth/refresh", { refreshToken: session.tokens.refreshToken })
      .then(next => {
        if (version !== generation) throw new AuthError(401, "Phiên đã thay đổi.");
        save(next); set({ session: next }); return next;
      }).catch(error => { if (version === generation) clear(); throw error; })
      .finally(() => { refreshing = null; });
    return refreshing;
  },
  logout: async () => {
    const session = get().session;
    clear();
    if (session) {
      try { await authRequest("/auth/logout", { refreshToken: session.tokens.refreshToken }, session.tokens.accessToken); }
      catch { /* Local logout succeeds even when backend is unavailable. */ }
    }
  },
}));

/** Refresh once, then retry. Only use for endpoints safe to repeat after HTTP 401. */
export async function authenticatedRequest<T>(path: string, body?: unknown, method?: string): Promise<T> {
  let session = useAuthStore.getState().session;
  if (!session) throw new AuthError(401, "Vui lòng đăng nhập.");
  if (session.tokens.accessTokenExpiresAt * 1000 <= Date.now() + 10000) session = await useAuthStore.getState().refresh();
  try { return await authRequest<T>(path, body, session.tokens.accessToken, method); }
  catch (error) {
    if (!(error instanceof AuthError) || error.status !== 401) throw error;
    session = await useAuthStore.getState().refresh();
    return authRequest<T>(path, body, session.tokens.accessToken, method);
  }
}
