import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseUrl } from "@/lib/supabase/config";

export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token || "";
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const body = await request.json();
    const res = await fetch(`${getSupabaseUrl()}/functions/v1/bulk_import_members`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text || "Edge Function error." };
    }

    return NextResponse.json(payload || {}, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import members.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
