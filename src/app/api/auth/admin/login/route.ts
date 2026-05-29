import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { username, password } = (await request.json()) as { username?: string; password?: string };

    const normalizedUsername = (username || "").trim();
    if (!normalizedUsername || !password) {
      return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: adminUserRow, error: adminUserError } = await admin
      .from("admin_users")
      .select("profile_id, status")
      .eq("admin_id", normalizedUsername)
      .maybeSingle();

    if (adminUserError || !adminUserRow?.profile_id) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }
    if ((adminUserRow.status || "").toLowerCase() === "disabled") {
      return NextResponse.json({ error: "Your account has been disabled." }, { status: 403 });
    }

    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("email, status")
      .eq("id", adminUserRow.profile_id)
      .maybeSingle();

    const email = profileRow?.email || "";
    if (profileError || !email) {
      return NextResponse.json({ error: "Admin login is not configured." }, { status: 401 });
    }
    if ((profileRow?.status || "").toLowerCase() === "disabled") {
      return NextResponse.json({ error: "Your account has been disabled." }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
    if (roleError) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: roleError.message }, { status: 403 });
    }
    if (!isAdmin) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Access denied. Admin only." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
