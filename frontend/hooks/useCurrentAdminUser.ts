"use client";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import type { AdminRole } from "@/shared/config/adminNav";
export interface AdminUser { id: string; name: string; email: string; role: AdminRole | "CUSTOMER"; avatarUrl?: string | null; avatarText: string; subtitle: string; assignedWarehouseId?: string }
export function useCurrentAdminUser() {
  const router = useRouter();
  const { session, ready, logout: endSession } = useAuthStore();
  const role = session?.user.role ?? "CUSTOMER";
  const name = session?.user.fullName ?? "Khách";
  const user: AdminUser = { id: session?.user.id ?? "", name, email: session?.user.email ?? "", role,
    avatarText: name.slice(0, 2).toUpperCase(), subtitle: role === "ADMIN" ? "Quản trị viên" : role === "WAREHOUSE_STAFF" ? "Nhân viên kho" : "Khách hàng" };
  return { user, role, ready, authenticated: !!session, mustChangePassword: session?.user.mustChangePassword ?? false,
    isAdmin: role === "ADMIN", isStaff: role === "WAREHOUSE_STAFF", isCustomer: role === "CUSTOMER",
    logout: async () => { await endSession(); router.replace("/login"); },
  };
}
