import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const body = (await request.json()) as { companyId?: string; staffId?: string; newPassword?: string };
    const companyId = (body.companyId || "").trim();
    const staffId = (body.staffId || "").trim();
    const newPassword = (body.newPassword || "").trim();
    if (!companyId || !staffId || !newPassword) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: companyRow, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (companyError) return NextResponse.json({ error: companyError.message }, { status: 400 });
    const companyUuid = companyRow?.id ? String(companyRow.id) : "";
    if (!companyUuid) return NextResponse.json({ error: "Company not found." }, { status: 404 });

    const { data: memberRow, error: memberError } = await admin
      .from("members")
      .select("profile_id")
      .eq("company_id", companyUuid)
      .eq("staff_id", staffId)
      .maybeSingle();
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 400 });
    const profileId = memberRow?.profile_id ? String(memberRow.profile_id) : "";
    if (!profileId) return NextResponse.json({ error: "Member profile not found." }, { status: 404 });

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profileId);
    if (authUserError) return NextResponse.json({ error: authUserError.message }, { status: 400 });
    const existingMetadata = (authUser.user?.user_metadata || {}) as Record<string, unknown>;

    const { error: resetError } = await admin.auth.admin.updateUserById(profileId, {
      password: newPassword,
      user_metadata: { ...existingMetadata, must_change_password: true },
    });
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
