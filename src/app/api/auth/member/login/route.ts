import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { username, password } = (await request.json()) as { username?: string; password?: string };
    const normalizedStaffId = (username || "").trim();

    if (!normalizedStaffId || !password) {
      return NextResponse.json({ error: "Missing credentials." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: memberRow, error: memberError } = await admin
      .from("members")
      .select("profile_id, status")
      .ilike("staff_id", normalizedStaffId)
      .maybeSingle();

    if (memberError || !memberRow?.profile_id) {
      return NextResponse.json({ error: "Member record not found. Please contact admin." }, { status: 401 });
    }

    if ((memberRow.status || "").toLowerCase() === "disabled") {
      return NextResponse.json({ error: "Your account has been disabled. Please contact admin." }, { status: 403 });
    }

    const { data: profileRow, error: profileError } = await admin
      .from("profiles")
      .select("email, status")
      .eq("id", memberRow.profile_id)
      .maybeSingle();

    const email = profileRow?.email || "";
    if (profileError || !email) {
      return NextResponse.json({ error: "Member login is not configured. Please contact admin." }, { status: 401 });
    }

    if ((profileRow?.status || "").toLowerCase() === "disabled") {
      return NextResponse.json({ error: "Your account has been disabled. Please contact admin." }, { status: 403 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const { data: isMember, error: roleError } = await supabase.rpc("is_member");
    if (roleError || !isMember) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Access denied. Member only." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }
        : null,
      must_change_password: Boolean((data.user?.user_metadata as Record<string,unknown>)?.must_change_password),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
