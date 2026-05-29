import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });

    const body = (await request.json()) as { profileId?: string; adminId?: string };
    const profileId = (body.profileId || "").trim();
    const adminId = (body.adminId || "").trim();

    if (!profileId && !adminId) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }

    if (user?.id && profileId && String(user.id) === profileId) {
      return NextResponse.json({ error: "You cannot delete your own admin account." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const profileLookupId = profileId || "";

    if (profileLookupId) {
      const { error: roleError } = await admin
        .from("profile_roles")
        .delete()
        .eq("profile_id", profileLookupId)
        .eq("portal_key", "admin");
      if (roleError) return NextResponse.json({ error: roleError.message }, { status: 400 });

      const { error: adminUserError } = await admin.from("admin_users").delete().eq("profile_id", profileLookupId);
      if (adminUserError) return NextResponse.json({ error: adminUserError.message }, { status: 400 });

      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(profileLookupId);
      if (deleteAuthError) return NextResponse.json({ error: deleteAuthError.message }, { status: 400 });

      return NextResponse.json({ ok: true });
    }

    const { error: adminUserError } = await admin.from("admin_users").delete().eq("admin_id", adminId);
    if (adminUserError) return NextResponse.json({ error: adminUserError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete admin user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
