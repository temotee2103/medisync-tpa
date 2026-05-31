import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";
import { signMemberQrToken } from "@/lib/qr/token";

export async function GET() {
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

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthenticated." }, { status: 401 });
  }

  const { data: isMember } = await supabase.rpc("is_member");
  if (!isMember) return NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 });

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60;
  const jti = crypto.randomUUID();
  const token = signMemberQrToken({ sub: userData.user.id, exp, jti });

  return NextResponse.json({ ok: true, token, exp });
}
