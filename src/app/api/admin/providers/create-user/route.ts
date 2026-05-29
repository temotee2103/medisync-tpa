import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const isDoctorRole = (value: string) => value.trim().toLowerCase() === "doctor";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const body = (await request.json()) as {
      vendorId?: string;
      memberCode?: string;
      fullName?: string;
      email?: string;
      password?: string;
      role?: string;
      phone?: string;
      status?: "active" | "disabled" | "pending";
    };

    const vendorId = (body.vendorId || "").trim();
    const memberCode = (body.memberCode || "").trim();
    const fullName = (body.fullName || "").trim();
    const email = (body.email || "").trim();
    const password = (body.password || "").trim();

    if (!vendorId || !memberCode || !fullName || !email) {
      return NextResponse.json({ error: "Missing provider user fields." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    const { data: providerRow, error: providerError } = await admin
      .from("providers")
      .select("id")
      .eq("vendor_id", vendorId)
      .maybeSingle();

    if (providerError) return NextResponse.json({ error: providerError.message }, { status: 400 });
    if (!providerRow?.id) return NextResponse.json({ error: "Provider not found." }, { status: 404 });

    const { data: existingProviderUser, error: existingProviderUserError } = await admin
      .from("provider_users")
      .select("profile_id")
      .eq("provider_id", providerRow.id)
      .eq("member_code", memberCode)
      .maybeSingle();

    if (existingProviderUserError) {
      return NextResponse.json({ error: existingProviderUserError.message }, { status: 400 });
    }

    const { data: existingProfile, error: existingProfileError } = await admin
      .from("profiles")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();

    if (existingProfileError) return NextResponse.json({ error: existingProfileError.message }, { status: 400 });

    let profileId = existingProviderUser?.profile_id ? String(existingProviderUser.profile_id) : "";
    if (!profileId && existingProfile?.id) profileId = String(existingProfile.id);

    if (!profileId && !password) {
      return NextResponse.json(
        { error: "Password is required for new provider member login." },
        { status: 400 }
      );
    }

    if (!profileId) {
      const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, default_portal: "provider", must_change_password: true },
      });
      if (createUserError) return NextResponse.json({ error: createUserError.message }, { status: 400 });
      profileId = createdUser.user?.id ? String(createdUser.user.id) : "";
      if (!profileId) return NextResponse.json({ error: "Failed to create auth user." }, { status: 500 });
    } else {
      if (existingProfile?.email && String(existingProfile.email).toLowerCase() !== email.toLowerCase()) {
        return NextResponse.json({ error: "Email mismatch for existing provider user." }, { status: 400 });
      }
      if (password) {
        const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profileId);
        if (authUserError) return NextResponse.json({ error: authUserError.message }, { status: 400 });
        const existingMetadata = (authUser.user?.user_metadata || {}) as Record<string, unknown>;
        const { error: updateAuthError } = await admin.auth.admin.updateUserById(profileId, {
          password,
          user_metadata: {
            ...existingMetadata,
            full_name: fullName,
            default_portal: "provider",
            must_change_password: true,
          },
        });
        if (updateAuthError) return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
      }
    }

    const { error: roleError } = await admin.from("profile_roles").upsert(
      [{ profile_id: profileId, portal_key: "provider", role_key: body.role || "provider_user", is_primary: true }],
      { onConflict: "profile_id,role_key" }
    );

    if (roleError) return NextResponse.json({ error: roleError.message }, { status: 400 });

    const { data: providerUserRow, error: providerUserError } = await admin
      .from("provider_users")
      .upsert(
        [
          {
            provider_id: providerRow.id,
            member_code: memberCode,
            full_name: fullName,
            email,
            phone: body.phone || null,
            role: body.role || "provider_user",
            status: body.status || "active",
            profile_id: profileId,
          },
        ],
        { onConflict: "provider_id,member_code" }
      )
      .select("id")
      .maybeSingle();

    if (providerUserError) return NextResponse.json({ error: providerUserError.message }, { status: 400 });

    const providerUserId = providerUserRow?.id ? String(providerUserRow.id) : "";
    let requiresApcUpload = false;

    if (providerUserId && isDoctorRole(String(body.role || ""))) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: approvedApc, error: approvedApcError } = await admin
        .from("provider_credentials")
        .select("id")
        .eq("provider_user_id", providerUserId)
        .eq("credential_type", "apc")
        .eq("status", "approved")
        .or(`expiry_date.is.null,expiry_date.gte.${today}`)
        .maybeSingle();

      if (approvedApcError) {
        return NextResponse.json({ error: approvedApcError.message }, { status: 400 });
      }

      requiresApcUpload = !approvedApc?.id;
    }

    return NextResponse.json({
      ok: true,
      profileId,
      providerUserId: providerUserId || null,
      requiresApcUpload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create provider user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
