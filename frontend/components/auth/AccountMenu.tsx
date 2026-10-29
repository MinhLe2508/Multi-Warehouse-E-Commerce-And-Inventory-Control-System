"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { getHomeByRole } from "@/shared/lib/roleRedirect";
export default function AccountMenu() {
  const { session, ready, logout } = useAuthStore();
  const router = useRouter();
  if (!ready) return null;
  if (!session) return <Link href="/login" className="px-2 text-sm font-medium text-indigo-700">Đăng nhập</Link>;
  return <details className="relative text-sm"><summary className="max-w-32 cursor-pointer truncate px-2 text-indigo-700">{session.user.fullName}</summary><div className="absolute right-0 z-50 mt-3 grid w-52 gap-3 rounded-xl border bg-white p-4 shadow-lg">
    {session.user.role !== "CUSTOMER" && <Link href={getHomeByRole(session.user.role)}>Trang quản lý</Link>}
    <Link href="/change-password">Đổi mật khẩu</Link>
    <button className="text-left" onClick={async () => { await logout(); router.replace("/login"); }}>Đăng xuất</button>
  </div></details>;
}
