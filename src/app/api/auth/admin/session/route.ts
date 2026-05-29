import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminRole = "super_admin" | "admin" | "accountant";

const toAdminRole = (value: unknown): AdminRole => {
  if (value === "super_admin" || value === "admin" || value === "accountant") return value;
  return "accountant";
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const profileId = String(user.id);
    const admin = createSupabaseAdminClient();

    const { data: adminRow, error: adminError } = await admin
      .from("admin_users")
      .select("admin_id, full_name, status")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (adminError || !adminRow?.admin_id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (String(adminRow.status || "").toLowerCase() === "disabled") {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    const { data: roleRows, error: roleError } = await admin
      .from("profile_roles")
      .select("role_key, is_primary, created_at")
      .eq("profile_id", profileId)
      .eq("portal_key", "admin")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    const role = toAdminRole(roleRows?.[0]?.role_key);

    return NextResponse.json({
      profileId,
      adminId: String(adminRow.admin_id),
      fullName: String(adminRow.full_name || ""),
      role,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load admin session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

