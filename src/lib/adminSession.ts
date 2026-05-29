import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/lib/basePath";

export type AdminRole = "super_admin" | "admin" | "accountant";

export type AdminSession = {
  profileId: string;
  adminId: string;
  fullName: string;
  role: AdminRole;
};

export type AdminDirectoryEntry = {
  profileId?: string;
  adminId: string;
  fullName: string;
  role: AdminRole;
  contactPhone?: string;
  contactPhoneSecondary?: string;
  status: "Active" | "Disabled";
};

const toAdminRole = (value: unknown): AdminRole => {
  if (value === "super_admin" || value === "admin" || value === "accountant") return value;
  return "accountant";
};

const toUiStatus = (value: unknown): "Active" | "Disabled" => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "disabled") return "Disabled";
  return "Active";
};

export const fetchAdminSession = async (): Promise<AdminSession | null> => {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(withBasePath("/api/auth/admin/session"));
    if (response.ok) {
      const payload = (await response.json()) as Partial<AdminSession>;
      if (payload.profileId && payload.adminId) {
        return {
          profileId: String(payload.profileId),
          adminId: String(payload.adminId),
          fullName: String(payload.fullName || ""),
          role: toAdminRole(payload.role),
        };
      }
    }
  } catch {
    // fallthrough
  }

  try {
    const supabase = createSupabaseBrowserClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const user = userData.user;
    if (!user) return null;

    const profileId = String(user.id);

    const { data: adminRow, error: adminError } = await supabase
      .from("admin_users")
      .select("admin_id, full_name, status")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (adminError) throw adminError;
    if (!adminRow?.admin_id) return null;

    const { data: roleRows, error: roleError } = await supabase
      .from("profile_roles")
      .select("role_key, is_primary, created_at")
      .eq("profile_id", profileId)
      .eq("portal_key", "admin")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (roleError) throw roleError;

    const role = toAdminRole(roleRows?.[0]?.role_key);

    return {
      profileId,
      adminId: String(adminRow.admin_id),
      fullName: String(adminRow.full_name || ""),
      role,
    };
  } catch {
    return null;
  }
};

export const fetchAdminDirectory = async (): Promise<AdminDirectoryEntry[]> => {
  if (typeof window === "undefined") return [];
  const supabase = createSupabaseBrowserClient();
  const { data: adminRows, error: adminError } = await supabase
    .from("admin_users")
    .select("admin_id, full_name, status, profile_id")
    .order("admin_id", { ascending: true });

  if (adminError) throw adminError;
  const rows = adminRows || [];

  const profileIds = Array.from(
    new Set(rows.map((row) => (row.profile_id ? String(row.profile_id) : "")).filter(Boolean))
  );

  const roleByProfileId = new Map<string, AdminRole>();
  if (profileIds.length > 0) {
    const { data: roleRows, error: roleError } = await supabase
      .from("profile_roles")
      .select("profile_id, role_key, is_primary, created_at")
      .eq("portal_key", "admin")
      .in("profile_id", profileIds)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (roleError) throw roleError;
    (roleRows || []).forEach((row) => {
      const profileId = String(row.profile_id || "");
      if (!profileId || roleByProfileId.has(profileId)) return;
      roleByProfileId.set(profileId, toAdminRole(row.role_key));
    });
  }

  return rows.map((row) => {
    const profileId = row.profile_id ? String(row.profile_id) : undefined;
    return {
      profileId,
      adminId: String(row.admin_id),
      fullName: String(row.full_name || ""),
      role: profileId ? roleByProfileId.get(profileId) || "accountant" : "accountant",
      status: toUiStatus(row.status),
    };
  });
};
