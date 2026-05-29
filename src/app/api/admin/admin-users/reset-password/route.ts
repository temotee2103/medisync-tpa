import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const body = (await request.json()) as { profileId?: string; newPassword?: string };
    const profileId = (body.profileId || "").trim();
    const newPassword = (body.newPassword || "").trim();

    if (!profileId || !newPassword) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profileId);
    if (authUserError) return NextResponse.json({ error: authUserError.message }, { status: 400 });

    const existingMetadata = (authUser.user?.user_metadata || {}) as Record<string, unknown>;
    const { error: resetError } = await admin.auth.admin.updateUserById(profileId, {
      password: newPassword,
      user_metadata: {
        ...existingMetadata,
        default_portal: "admin",
        must_change_password: true,
      },
    });
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset admin password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
