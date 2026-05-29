import type { AdminRole } from "@/lib/adminSession";

const ACCOUNTANT_ROUTE = "/admin/accountant";

const normalizeAdminPath = (path: string) => (path || "").replace(/\/+$/, "") || "/";

export const canAccessAdminRoute = (role: AdminRole, path: string) => {
  const normalized = normalizeAdminPath(path);
  if (!normalized.startsWith("/admin")) return false;
  return role === "super_admin" || role === "admin" || role === "accountant";
};

export const canOperateAccountantPage = (role: AdminRole) =>
  role === "super_admin" || role === "accountant";

export const canDeleteAdminResource = (role: AdminRole) => role === "super_admin";

export const isAdminReadOnly = (role: AdminRole, path: string) => {
  const normalized = normalizeAdminPath(path);
  if (role === "accountant" && normalized !== ACCOUNTANT_ROUTE) return true;
  if (role === "admin" && normalized === ACCOUNTANT_ROUTE) return true;
  return false;
};

export const canOperateAdminPage = (role: AdminRole, path: string) => {
  if (!canAccessAdminRoute(role, path)) return false;
  return !isAdminReadOnly(role, path);
};
