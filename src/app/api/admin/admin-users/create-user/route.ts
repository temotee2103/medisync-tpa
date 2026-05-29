import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const body = (await request.json()) as {
      adminId?: string;
      fullName?: string;
      email?: string;
      password?: string;
      role?: "super_admin" | "admin" | "accountant";
      status?: "active" | "disabled" | "pending";
    };

    const adminId = (body.adminId || "").trim();
    const fullName = (body.fullName || "").trim();
    const email = (body.email || "").trim();
    const password = (body.password || "").trim();
    const role =
      body.role === "super_admin" || body.role === "admin" || body.role === "accountant"
        ? body.role
        : "accountant";

    if (!adminId || !fullName || !email || !password) {
      return NextResponse.json({ error: "Missing admin user fields." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, default_portal: "admin", must_change_password: true },
    });

    if (createUserError) return NextResponse.json({ error: createUserError.message }, { status: 400 });

    const profileId = createdUser.user?.id ? String(createdUser.user.id) : "";
    if (!profileId) return NextResponse.json({ error: "Failed to create auth user." }, { status: 500 });

    const { error: roleError } = await admin.from("profile_roles").upsert(
      [{ profile_id: profileId, portal_key: "admin", role_key: role, is_primary: true }],
      { onConflict: "profile_id,role_key" }
    );
    if (roleError) return NextResponse.json({ error: roleError.message }, { status: 400 });

    const { error: adminUserError } = await admin.from("admin_users").upsert(
      [
        {
          admin_id: adminId,
          full_name: fullName,
          role,
          status: body.status || "active",
          profile_id: profileId,
          email,
        },
      ],
      { onConflict: "admin_id" }
    );

    if (adminUserError) return NextResponse.json({ error: adminUserError.message }, { status: 400 });

    return NextResponse.json({ ok: true, profileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create admin user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
