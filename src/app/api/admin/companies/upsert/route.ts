import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidPhone, normalizePhoneInput } from "@/lib/phoneValidation";

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError) return NextResponse.json({ error: adminError.message }, { status: 403 });
    if (!isAdmin) return NextResponse.json({ error: "Admin only." }, { status: 403 });

    const body = (await request.json()) as Record<string, unknown>;
    const companyId = String(body.companyId || "").trim();
    const name = String(body.name || "").trim();
    const hrName = String(body.hrName || "").trim();
    const contactEmail = String(body.contactEmail || "").trim();
    const contactPhoneName = String(body.contactPhoneName || "").trim();
    const contactPhone = normalizePhoneInput(String(body.contactPhone || ""));
    const contactPhoneSecondaryName = String(body.contactPhoneSecondaryName || "").trim();
    const contactPhoneSecondary = normalizePhoneInput(String(body.contactPhoneSecondary || ""));
    if (!companyId || !name) return NextResponse.json({ error: "Missing company fields." }, { status: 400 });
    if (!hrName) return NextResponse.json({ error: "HR name is required." }, { status: 400 });
    if (!contactEmail || !isValidEmail(contactEmail)) {
      return NextResponse.json({ error: "HR contact email is required and must be valid." }, { status: 400 });
    }
    if (!contactPhoneName) {
      return NextResponse.json({ error: "Primary contact person name is required." }, { status: 400 });
    }
    if (!isValidPhone(contactPhone)) {
      return NextResponse.json({ error: "Primary contact phone format is invalid." }, { status: 400 });
    }
    if (contactPhoneSecondary && !contactPhoneSecondaryName) {
      return NextResponse.json({ error: "Second contact person name is required when a second contact phone is provided." }, { status: 400 });
    }
    if (contactPhoneSecondary && !isValidPhone(contactPhoneSecondary)) {
      return NextResponse.json({ error: "Second contact phone format is invalid." }, { status: 400 });
    }
    if (contactPhoneSecondaryName && !contactPhoneSecondary) {
      return NextResponse.json({ error: "Second contact phone is required when a second contact person name is provided." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const payload = {
      company_id: companyId,
      name,
      hr_name: hrName,
      status: String(body.status || "").toLowerCase() === "disabled" ? "disabled" : "active",
      registration_no: String(body.registrationNoNew || "").trim() || null,
      registration_no_old: String(body.registrationNoOld || "").trim() || null,
      tin_number: String(body.tinNumber || "").trim() || null,
      sst_number: String(body.sstNumber || "").trim() || null,
      ssm_file_name: String(body.ssmFileName || "").trim() || null,
      ssm_expiry_date: String(body.ssmExpiryDate || "").trim() || null,
      industry: String(body.industry || "").trim() || null,
      contact_email: contactEmail || null,
      contact_phone_name: contactPhoneName || null,
      contact_phone: contactPhone || null,
      contact_phone_secondary_name: contactPhoneSecondaryName || null,
      contact_phone_secondary: contactPhoneSecondary || null,
      address_line1: String(body.addressLine1 || "").trim() || null,
      address_line2: String(body.addressLine2 || "").trim() || null,
      city: String(body.city || "").trim() || null,
      state: String(body.state || "").trim() || null,
      postal_code: String(body.postalCode || "").trim() || null,
      country: "Malaysia",
      plan_config: (body.planConfig as unknown) || {},
    };

    const { error } = await admin.from("companies").upsert(payload, { onConflict: "company_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upsert company.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
