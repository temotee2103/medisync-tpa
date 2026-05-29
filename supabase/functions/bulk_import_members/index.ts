import { createClient } from "@supabase/supabase-js";

type ImportRow = {
  rowNumber: number;
  type: "primary" | "dependent";
  staffId: string;
  parentStaffId?: string;
  relationship?: string;
  fullName: string;
  gender: string;
  idType: string;
  nricPassport: string;
  nationality: string;
  status: string;
  phoneCountryCode: string;
  phone: string;
  dob: string;
  passportExpiry: string;
  passportFileName: string;
  email?: string;
  tempPassword?: string;
  planType: string;
  lumpSumLimit: string;
  categoryEnabled: Record<string, string>;
  categoryLimits: Record<string, string>;
};

type Payload = {
  companyId: string;
  mode: "upsert";
  rows: ImportRow[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requireEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
};

const normalizePhone = (countryCode: string, phone: string) => {
  const cc = (countryCode || "").trim();
  const p = (phone || "").trim();
  return [cc, p].filter(Boolean).join(" ").trim() || null;
};

const parseDate = (value: string) => {
  const raw = (value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const toStatus = (value: string) => {
  const raw = (value || "").trim().toLowerCase();
  return raw === "disabled" ? "disabled" : "active";
};

const normalizeImportKeyPart = (value: string) =>
  (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/:+/g, ":");

const buildDependentImportKey = (row: ImportRow) => {
  const relationship = normalizeImportKeyPart(String(row.relationship || ""));
  const name = normalizeImportKeyPart(row.fullName);
  const id = normalizeImportKeyPart(row.nricPassport);
  const parts = [relationship, name, id].filter(Boolean);
  return parts.length === 3 ? `${relationship}:${name}:${id}` : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json(401, { error: "Missing Authorization" });

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc("is_admin");
    if (adminCheckError) return json(403, { error: adminCheckError.message });
    if (!isAdmin) return json(403, { error: "Admin only" });

    const payload = (await req.json()) as Payload;
    if (!payload?.companyId || payload.mode !== "upsert") return json(400, { error: "Invalid payload" });
    if (!Array.isArray(payload.rows) || payload.rows.length === 0) return json(400, { error: "No rows" });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: companyRow, error: companyError } = await adminClient
      .from("companies")
      .select("id, company_id")
      .eq("company_id", payload.companyId)
      .maybeSingle();

    if (companyError) return json(400, { error: companyError.message });
    if (!companyRow) return json(404, { error: "Company not found" });

    const companyUuid = String(companyRow.id);

    const primaryRows = payload.rows.filter((r) => r.type === "primary");
    const dependentRows = payload.rows.filter((r) => r.type === "dependent");

    const primaryStaffIds = primaryRows.map((r) => r.staffId.trim()).filter(Boolean);
    const dependentParentIds = dependentRows.map((r) => (r.parentStaffId || "").trim()).filter(Boolean);
    const allStaffIdsToLookup = Array.from(new Set([...primaryStaffIds, ...dependentParentIds]));

    const { data: existingMembers, error: existingMembersError } = await adminClient
      .from("members")
      .select("id, staff_id, profile_id")
      .eq("company_id", companyUuid)
      .in("staff_id", allStaffIdsToLookup);

    if (existingMembersError) return json(400, { error: existingMembersError.message });

    const existingByStaffId = new Map<string, { id: string; staff_id: string; profile_id: string | null }>();
    for (const m of existingMembers || []) {
      existingByStaffId.set(String(m.staff_id).toLowerCase(), {
        id: String(m.id),
        staff_id: String(m.staff_id),
        profile_id: m.profile_id ? String(m.profile_id) : null,
      });
    }

    const results: Array<{ rowNumber: number; status: "ok" | "error"; message?: string; action?: "create" | "update" }> =
      [];
    let created = 0;
    let updated = 0;

    for (const row of primaryRows) {
      const staffId = row.staffId.trim();
      const existing = existingByStaffId.get(staffId.toLowerCase()) || null;

      const email = (row.email || "").trim();
      const password = (row.tempPassword || "").trim();

      if (!staffId) {
        results.push({ rowNumber: row.rowNumber, status: "error", message: "Missing staffId" });
        continue;
      }

      if (!email) {
        results.push({ rowNumber: row.rowNumber, status: "error", message: "Primary email required" });
        continue;
      }

      let profileId = existing?.profile_id || null;
      if (!profileId) {
        if (!password) {
          results.push({ rowNumber: row.rowNumber, status: "error", message: "Primary tempPassword required" });
          continue;
        }

        const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: row.fullName, default_portal: "member", must_change_password: true },
        });

        if (createUserError) {
          results.push({ rowNumber: row.rowNumber, status: "error", message: createUserError.message });
          continue;
        }

        profileId = createdUser.user?.id ? String(createdUser.user.id) : null;
        if (!profileId) {
          results.push({ rowNumber: row.rowNumber, status: "error", message: "Failed to create auth user" });
          continue;
        }

        const { error: roleError } = await adminClient.from("profile_roles").upsert(
          [{ profile_id: profileId, portal_key: "member", role_key: "member_user", is_primary: true }],
          { onConflict: "profile_id,role_key" }
        );
        if (roleError) {
          results.push({ rowNumber: row.rowNumber, status: "error", message: roleError.message });
          continue;
        }
      }

      const planSelection = row.planType === "category" ? row.categoryEnabled : {};
      const planLimits = row.planType === "category" ? row.categoryLimits : {};

      const memberPayload = {
        company_id: companyUuid,
        staff_id: staffId,
        full_name: row.fullName.trim(),
        email,
        phone: normalizePhone(row.phoneCountryCode, row.phone),
        nationality: (row.nationality || "").trim() || "Malaysia",
        nric_passport: (row.nricPassport || "").trim() || null,
        passport_expiry: row.idType === "Passport" ? parseDate(row.passportExpiry) : null,
        status: toStatus(row.status),
        profile_id: profileId,
        dob: parseDate(row.dob),
        gender: (row.gender || "").trim() || null,
        relationship: "Employee",
        passport_no: row.idType === "Passport" ? (row.nricPassport || "").trim() || null : null,
        passport_file_path: row.idType === "Passport" ? (row.passportFileName || "").trim() || null : null,
        plan_selection: planSelection,
        plan_limits: planLimits,
      };

      const { error: upsertError } = await adminClient.from("members").upsert(memberPayload, {
        onConflict: "company_id,staff_id",
      });

      if (upsertError) {
        results.push({ rowNumber: row.rowNumber, status: "error", message: upsertError.message });
        continue;
      }

      results.push({ rowNumber: row.rowNumber, status: "ok", action: existing ? "update" : "create" });
      if (existing) updated += 1;
      else created += 1;
    }

    const { data: refreshedMembers, error: refreshedError } = await adminClient
      .from("members")
      .select("id, staff_id")
      .eq("company_id", companyUuid)
      .in("staff_id", Array.from(new Set([...primaryStaffIds, ...dependentParentIds])));

    if (refreshedError) return json(400, { error: refreshedError.message });

    const parentIdByStaffId = new Map<string, string>();
    for (const m of refreshedMembers || []) parentIdByStaffId.set(String(m.staff_id).toLowerCase(), String(m.id));

    const parentMemberIds = Array.from(new Set(Array.from(parentIdByStaffId.values())));
    const { data: existingDependents, error: existingDependentsError } = parentMemberIds.length
      ? await adminClient
          .from("dependents")
          .select("id, member_id, import_key")
          .in("member_id", parentMemberIds)
          .not("import_key", "is", null)
      : { data: [], error: null };

    if (existingDependentsError) return json(400, { error: existingDependentsError.message });

    const dependentKeySet = new Set<string>();
    for (const d of existingDependents || []) {
      const memberId = String(d.member_id);
      const importKey = String(d.import_key || "");
      if (!importKey) continue;
      dependentKeySet.add(`${memberId}:${importKey}`);
    }

    for (const row of dependentRows) {
      const parentStaffId = (row.parentStaffId || "").trim();
      const parentMemberId = parentIdByStaffId.get(parentStaffId.toLowerCase()) || null;
      if (!parentMemberId) {
        results.push({ rowNumber: row.rowNumber, status: "error", message: `Parent not found: ${parentStaffId}` });
        continue;
      }

      const importKey = buildDependentImportKey(row);
      if (!importKey) {
        results.push({ rowNumber: row.rowNumber, status: "error", message: "Unable to build dependent import_key" });
        continue;
      }

      const dependentPayload = {
        member_id: parentMemberId,
        import_key: importKey,
        full_name: row.fullName.trim(),
        relationship: String(row.relationship || "").trim(),
        gender: (row.gender || "").trim() || null,
        nric_passport: (row.nricPassport || "").trim() || null,
        dob: parseDate(row.dob),
        status: toStatus(row.status),
        nationality: (row.nationality || "").trim() || "Malaysia",
        passport_no: row.idType === "Passport" ? (row.nricPassport || "").trim() || null : null,
        passport_expiry_date: row.idType === "Passport" ? parseDate(row.passportExpiry) : null,
        passport_file_path: row.idType === "Passport" ? (row.passportFileName || "").trim() || null : null,
      };

      const existed = dependentKeySet.has(`${parentMemberId}:${importKey}`);

      const { error: upsertDepError } = await adminClient.from("dependents").upsert(dependentPayload, {
        onConflict: "member_id,import_key",
      });

      if (upsertDepError) {
        results.push({ rowNumber: row.rowNumber, status: "error", message: upsertDepError.message });
        continue;
      }

      results.push({ rowNumber: row.rowNumber, status: "ok", action: existed ? "update" : "create" });
      if (existed) updated += 1;
      else created += 1;
    }

    return json(200, { created, updated, results });
  } catch (e: unknown) {
    return json(500, { error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
