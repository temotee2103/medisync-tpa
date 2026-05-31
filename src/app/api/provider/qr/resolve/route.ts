import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/config";
import { verifyMemberQrToken } from "@/lib/qr/token";
import type { ProviderResolveQrResponse } from "@/lib/qr/types";

type MemberResolveRow = {
  staff_id: string | null;
  full_name: string | null;
  company_id: string | null;
  nric_passport: string | null;
  passport_no: string | null;
};

async function auditScan({
  providerProfileId,
  memberProfileId,
  tokenJti,
  result,
  ip,
  userAgent,
}: {
  providerProfileId: string;
  memberProfileId: string | null;
  tokenJti: string | null;
  result: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const service = createServerClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
      },
    },
  });
  await service
    .schema("public")
    .from("qr_scan_audit")
    .insert({
      provider_profile_id: providerProfileId,
      member_profile_id: memberProfileId,
      token_jti: tokenJti,
      result,
      ip,
      user_agent: userAgent,
    });
}

export async function POST(request: Request) {
  const hdrs = await headers();
  const cookieStore = await cookies();
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
      },
    },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthenticated." } satisfies ProviderResolveQrResponse, {
      status: 401,
    });
  }
  const { data: isProvider } = await supabase.rpc("is_provider");
  if (!isProvider) {
    return NextResponse.json({ ok: false, error: "Access denied." } satisfies ProviderResolveQrResponse, {
      status: 403,
    });
  }

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." } satisfies ProviderResolveQrResponse, {
      status: 400,
    });
  }

  let memberProfileId: string | null = null;
  let tokenJti: string | null = null;
  try {
    const payload = verifyMemberQrToken(token);
    memberProfileId = payload.sub;
    tokenJti = payload.jti;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid token.";
    await auditScan({
      providerProfileId: userData.user.id,
      memberProfileId: null,
      tokenJti: null,
      result: message,
      ip: hdrs.get("x-forwarded-for"),
      userAgent: hdrs.get("user-agent"),
    });
    return NextResponse.json({ ok: false, error: message } satisfies ProviderResolveQrResponse, {
      status: 400,
    });
  }

  const service = createServerClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
      },
    },
  });

  const { data: memberRow, error: memberError } = await service
    .schema("public")
    .from("members")
    .select("staff_id, full_name, company_id, nric_passport, passport_no")
    .eq("profile_id", memberProfileId)
    .maybeSingle();

  if (memberError || !memberRow) {
    await auditScan({
      providerProfileId: userData.user.id,
      memberProfileId,
      tokenJti,
      result: "Member not found.",
      ip: hdrs.get("x-forwarded-for"),
      userAgent: hdrs.get("user-agent"),
    });
    return NextResponse.json({ ok: false, error: "Member not found." } satisfies ProviderResolveQrResponse, {
      status: 404,
    });
  }

  await auditScan({
    providerProfileId: userData.user.id,
    memberProfileId,
    tokenJti,
    result: "ok",
    ip: hdrs.get("x-forwarded-for"),
    userAgent: hdrs.get("user-agent"),
  });

  const typedRow = memberRow as MemberResolveRow;

  return NextResponse.json(
    {
      ok: true,
      memberId: memberProfileId,
      staffId: String(typedRow.staff_id || ""),
      fullName: String(typedRow.full_name || ""),
      companyId: String(typedRow.company_id || ""),
      nricPassport: typedRow.nric_passport ? String(typedRow.nric_passport) : undefined,
      passportNo: typedRow.passport_no ? String(typedRow.passport_no) : undefined,
    } satisfies ProviderResolveQrResponse,
    { status: 200 }
  );
}
