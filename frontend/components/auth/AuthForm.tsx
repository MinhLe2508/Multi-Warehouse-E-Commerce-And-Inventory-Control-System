"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Eye, EyeOff,
  KeyRound, Layers3, LoaderCircle, LockKeyhole, Mail, PackageCheck, UserRound,
} from "lucide-react";
import { AuthError, authRequest } from "@/shared/lib/authApi";
import { actionRequest, passwordError, type AccountAction } from "@/shared/lib/authContract";
import { getSafeNextRoute } from "@/shared/lib/roleRedirect";
import { authenticatedRequest, useAuthStore } from "@/store/useAuthStore";
import styles from "./AuthForm.module.css";

type Mode = AccountAction | "login" | "register" | "forgot-password" | "change-password";

const views = {
  login: { title: "Đăng nhập", description: "Truy cập tài khoản MultiMart của bạn.", submit: "Đăng nhập", icon: UserRound },
  register: { title: "Tạo tài khoản", description: "Bắt đầu với Gmail. Chúng mình sẽ gửi liên kết để bạn xác thực và tạo mật khẩu.", submit: "Gửi Email xác thực", icon: UserRound },
  "verify-email": { title: "Thiết lập mật khẩu", description: "Tạo mật khẩu để xác thực Gmail và hoàn tất đăng ký MultiMart.", submit: "Xác thực Email", icon: KeyRound },
  "staff-invitation": { title: "Kích hoạt tài khoản nhân viên", description: "Thiết lập mật khẩu để truy cập khu vực làm việc của MultiMart.", submit: "Kích hoạt tài khoản", icon: KeyRound },
  "reset-password": { title: "Đặt lại mật khẩu", description: "Chọn mật khẩu mới cho tài khoản MultiMart của bạn.", submit: "Lưu mật khẩu mới", icon: KeyRound },
  "forgot-password": { title: "Quên mật khẩu", description: "Nhập Gmail đã đăng ký để nhận liên kết đặt lại mật khẩu.", submit: "Gửi liên kết", icon: Mail },
  "change-password": { title: "Đổi mật khẩu", description: "Nhập mật khẩu hiện tại để thiết lập mật khẩu mới.", submit: "Lưu mật khẩu mới", icon: LockKeyhole },
} as const;

function Field({ name, label, type = "text", autoComplete, optional, placeholder, maxLength, defaultValue, describedBy }: {
  name: string; label: string; type?: string; autoComplete?: string; optional?: boolean;
  placeholder?: string; maxLength?: number; defaultValue?: string; describedBy?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}{optional && <span>Không bắt buộc</span>}</label>
      <div className={styles.inputWrap}>
        <input id={id} name={name} type={shown ? "text" : type} required={!optional}
          autoComplete={autoComplete} placeholder={placeholder} maxLength={maxLength}
          defaultValue={defaultValue} aria-describedby={describedBy}
          autoCapitalize={autoComplete === "username" || type === "email" ? "none" : undefined}
          spellCheck={isPassword || autoComplete === "username" || type === "email" ? false : undefined}
          className={isPassword ? styles.passwordInput : undefined} />
        {isPassword && <button type="button" className={styles.showPassword}
          aria-label={shown ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={shown}
          onClick={() => setShown(!shown)}>
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>}
      </div>
    </div>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const router = useRouter();
  const firstLogin = useAuthStore(state => !!state.session?.user.mustChangePassword);
  const token = params.get("token") || "";
  const action = mode === "verify-email" || mode === "staff-invitation" || mode === "reset-password";
  const createsPassword = action || mode === "change-password";
  const validLink = !action || /^[0-9a-f]{64}$/.test(token);
  const showResend = mode === "verify-email" || mode === "register" || mode === "login";
  const [busy, setBusy] = useState<"submit" | "resend" | null>(null);
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const view = views[mode];
  const finished = done && !sentTo;
  const title = sentTo ? "Kiểm tra hộp thư Gmail" : finished ? "Hoàn tất" :
    mode === "change-password" && firstLogin ? "Đổi mật khẩu lần đầu" : view.title;
  const Icon = sentTo ? Mail : finished ? CheckCircle2 : view.icon;

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !validLink || (mode === "forgot-password" && cooldown)) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "");
    const email = value("email").trim();
    const phone = value("phone").trim();
    setError("");
    setMessage("");

    if (mode === "register" && phone && !/^(0\d{9}|\+84\d{9})$/.test(phone)) {
      setError("Nhập số điện thoại theo dạng 0xxxxxxxxx hoặc +84xxxxxxxxx.");
      return;
    }
    if (createsPassword) {
      const problem = passwordError(value("password"), value("confirmPassword"));
      if (problem) {
        setError(problem);
        return;
      }
    }

    pending.current = true;
    setBusy("submit");
    try {
      if (mode === "login") {
        const session = await useAuthStore.getState().login(value("username").trim(), value("password"));
        router.replace(session.user.mustChangePassword ? "/change-password" :
          getSafeNextRoute(session.user.role, params.get("next")));
      } else if (action) {
        const request = actionRequest(mode, token, value("password"));
        const result = await authRequest<{ message: string }>(request.path, request.body);
        setMessage(result.message);
        setDone(true);
        window.history.replaceState(null, "", window.location.pathname);
      } else if (mode === "register") {
        await authRequest("/auth/register", { email, fullName: value("fullName").trim(), ...(phone && { phone }) });
        setSentTo(email);
        setDone(true);
      } else if (mode === "forgot-password") {
        const result = await authRequest<{ message: string }>("/auth/forgot-password", { email });
        setMessage(result.message);
        setCooldown(60);
      } else {
        await authenticatedRequest("/auth/change-password", {
          currentPassword: value("currentPassword"), newPassword: value("password"),
        });
        await useAuthStore.getState().logout();
        setMessage("Đã lưu mật khẩu mới. Hãy đăng nhập lại để tiếp tục.");
        setDone(true);
      }
    } catch (cause) {
      if (mode === "login" && cause instanceof AuthError && cause.status === 401) {
        setError("Tên đăng nhập, Gmail hoặc mật khẩu không chính xác.");
      } else {
        setError(cause instanceof Error ? cause.message : "Có lỗi xảy ra. Vui lòng thử lại.");
      }
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || cooldown) return;
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    pending.current = true;
    setBusy("resend");
    setError("");
    setMessage("");
    try {
      const result = await authRequest<{ message: string }>("/auth/resend-verification", { email });
      setMessage(result.message);
      setCooldown(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không gửi được Email.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={styles.brand}>
          <Link href="/" className={styles.wordmark} aria-label="MultiMart, về trang chủ">
            <span><Layers3 size={22} aria-hidden="true" /></span>MultiMart
          </Link>
          <div className={styles.brandCopy}>
            <p>Công nghệ cho<br />mỗi ngày</p>
            <Link href="/products">Khám phá sản phẩm <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className={styles.brandFoot}><PackageCheck size={18} aria-hidden="true" /> Mua sắm và theo dõi đơn hàng trên MultiMart</div>
        </aside>
        <section className={styles.panel} aria-labelledby="auth-heading">
          <Link href="/" className={styles.home}><ArrowLeft size={16} aria-hidden="true" /> Về trang chủ</Link>
          <div className={styles.heading}>
            <span className={styles.icon}><Icon size={22} aria-hidden="true" /></span>
            <h1 id="auth-heading">{title}</h1>
            {sentTo ? <p>Email xác thực đã được gửi tới <strong>{sentTo}</strong>. Mở liên kết trong thư để đặt mật khẩu.</p> :
              !finished && <p>{view.description}</p>}
          </div>

          {error && <div role="alert" className={styles.error}><CircleAlert size={18} aria-hidden="true" />{error}</div>}
          {message && <div role="status" className={styles.notice}><CheckCircle2 size={18} aria-hidden="true" />{message}</div>}
          {!validLink && !done && <div role="alert" className={styles.error}>
            <CircleAlert size={18} aria-hidden="true" /> Mở liên kết mới nhất trong Email để tiếp tục.
          </div>}

          {!done && validLink && <form onSubmit={submit} className={styles.form}>
            {mode === "login" && <Field name="username" label="Tên đăng nhập hoặc Gmail" autoComplete="username"
              placeholder="Tên đăng nhập hoặc Gmail" maxLength={254} />}
            {mode === "register" && <Field name="fullName" label="Họ và tên" autoComplete="name" maxLength={150} />}
            {(mode === "register" || mode === "forgot-password") && <Field name="email" label="Gmail" type="email"
              autoComplete="email" placeholder="ban@gmail.com" maxLength={254} />}
            {mode === "register" && <Field name="phone" label="Số điện thoại" type="tel" autoComplete="tel" optional maxLength={20} />}
            {mode === "change-password" && <Field name="currentPassword" label="Mật khẩu hiện tại" type="password" autoComplete="current-password" />}
            {(mode === "login" || createsPassword) && <Field name="password" label={mode === "login" ? "Mật khẩu" : "Mật khẩu mới"}
              type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
              describedBy={createsPassword ? "auth-password-rule" : undefined} />}
            {createsPassword && <>
              <Field name="confirmPassword" label="Nhập lại mật khẩu mới" type="password" autoComplete="new-password" />
              <p id="auth-password-rule" className={styles.hint}>Ít nhất 8 ký tự, tối đa 72 byte UTF-8.</p>
            </>}
            {mode === "login" && <Link className={styles.forgot} href="/forgot-password">Quên mật khẩu?</Link>}
            <button type="submit" disabled={!!busy || (mode === "forgot-password" && cooldown > 0)} className={styles.primary}>
              {busy === "submit" ? <><LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> Đang xử lý…</> :
                mode === "forgot-password" && cooldown ? `Gửi lại sau ${cooldown}s` : <>{view.submit} <ArrowRight size={17} aria-hidden="true" /></>}
            </button>
          </form>}

          {sentTo && <a className={styles.primary} href="https://mail.google.com/" target="_blank" rel="noreferrer">
            Mở Gmail <ArrowRight size={17} aria-hidden="true" />
          </a>}
          {finished && <Link className={styles.primary} href="/login">Đến trang đăng nhập <ArrowRight size={17} aria-hidden="true" /></Link>}

          {showResend && !finished && <details className={styles.resend}>
            <summary>Chưa nhận được Email hoặc liên kết hết hạn? <span aria-hidden="true">▾</span></summary>
            <form className={styles.form} onSubmit={resend}>
              <Field name="email" label="Gmail đã đăng ký" type="email" defaultValue={sentTo}
                autoComplete="email" placeholder="ban@gmail.com" maxLength={254} />
              <button type="submit" className={styles.secondary} disabled={!!busy || cooldown > 0}>
                {busy === "resend" ? "Đang gửi…" : cooldown ? `Gửi lại sau ${cooldown}s` : "Gửi lại Email xác thực"}
              </button>
            </form>
          </details>}
          {mode === "staff-invitation" && !done && <p className={styles.hint}>Lời mời hết hạn? Liên hệ quản trị viên để nhận liên kết mới.</p>}

          {!finished && <nav className={styles.nav} aria-label="Tài khoản">
            {mode === "login" ? <p>Chưa có tài khoản? <Link href="/register">Tạo tài khoản</Link></p> :
              <Link href="/login">Quay lại đăng nhập</Link>}
            {mode === "reset-password" && <Link href="/forgot-password">Yêu cầu liên kết mới</Link>}
          </nav>}
        </section>
      </div>
    </main>
  );
}
