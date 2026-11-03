"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Warehouse,
  ArrowLeft,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { AuthError, authRequest, type AuthSession } from "@/shared/lib/authApi";
import { actionRequest, passwordError, type AccountAction } from "@/shared/lib/authContract";
import { getSafeNextRoute } from "@/shared/lib/roleRedirect";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";

type Mode = AccountAction | "login" | "register" | "forgot-password" | "change-password";

const titles: Record<Mode, string> = {
  login: "Đăng nhập",
  register: "Tạo tài khoản",
  "verify-email": "Xác thực email",
  "staff-invitation": "Kích hoạt tài khoản nhân viên",
  "reset-password": "Đặt lại mật khẩu",
  "forgot-password": "Quên mật khẩu",
  "change-password": "Đổi mật khẩu",
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:border-purple-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-purple-100/80 transition-all";

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

  // Toggle ẩn/hiện mật khẩu
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

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
    setError("");
    setMessage("");

    if (action || mode === "change-password") {
      const problem = passwordError(value("password"), value("confirmPassword"));
      if (problem) {
        setError(problem);
        return;
      }
    }

    submitting.current = true;
    setBusy(true);

    try {
      if (mode === "login") {
        // Chuẩn hóa tên đăng nhập theo T1
        let username = value("username").trim().toLowerCase();
        if (username.includes("@")) {
          const parts = username.split("@");
          if (parts.length !== 2 || parts[1] !== "gmail.com") {
            setError("Chỉ chấp nhận tài khoản Gmail (@gmail.com).");
            return;
          }
          username = parts[0];
        }

        const session: AuthSession = await useAuthStore.getState().login(username, value("password"));
        const nextParam = params.get("next");
        const target = session.user.mustChangePassword
          ? "/change-password"
          : getSafeNextRoute(session.user.role, nextParam);

        router.replace(target);
      } else if (action) {
        const request = actionRequest(mode, token, value("password"));
        const result = await authRequest<{ message: string }>(request.path, request.body);
        setMessage(result.message);
        setDone(true);
        window.history.replaceState(null, "", window.location.pathname);
      } else if (mode === "register") {
        const result = await authRequest<{ message: string }>("/auth/register", {
          email: value("email").trim(),
          fullName: value("fullName").trim(),
          ...(value("phone").trim() ? { phone: value("phone").trim() } : {}),
        });
        setMessage(result.message);
        setDone(true);
      } else if (mode === "forgot-password") {
        const result = await authRequest<{ message: string }>("/auth/forgot-password", {
          email: value("email").trim(),
        });
        setMessage(result.message);
        setCooldown(60);
      } else {
        await authenticatedRequest("/auth/change-password", {
          currentPassword: value("currentPassword"),
          newPassword: value("password"),
        });
        await useAuthStore.getState().logout();
        setMessage("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
        setDone(true);
      }
    } catch (cause) {
      if (mode === "login" && cause instanceof AuthError) {
        if (cause.status === 401) {
          setError("Tên đăng nhập hoặc mật khẩu không chính xác.");
          return;
        }
        if (cause.status === 403) {
          setError("Tài khoản đã bị khóa hoặc chưa được kích hoạt.");
          return;
        }
      }
      setError(cause instanceof Error ? cause.message : "Có lỗi xảy ra. Vui lòng thử lại.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || cooldown) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      const result = await authRequest<{ message: string }>("/auth/resend-verification", { email });
      setMessage(result.message);
      setCooldown(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không gửi được email.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const field = (
    name: string,
    label: string,
    type = "text",
    autoComplete?: string,
    required = true,
    placeholder?: string
  ) => {
    const isPasswordField = type === "password";
    const actualType = isPasswordField
      ? name === "confirmPassword"
        ? showConfirmPassword
          ? "text"
          : "password"
        : name === "currentPassword"
        ? showCurrentPassword
          ? "text"
          : "password"
        : showPassword
        ? "text"
        : "password"
      : type;

    return (
      <div className="space-y-1.5" key={name}>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
          {label}
        </label>
        <div className="relative">
          <input
            name={name}
            type={actualType}
            required={required}
            autoComplete={autoComplete}
            placeholder={placeholder}
            className={`${inputClass} ${isPasswordField ? "pr-10" : ""}`}
          />
          {isPasswordField && (
            <button
              type="button"
              onClick={() => {
                if (name === "confirmPassword") setShowConfirmPassword(!showConfirmPassword);
                else if (name === "currentPassword") setShowCurrentPassword(!showCurrentPassword);
                else setShowPassword(!showPassword);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-purple-600 focus:outline-none p-1 transition-colors"
              tabIndex={-1}
              aria-label="Ẩn hoặc hiện mật khẩu"
            >
              {(name === "confirmPassword"
                ? showConfirmPassword
                : name === "currentPassword"
                ? showCurrentPassword
                : showPassword) ? (
                <EyeOff size={17} />
              ) : (
                <Eye size={17} />
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-violet-50/70 via-slate-50 to-indigo-50/60 overflow-hidden">
      {/* Hiệu ứng ánh sáng tím mờ ambient background */}
      <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-purple-200/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-indigo-200/40 blur-3xl pointer-events-none" />

      {/* Khung Card Đăng nhập theo phong cách Purple - Indigo sang trọng */}
      <div className="relative w-full max-w-[440px] rounded-3xl border border-purple-100/90 bg-white/95 p-7 sm:p-9 shadow-xl shadow-purple-900/5 backdrop-blur-md">
        {/* Thanh tiêu đề trên cùng */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors group"
          >
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
            <span>Về trang chủ</span>
          </Link>
          <span className="text-[11px] font-semibold text-slate-400 tracking-wide uppercase">
            Multi Warehouse
          </span>
        </div>

        {/* Brand Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md shadow-purple-500/25 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)" }}
          >
            <Warehouse size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
              {titles[mode]}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === "login"
                ? "Hệ thống quản lý phân phối bán hàng & tồn kho đa điểm"
                : mode === "register"
                ? "Tạo tài khoản khách hàng mới bằng Gmail"
                : "Xác thực tài khoản và phân quyền người dùng"}
            </p>
          </div>
        </div>

        {/* Thông báo lỗi */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-xs sm:text-sm text-rose-800 flex items-start gap-2.5 shadow-sm"
          >
            <AlertCircle size={17} className="text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Thông báo thành công */}
        {message && (
          <div
            role="status"
            className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200/80 p-3.5 text-xs sm:text-sm text-emerald-800 flex items-start gap-2.5 shadow-sm"
          >
            <CheckCircle2 size={17} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <span className="leading-snug">{message}</span>
          </div>
        )}

        {!done && (
          <form onSubmit={submit} className="space-y-4">
            {mode === "login" &&
              field(
                "username",
                "Tên đăng nhập (hoặc Gmail)",
                "text",
                "username",
                true,
                "admin hoặc staff (không cần @gmail.com)"
              )}
            {mode === "register" && field("fullName", "Họ và tên", "text", "name")}
            {(mode === "register" || mode === "forgot-password") &&
              field("email", "Gmail", "email", "email", true, "example@gmail.com")}
            {mode === "register" &&
              field("phone", "Số điện thoại (không bắt buộc)", "tel", "tel", false)}
            {mode === "change-password" &&
              field("currentPassword", "Mật khẩu hiện tại", "password", "current-password")}
            {(mode === "login" || action || mode === "change-password") &&
              field(
                "password",
                mode === "login" ? "Mật khẩu" : "Mật khẩu mới",
                "password",
                mode === "login" ? "current-password" : "new-password"
              )}
            {(action || mode === "change-password") &&
              field("confirmPassword", "Nhập lại mật khẩu mới", "password", "new-password")}
            {(action || mode === "change-password") && (
              <p className="text-xs text-slate-500">Ít nhất 8 ký tự, tối đa 72 byte UTF-8.</p>
            )}
            {action && !/^[0-9a-f]{64}$/.test(token) && (
              <p role="alert" className="text-sm text-red-700">
                Liên kết thiếu token hoặc không hợp lệ. Hãy mở đúng liên kết trong email.
              </p>
            )}

            <button
              disabled={
                busy ||
                (action && !/^[0-9a-f]{64}$/.test(token)) ||
                (mode === "forgot-password" && cooldown > 0)
              }
              className="w-full rounded-xl text-white font-semibold py-3 px-4 text-sm shadow-md shadow-purple-500/25 hover:shadow-lg hover:shadow-purple-500/35 focus:outline-none focus:ring-4 focus:ring-purple-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)" }}
            >
              {busy && (
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                  style={{ width: "1rem", height: "1rem" }}
                />
              )}
              <span>
                {busy
                  ? "Đang xử lý…"
                  : mode === "forgot-password" && cooldown
                  ? `Gửi lại sau ${cooldown}s`
                  : titles[mode]}
              </span>
            </button>
          </form>
        )}

        {/* Khối gợi ý tài khoản mẫu seed chuẩn để người dùng dễ kiểm thử */}
        {mode === "login" && (
          <div className="mt-5 rounded-2xl bg-purple-50/80 border border-purple-100/90 p-3 text-xs text-purple-950 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-semibold text-purple-900">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                Tài khoản kiểm thử nhanh (Demo):
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-200/70 text-purple-800">
                Seed
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <div>
                <span className="text-slate-500">Admin: </span>
                <code className="bg-white px-1.5 py-0.5 rounded border border-purple-200 text-purple-700 font-semibold">
                  admin
                </code>{" "}
                /{" "}
                <code className="bg-white px-1.5 py-0.5 rounded border border-purple-200 text-purple-700 font-semibold">
                  admin
                </code>
              </div>
              <div>
                <span className="text-slate-500">Staff: </span>
                <code className="bg-white px-1.5 py-0.5 rounded border border-purple-200 text-purple-700 font-semibold">
                  staff
                </code>{" "}
                /{" "}
                <code className="bg-white px-1.5 py-0.5 rounded border border-purple-200 text-purple-700 font-semibold">
                  staff
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Khối gửi lại email xác thực */}
        {(mode === "verify-email" || mode === "register" || mode === "login") && (
          <details className="mt-4 text-xs group">
            <summary className="cursor-pointer text-slate-500 hover:text-purple-700 font-medium list-none flex items-center justify-between py-1 transition-colors">
              <span>Chưa nhận được email hoặc liên kết hết hạn?</span>
              <span className="text-purple-600 font-bold group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <form
              onSubmit={resend}
              className="mt-3 space-y-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80"
            >
              <label className="block text-xs font-semibold text-slate-600">
                Gmail đã đăng ký
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                  placeholder="your-account@gmail.com"
                />
              </label>
              <button
                disabled={busy || cooldown > 0}
                className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors"
              >
                {cooldown ? `Gửi lại sau ${cooldown}s` : "Gửi lại email xác thực"}
              </button>
            </form>
          </details>
        )}

        {mode === "staff-invitation" && (
          <p className="mt-5 text-sm text-slate-600">
            Lời mời hết hạn? Liên hệ Admin để được gửi lại lời mời.
          </p>
        )}

        {/* Thanh liên kết điều hướng */}
        <nav className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs sm:text-sm">
          {mode !== "login" && (
            <Link
              href="/login"
              className="font-semibold text-purple-700 hover:text-purple-900 transition-colors"
            >
              ← Quay lại Đăng nhập
            </Link>
          )}
          {mode === "login" && (
            <>
              <Link
                href="/register"
                className="font-semibold text-purple-700 hover:text-purple-900 transition-colors"
              >
                Tạo tài khoản mới
              </Link>
              <Link
                href="/forgot-password"
                className="text-slate-500 hover:text-slate-800 transition-colors"
              >
                Quên mật khẩu?
              </Link>
            </>
          )}
          {mode === "reset-password" && (
            <Link
              href="/forgot-password"
              className="font-semibold text-purple-700 hover:text-purple-900 transition-colors"
            >
              Yêu cầu liên kết mới
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}
