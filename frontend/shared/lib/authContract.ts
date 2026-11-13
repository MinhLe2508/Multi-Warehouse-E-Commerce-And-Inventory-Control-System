export type AccountAction = "verify-email" | "staff-invitation" | "reset-password";
export function passwordError(password: string, confirm: string): string | null {
  if (password.length < 8) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (new TextEncoder().encode(password).length > 72) return "Mật khẩu không được vượt quá 72 byte UTF-8.";
  if (password !== confirm) return "Mật khẩu nhập lại chưa khớp.";
  return null;
}
export function actionRequest(action: AccountAction, token: string, password: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Liên kết thiếu token hoặc token không hợp lệ. Hãy yêu cầu gửi lại liên kết.");
  return action === "reset-password"
    ? { path: "/auth/reset-password", body: { token, newPassword: password } }
    : { path: action === "staff-invitation" ? "/auth/activate-staff" : "/auth/verify-email", body: { token, password } };
}
export function apiErrorMessage(body: unknown, status: number): string {
  if (status >= 500) return "Hệ thống đang bận. Vui lòng thử lại sau.";
  if (body && typeof body === "object" && "message" in body) {
    const value = body.message;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.every(v => typeof v === "string")) return value.join(" ");
  }
  return `Yêu cầu không thành công (HTTP ${status}).`;
}
