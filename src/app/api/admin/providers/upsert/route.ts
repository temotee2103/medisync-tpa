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
      vendorId?: string;
      providerName?: string;
      status?: "active" | "disabled";
      email?: string;
      phone?: string;
      contactEmail?: string;
      contactPhone?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
      complianceStatus?: string;
    };

    if (!body.vendorId || !body.providerName) {
      return NextResponse.json({ error: "Missing provider fields." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const payload = {
      vendor_id: body.vendorId.trim(),
      provider_name: body.providerName.trim(),
      status: body.status || "active",
      email: body.email || null,
      phone: body.phone || null,
      contact_email: body.contactEmail || null,
      contact_phone: body.contactPhone || null,
      address_line1: body.addressLine1 || null,
      address_line2: body.addressLine2 || null,
      city: body.city || null,
      state: body.state || null,
      postal_code: body.postalCode || null,
      country: body.country || "Malaysia",
      compliance_status: body.complianceStatus || null,
    };

    const { data, error } = await admin.from("providers").upsert(payload, { onConflict: "vendor_id" }).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, providerId: data?.id || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save provider.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

