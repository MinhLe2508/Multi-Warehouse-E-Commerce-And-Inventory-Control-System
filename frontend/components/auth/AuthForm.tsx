"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authRequest, type AuthSession } from "@/shared/lib/authApi";
import { actionRequest, passwordError, type AccountAction } from "@/shared/lib/authContract";
import { getHomeByRole } from "@/shared/lib/roleRedirect";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";

type Mode = AccountAction | "login" | "register" | "forgot-password" | "change-password";
const titles: Record<Mode, string> = { login: "Đăng nhập", register: "Tạo tài khoản", "verify-email": "Xác thực email", "staff-invitation": "Kích hoạt tài khoản nhân viên", "reset-password": "Đặt lại mật khẩu", "forgot-password": "Quên mật khẩu", "change-password": "Đổi mật khẩu" };
const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";
export default function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const action = mode === "verify-email" || mode === "staff-invitation" || mode === "reset-password";
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "");
    setError(""); setMessage("");
    if (action || mode === "change-password") {
      const problem = passwordError(value("password"), value("confirmPassword"));
      if (problem) { setError(problem); return; }
    }
    submitting.current = true; setBusy(true);
    try {
      if (mode === "login") {
        const session: AuthSession = await useAuthStore.getState().login(value("username"), value("password"));
        router.replace(session.user.mustChangePassword ? "/change-password" : getHomeByRole(session.user.role));
      } else if (action) {
        const request = actionRequest(mode, token, value("password"));
        const result = await authRequest<{ message: string }>(request.path, request.body);
        setMessage(result.message); setDone(true);
        // Remove the one-time token from the current history entry after success.
        window.history.replaceState(null, "", window.location.pathname);
      } else if (mode === "register") {
        const result = await authRequest<{ message: string }>("/auth/register", {
          email: value("email").trim(), fullName: value("fullName").trim(),
          ...(value("phone").trim() ? { phone: value("phone").trim() } : {}),
        });
        setMessage(result.message); setDone(true);
      } else if (mode === "forgot-password") {
        const result = await authRequest<{ message: string }>("/auth/forgot-password", { email: value("email").trim() });
        setMessage(result.message); setCooldown(60);
      } else {
        await authenticatedRequest("/auth/change-password", { currentPassword: value("currentPassword"), newPassword: value("password") });
        await useAuthStore.getState().logout(); setMessage("Đã đổi mật khẩu. Vui lòng đăng nhập lại."); setDone(true);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Có lỗi xảy ra. Vui lòng thử lại."); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || cooldown) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    submitting.current = true; setBusy(true); setError("");
    try {
      const result = await authRequest<{ message: string }>("/auth/resend-verification", { email });
      setMessage(result.message); setCooldown(60);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không gửi được email."); }
    finally { submitting.current = false; setBusy(false); }
  }
  const field = (name: string, label: string, type = "text", autoComplete?: string, required = true) => <label className="block text-sm font-medium text-slate-700" key={name}>{label}<input name={name} type={type} required={required} autoComplete={autoComplete} className={inputClass} /></label>;
  return <main className="min-h-screen bg-slate-50 px-4 py-12 sm:py-20">
    <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
      <Link href="/" className="text-sm font-semibold text-indigo-700">← Multi Warehouse</Link>
      <h1 className="mt-6 text-2xl font-bold text-slate-900">{titles[mode]}</h1>
      <p className="mb-7 mt-2 text-sm leading-6 text-slate-500">{mode === "register" ? "Nhập Gmail để nhận liên kết xác thực và tự đặt mật khẩu." : mode === "login" ? "Dùng tên đăng nhập và mật khẩu của bạn." : action ? "Thiết lập mật khẩu để hoàn tất yêu cầu. Liên kết chỉ sử dụng được một lần." : "Bảo vệ tài khoản và tiếp tục mua sắm."}</p>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {!done && <form onSubmit={submit} className="space-y-4">
        {mode === "login" && field("username", "Tên đăng nhập", "text", "username")}
        {mode === "register" && field("fullName", "Họ và tên", "text", "name")}
        {(mode === "register" || mode === "forgot-password") && field("email", "Gmail", "email", "email")}
        {mode === "register" && field("phone", "Số điện thoại (không bắt buộc)", "tel", "tel", false)}
        {mode === "change-password" && field("currentPassword", "Mật khẩu hiện tại", "password", "current-password")}
        {(mode === "login" || action || mode === "change-password") && field("password", mode === "login" ? "Mật khẩu" : "Mật khẩu mới", "password", mode === "login" ? "current-password" : "new-password")}
        {(action || mode === "change-password") && field("confirmPassword", "Nhập lại mật khẩu mới", "password", "new-password")}
        {(action || mode === "change-password") && <p className="text-xs text-slate-500">Ít nhất 8 ký tự, tối đa 72 byte UTF-8.</p>}
        {action && !/^[0-9a-f]{64}$/.test(token) && <p role="alert" className="text-sm text-red-700">Liên kết thiếu token hoặc không hợp lệ. Hãy mở đúng liên kết trong email.</p>}
        <button disabled={busy || (action && !/^[0-9a-f]{64}$/.test(token)) || (mode === "forgot-password" && cooldown > 0)} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "Đang xử lý…" : mode === "forgot-password" && cooldown ? `Gửi lại sau ${cooldown}s` : titles[mode]}</button>
      </form>}
      {(mode === "verify-email" || mode === "register" || mode === "login") && <details className="mt-6 text-sm"><summary className="cursor-pointer text-indigo-700">Chưa nhận được email hoặc liên kết xác thực đã hết hạn?</summary><form onSubmit={resend} className="mt-4 space-y-3">{field("email", "Gmail đã đăng ký", "email", "email")}<button disabled={busy || cooldown > 0} className="rounded-lg border border-indigo-300 px-4 py-2 text-indigo-700 disabled:opacity-50">{cooldown ? `Gửi lại sau ${cooldown}s` : "Gửi lại email xác thực"}</button></form></details>}
      {mode === "staff-invitation" && <p className="mt-5 text-sm text-slate-600">Lời mời hết hạn? Liên hệ Admin để được gửi lại lời mời.</p>}
      <nav className="mt-7 flex flex-wrap gap-4 text-sm text-indigo-700">
        {mode !== "login" && <Link href="/login">Đăng nhập</Link>}
        {mode === "login" && <><Link href="/register">Tạo tài khoản</Link><Link href="/forgot-password">Quên mật khẩu?</Link></>}
        {mode === "reset-password" && <Link href="/forgot-password">Yêu cầu liên kết mới</Link>}
      </nav>
    </div>
  </main>;
}
