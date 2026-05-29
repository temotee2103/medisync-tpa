import type { CompanyPlanType } from "@/lib/companyStore";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type MemberSession = {
  memberId: string;
  fullName: string;
  companyId: string;
  staffId: string;
  requiresPasswordChange?: boolean;
};

export type MemberDirectoryEntry = {
  companyId: string;
  staffId: string;
  fullName: string;
  email: string;
  status: "Active" | "Disabled";
  memberType?: "primary" | "dependent";
  parentStaffId?: string;
  memberUuid?: string;
  profileId?: string;
  companyUuid?: string;
  dob?: string;
  gender?: "Male" | "Female";
  relationship?: "Employee" | "Spouse" | "Child" | "Parent";
  phone?: string;
  passportExpiry?: string;
  passportNo?: string;
  nationality?: string;
  nricPassport?: string;
  passportFileName?: string;
  planType?: CompanyPlanType;
  lumpSumLimit?: number;
  familyLumpSumLimit?: number;
  planSelection?: Record<string, boolean>;
  planLimits?: Record<string, number>;
  familyPlanLimits?: Record<string, number>;
};

export type MemberAccount = {
  companyId: string;
  staffId: string;
  passwordHash: string;
  mustChangePassword?: boolean;
};

type MemberDbRow = {
  id: string;
  company_id: string | null;
  staff_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  nric_passport: string | null;
  passport_expiry: string | null;
  passport_no: string | null;
  passport_file_path: string | null;
  dob: string | null;
  gender: string | null;
  relationship: string | null;
  plan_selection: unknown;
  plan_limits: unknown;
  profile_id: string | null;
  status: string | null;
  companies?: { company_id: string | null } | Array<{ company_id: string | null }> | null;
};

type DependentDbRow = {
  id: string;
  member_id: string | null;
  full_name: string | null;
  relationship: string | null;
  gender: string | null;
  nric_passport: string | null;
  dob: string | null;
  status: string | null;
  nationality: string | null;
  passport_no: string | null;
  passport_expiry_date: string | null;
  passport_file_path: string | null;
  import_key: string | null;
};

let memberSessionCache: MemberSession | null = null;
let memberDirectoryCache: MemberDirectoryEntry[] = [];
let memberSeedPromise: Promise<void> | null = null;
let memberSeedLoaded = false;
let memberSeedStarted = false;
let memberSeedLoading = false;

const companyUuidByCode = new Map<string, string>();
const companyCodeByUuid = new Map<string, string>();

const memberSessionListeners = new Set<() => void>();
const memberDirectoryListeners = new Set<() => void>();
const MEMBER_DIRECTORY_SERVER_SNAPSHOT: MemberDirectoryEntry[] = [];

export const subscribeMemberSession = (listener: () => void) => {
  memberSessionListeners.add(listener);
  return () => memberSessionListeners.delete(listener);
};

export const subscribeMemberDirectory = (listener: () => void) => {
  memberDirectoryListeners.add(listener);
  return () => memberDirectoryListeners.delete(listener);
};

const notifyMemberSession = () => memberSessionListeners.forEach((listener) => listener());
const notifyMemberDirectory = () => memberDirectoryListeners.forEach((listener) => listener());

const updateMemberSeedState = ({
  started,
  loaded,
  loading,
}: {
  started?: boolean;
  loaded?: boolean;
  loading?: boolean;
}) => {
  let changed = false;
  if (typeof started === "boolean" && memberSeedStarted !== started) {
    memberSeedStarted = started;
    changed = true;
  }
  if (typeof loaded === "boolean" && memberSeedLoaded !== loaded) {
    memberSeedLoaded = loaded;
    changed = true;
  }
  if (typeof loading === "boolean" && memberSeedLoading !== loading) {
    memberSeedLoading = loading;
    changed = true;
  }
  if (changed) {
    notifyMemberSession();
    notifyMemberDirectory();
  }
};

const normalizeStatus = (value: unknown): MemberDirectoryEntry["status"] => {
  const raw = String(value || "").toLowerCase();
  return raw === "disabled" ? "Disabled" : "Active";
};

const pickPassportFileName = (pathOrName: string | null | undefined) => {
  const raw = (pathOrName || "").trim();
  if (!raw) return undefined;
  const parts = raw.split("/");
  return parts[parts.length - 1] || raw;
};

const normalizeGender = (value: unknown): MemberDirectoryEntry["gender"] | undefined => {
  const raw = String(value || "");
  if (raw === "Male" || raw === "Female") return raw;
  return undefined;
};

const normalizeRelationship = (value: unknown): MemberDirectoryEntry["relationship"] | undefined => {
  const raw = String(value || "");
  if (raw === "Employee" || raw === "Spouse" || raw === "Child" || raw === "Parent") return raw;
  return undefined;
};

const encodeDependentStaffId = (parentStaffId: string, dependentId: string) => `${parentStaffId}-DEP-${dependentId}`;

const parseDependentIdFromStaffId = (staffId: string) => {
  const parts = staffId.split("-DEP-");
  if (parts.length < 2) return null;
  const dependentId = (parts[1] || "").trim();
  return dependentId ? dependentId : null;
};

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const hydrateDirectoryEntry = (entry: MemberDirectoryEntry): MemberDirectoryEntry => {
  const parentStaffId =
    entry.parentStaffId || (entry.staffId.includes("-DEP-") ? entry.staffId.split("-DEP-")[0] : undefined);
  const memberType = entry.memberType || (parentStaffId ? "dependent" : "primary");
  return { ...entry, memberType, parentStaffId };
};

const getCompanyUuidByCompanyCode = async (companyCode: string) => {
  const cached = companyUuidByCode.get(companyCode);
  if (cached) return cached;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, company_id")
    .eq("company_id", companyCode)
    .maybeSingle();
  if (error) throw error;
  const id = data?.id ? String(data.id) : "";
  if (!id) return "";
  companyUuidByCode.set(companyCode, id);
  companyCodeByUuid.set(id, String(data?.company_id || companyCode));
  return id;
};

const getJoinedCompanyCode = (companies: MemberDbRow["companies"]) => {
  return Array.isArray(companies)
    ? companies[0]?.company_id
      ? String(companies[0].company_id)
      : ""
    : companies?.company_id
    ? String(companies.company_id)
    : "";
};

const resolveCompanyCode = async (companyUuid: string | null | undefined, companies?: MemberDbRow["companies"]) => {
  const joinedCompanyCode = getJoinedCompanyCode(companies);
  if (joinedCompanyCode) {
    if (companyUuid) {
      const normalizedCompanyUuid = String(companyUuid);
      companyUuidByCode.set(joinedCompanyCode, normalizedCompanyUuid);
      companyCodeByUuid.set(normalizedCompanyUuid, joinedCompanyCode);
    }
    return joinedCompanyCode;
  }

  const normalizedCompanyUuid = String(companyUuid || "");
  if (!normalizedCompanyUuid) return "";

  const cachedCompanyCode = companyCodeByUuid.get(normalizedCompanyUuid);
  if (cachedCompanyCode) return cachedCompanyCode;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id, company_id")
    .eq("id", normalizedCompanyUuid)
    .maybeSingle();
  if (error) throw error;

  const companyCode = data?.company_id ? String(data.company_id) : "";
  if (!companyCode) return "";

  const resolvedCompanyUuid = data?.id ? String(data.id) : normalizedCompanyUuid;
  companyUuidByCode.set(companyCode, resolvedCompanyUuid);
  companyCodeByUuid.set(resolvedCompanyUuid, companyCode);
  return companyCode;
};

const mapMemberRowToDirectoryEntry = (row: MemberDbRow): MemberDirectoryEntry => {
  const companyCode = getJoinedCompanyCode(row.companies) || companyCodeByUuid.get(String(row.company_id || "")) || "";
  if (companyCode && row.company_id) {
    const normalizedCompanyUuid = String(row.company_id);
    companyUuidByCode.set(companyCode, normalizedCompanyUuid);
    companyCodeByUuid.set(normalizedCompanyUuid, companyCode);
  }
  return hydrateDirectoryEntry({
    companyId: companyCode,
    staffId: String(row.staff_id),
    fullName: String(row.full_name || ""),
    email: String(row.email || ""),
    status: normalizeStatus(row.status),
    memberUuid: row.id ? String(row.id) : undefined,
    profileId: row.profile_id ? String(row.profile_id) : undefined,
    companyUuid: row.company_id ? String(row.company_id) : undefined,
    phone: row.phone ? String(row.phone) : undefined,
    nationality: row.nationality ? String(row.nationality) : undefined,
    nricPassport: row.nric_passport ? String(row.nric_passport) : undefined,
    passportExpiry: row.passport_expiry ? String(row.passport_expiry) : undefined,
    passportNo: row.passport_no ? String(row.passport_no) : undefined,
    passportFileName: pickPassportFileName(row.passport_file_path),
    dob: row.dob ? String(row.dob) : undefined,
    gender: normalizeGender(row.gender),
    relationship: normalizeRelationship(row.relationship) || "Employee",
    planSelection:
      row.plan_selection && typeof row.plan_selection === "object"
        ? (row.plan_selection as Record<string, boolean>)
        : undefined,
    planLimits:
      row.plan_limits && typeof row.plan_limits === "object" ? (row.plan_limits as Record<string, number>) : undefined,
  });
};

const mapDependentRowToDirectoryEntry = (
  companyId: string,
  parentStaffId: string,
  row: DependentDbRow
): MemberDirectoryEntry => {
  return hydrateDirectoryEntry({
    companyId,
    staffId: encodeDependentStaffId(parentStaffId, String(row.id)),
    fullName: String(row.full_name || ""),
    email: "",
    status: normalizeStatus(row.status),
    memberType: "dependent",
    parentStaffId,
    dob: row.dob ? String(row.dob) : undefined,
    gender: normalizeGender(row.gender),
    relationship: normalizeRelationship(row.relationship),
    nationality: row.nationality ? String(row.nationality) : undefined,
    nricPassport: row.nric_passport ? String(row.nric_passport) : undefined,
    passportExpiry: row.passport_expiry_date ? String(row.passport_expiry_date) : undefined,
    passportNo: row.passport_no ? String(row.passport_no) : undefined,
    passportFileName: pickPassportFileName(row.passport_file_path),
  });
};

const loadMemberSessionCache = async () => {
  const supabase = createSupabaseBrowserClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session?.user?.id) {
    memberSessionCache = null;
    notifyMemberSession();
    return { profileId: "", isAuthenticated: false };
  }

  const profileId = String(session.user.id);
  const [{ data: profileRow }, { data: memberRow }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle(),
    supabase.from("members").select("id,company_id,staff_id,full_name,companies(company_id)").eq("profile_id", profileId).maybeSingle(),
  ]);

  const typedMemberRow = memberRow as Pick<MemberDbRow, "id" | "company_id" | "staff_id" | "full_name" | "companies"> | null;
  const companyCode = await resolveCompanyCode(typedMemberRow?.company_id, typedMemberRow?.companies);
  const staffId = typedMemberRow?.staff_id ? String(typedMemberRow.staff_id) : "";
  const memberId = typedMemberRow?.id ? String(typedMemberRow.id) : "";
  const fullName = String(profileRow?.full_name || typedMemberRow?.full_name || "Member");

  if (companyCode && typedMemberRow?.company_id) {
    const normalizedCompanyUuid = String(typedMemberRow.company_id);
    companyUuidByCode.set(companyCode, normalizedCompanyUuid);
    companyCodeByUuid.set(normalizedCompanyUuid, companyCode);
  }

  memberSessionCache = memberId && staffId && companyCode ? { memberId, staffId, companyId: companyCode, fullName } : null;
  notifyMemberSession();
  return { profileId, isAuthenticated: true };
};

const loadMemberDirectoryForAdmin = async () => {
  const supabase = createSupabaseBrowserClient();
  const { data: memberRows, error: memberError } = await supabase
    .from("members")
    .select(
      "id,company_id,staff_id,full_name,email,phone,nationality,nric_passport,passport_expiry,passport_no,passport_file_path,dob,gender,relationship,plan_selection,plan_limits,profile_id,status,companies(company_id)"
    )
    .order("staff_id");
  if (memberError) throw memberError;

  const members = (memberRows as MemberDbRow[] | null || []).map(mapMemberRowToDirectoryEntry);

  const { data: dependentRows, error: depError } = await supabase
    .from("dependents")
    .select(
      "id,member_id,full_name,relationship,gender,nric_passport,dob,status,nationality,passport_no,passport_expiry_date,passport_file_path,import_key"
    )
    .order("created_at", { ascending: false });
  if (depError) throw depError;

  const dependents: MemberDirectoryEntry[] = [];
  (dependentRows as DependentDbRow[] | null || []).forEach((dep) => {
    const memberId = String(dep.member_id || "");
    if (!memberId) return;
    const parent = (memberRows as MemberDbRow[] | null || []).find((row) => String(row.id) === memberId);
    if (!parent) return;
    const companies = parent.companies;
    const companyCode = Array.isArray(companies)
      ? companies[0]?.company_id
        ? String(companies[0].company_id)
        : ""
      : companies?.company_id
      ? String(companies.company_id)
      : "";
    if (!companyCode) return;
    dependents.push(mapDependentRowToDirectoryEntry(companyCode, String(parent.staff_id), dep));
  });

  memberDirectoryCache = [...members, ...dependents].map(hydrateDirectoryEntry);
  notifyMemberDirectory();
};

const loadMemberDirectoryForProvider = async () => {
  const supabase = createSupabaseBrowserClient();
  const { data: memberRows, error: memberError } = await supabase
    .from("members")
    .select(
      "id,company_id,staff_id,full_name,email,phone,nationality,nric_passport,passport_expiry,passport_no,passport_file_path,dob,gender,relationship,plan_selection,plan_limits,profile_id,status,companies(company_id)"
    )
    .order("staff_id");
  if (memberError) throw memberError;

  const members = (memberRows as MemberDbRow[] | null || []).map(mapMemberRowToDirectoryEntry);

  const { data: dependentRows, error: depError } = await supabase
    .from("dependents")
    .select(
      "id,member_id,full_name,relationship,gender,nric_passport,dob,status,nationality,passport_no,passport_expiry_date,passport_file_path,import_key"
    )
    .order("created_at", { ascending: false });
  if (depError) throw depError;

  const dependents: MemberDirectoryEntry[] = [];
  (dependentRows as DependentDbRow[] | null || []).forEach((dep) => {
    const memberId = String(dep.member_id || "");
    if (!memberId) return;
    const parent = (memberRows as MemberDbRow[] | null || []).find((row) => String(row.id) === memberId);
    if (!parent) return;
    const companies = parent.companies;
    const companyCode = Array.isArray(companies)
      ? companies[0]?.company_id
        ? String(companies[0].company_id)
        : ""
      : companies?.company_id
      ? String(companies.company_id)
      : "";
    if (!companyCode) return;
    dependents.push(mapDependentRowToDirectoryEntry(companyCode, String(parent.staff_id), dep));
  });

  memberDirectoryCache = [...members, ...dependents].map(hydrateDirectoryEntry);
  notifyMemberDirectory();
};

const loadMemberDirectoryForMember = async (profileId: string) => {
  const supabase = createSupabaseBrowserClient();
  const { data: memberRow, error: memberError } = await supabase
    .from("members")
    .select(
      "id,company_id,staff_id,full_name,email,phone,nationality,nric_passport,passport_expiry,passport_no,passport_file_path,dob,gender,relationship,plan_selection,plan_limits,profile_id,status,companies(company_id)"
    )
    .eq("profile_id", profileId)
    .maybeSingle();
  if (memberError) throw memberError;

  if (!memberRow?.id) {
    memberDirectoryCache = [];
    notifyMemberDirectory();
    return;
  }

  const member = mapMemberRowToDirectoryEntry(memberRow as MemberDbRow);
  const companyCode = member.companyId;

  const { data: depRows, error: depError } = await supabase
    .from("dependents")
    .select(
      "id,member_id,full_name,relationship,gender,nric_passport,dob,status,nationality,passport_no,passport_expiry_date,passport_file_path,import_key"
    )
    .eq("member_id", String(memberRow.id))
    .order("created_at", { ascending: false });
  if (depError) throw depError;

  const dependents = (depRows as DependentDbRow[] | null || []).map((row) =>
    mapDependentRowToDirectoryEntry(companyCode, String(memberRow.staff_id), row)
  );

  memberDirectoryCache = [member, ...dependents].map(hydrateDirectoryEntry);
  notifyMemberDirectory();
};

export const ensureMemberSeed = async (forceRefresh = false) => {
  if (typeof window === "undefined") return;
  if (!forceRefresh && memberSeedLoaded) return;
  if (memberSeedPromise) return memberSeedPromise;
  updateMemberSeedState({ started: true, loaded: forceRefresh ? false : memberSeedLoaded, loading: true });

  memberSeedPromise = (async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ profileId, isAuthenticated }, { data: isAdmin }, { data: isProvider }] = await Promise.all([
      loadMemberSessionCache(),
      supabase.rpc("is_admin"),
      supabase.rpc("is_provider"),
    ]);

    if (!isAuthenticated || !profileId) {
      memberDirectoryCache = [];
      notifyMemberDirectory();
      updateMemberSeedState({ loaded: true, loading: false });
      return;
    }

    if (isAdmin) {
      await loadMemberDirectoryForAdmin();
      updateMemberSeedState({ loaded: true, loading: false });
      return;
    }

    if (isProvider) {
      await loadMemberDirectoryForProvider();
      updateMemberSeedState({ loaded: true, loading: false });
      return;
    }

    await loadMemberDirectoryForMember(profileId);
    updateMemberSeedState({ loaded: true, loading: false });
  })()
    .catch(() => {
      memberSessionCache = null;
      memberDirectoryCache = [];
      notifyMemberSession();
      notifyMemberDirectory();
      updateMemberSeedState({ loaded: true, loading: false });
    })
    .finally(() => {
      memberSeedPromise = null;
      updateMemberSeedState({ loading: false });
    });

  return memberSeedPromise;
};

export const getMemberSession = () => {
  if (typeof window === "undefined") return null;
  if (!memberSeedStarted) void ensureMemberSeed();
  return memberSessionCache;
};

export const getMemberSeedLoading = () => {
  if (typeof window === "undefined") return false;
  if (!memberSeedStarted) void ensureMemberSeed();
  return memberSeedLoading;
};

export const setMemberSession = (session: MemberSession) => {
  if (typeof window === "undefined") return;
  memberSessionCache = session;
  notifyMemberSession();
};

export const resetMemberClientState = () => {
  memberSessionCache = null;
  memberDirectoryCache = [];
  memberSeedPromise = null;
  companyUuidByCode.clear();
  companyCodeByUuid.clear();
  updateMemberSeedState({ started: false, loaded: false, loading: false });
  notifyMemberSession();
  notifyMemberDirectory();
};

export const clearMemberSession = async () => {
  if (typeof window === "undefined") return;
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
  resetMemberClientState();
};

export const getMemberDirectory = () => {
  if (typeof window === "undefined") return [];
  if (!memberSeedStarted) void ensureMemberSeed();
  return memberDirectoryCache;
};

export const getMemberDirectorySnapshot = () => getMemberDirectory();
export const getMemberDirectoryServerSnapshot = () => MEMBER_DIRECTORY_SERVER_SNAPSHOT;

export const isDependentMember = (entry: Pick<MemberDirectoryEntry, "staffId" | "memberType" | "parentStaffId">) => {
  return entry.memberType === "dependent" || !!entry.parentStaffId || entry.staffId.includes("-DEP-");
};

export const isPrimaryMember = (entry: Pick<MemberDirectoryEntry, "staffId" | "memberType" | "parentStaffId">) => {
  return !isDependentMember(entry);
};

export const getMembersByCompany = (companyId: string) => {
  return getMemberDirectory().filter((entry) => entry.companyId === companyId && isPrimaryMember(entry));
};

export const getDependentsByParent = (companyId: string, parentStaffId: string) => {
  return getMemberDirectory().filter(
    (entry) =>
      entry.companyId === companyId &&
      isDependentMember(entry) &&
      (entry.parentStaffId === parentStaffId || entry.staffId.startsWith(`${parentStaffId}-DEP-`))
  );
};

export const getMemberAccounts = () => {
  return [];
};

export const saveMemberDirectoryEntry = async (entry: MemberDirectoryEntry) => {
  if (typeof window === "undefined") return;
  const supabase = createSupabaseBrowserClient();
  const normalizedEntry = hydrateDirectoryEntry(entry);

  if (isDependentMember(normalizedEntry)) {
    const parentStaffId = normalizedEntry.parentStaffId || normalizedEntry.staffId.split("-DEP-")[0];
    const dependentId = parseDependentIdFromStaffId(normalizedEntry.staffId);
    const companyUuid = await getCompanyUuidByCompanyCode(normalizedEntry.companyId);
    const { data: parentRow, error: parentError } = await supabase
      .from("members")
      .select("id")
      .eq("company_id", companyUuid)
      .eq("staff_id", parentStaffId)
      .maybeSingle();
    if (parentError) throw parentError;
    const memberId = parentRow?.id ? String(parentRow.id) : "";
    if (!memberId) throw new Error("Parent member not found.");

    const payload: Record<string, unknown> = {
      member_id: memberId,
      full_name: normalizedEntry.fullName,
      relationship: normalizedEntry.relationship || "Child",
      gender: normalizedEntry.gender || null,
      nric_passport: normalizedEntry.nricPassport || null,
      dob: normalizedEntry.dob || null,
      status: normalizedEntry.status === "Disabled" ? "disabled" : "active",
      nationality: normalizedEntry.nationality || null,
      passport_no: normalizedEntry.passportNo || null,
      passport_expiry_date: normalizedEntry.passportExpiry || null,
      passport_file_path: normalizedEntry.passportFileName || null,
    };
    const importKey = dependentId || `${Date.now()}`;
    const { error: upsertError } = dependentId && isUuid(dependentId)
      ? await supabase.from("dependents").upsert([{ ...payload, id: dependentId }], { onConflict: "id" })
      : await supabase
          .from("dependents")
          .upsert([{ ...payload, import_key: importKey }], { onConflict: "member_id,import_key" });
    if (upsertError) throw upsertError;

    await ensureMemberSeed(true);
    return;
  }

  const companyUuid = await getCompanyUuidByCompanyCode(normalizedEntry.companyId);
  if (!companyUuid) throw new Error("Company not found.");

  const payload: Record<string, unknown> = {
    company_id: companyUuid,
    staff_id: normalizedEntry.staffId,
    full_name: normalizedEntry.fullName,
    email: normalizedEntry.email,
    phone: normalizedEntry.phone || null,
    nationality: normalizedEntry.nationality || null,
    nric_passport: normalizedEntry.nricPassport || null,
    passport_expiry: normalizedEntry.passportExpiry || null,
    passport_no: normalizedEntry.passportNo || null,
    passport_file_path: normalizedEntry.passportFileName || null,
    dob: normalizedEntry.dob || null,
    gender: normalizedEntry.gender || null,
    relationship: normalizedEntry.relationship || "Employee",
    status: normalizedEntry.status === "Disabled" ? "disabled" : "active",
    plan_selection: normalizedEntry.planSelection || {},
    plan_limits: normalizedEntry.planLimits || {},
  };

  const { error: upsertError } = await supabase.from("members").upsert([payload], { onConflict: "company_id,staff_id" });
  if (upsertError) throw upsertError;

  await ensureMemberSeed(true);
};

export const removeMemberDirectoryEntry = async (companyId: string, staffId: string) => {
  if (typeof window === "undefined") return;
  const supabase = createSupabaseBrowserClient();
  const dependentId = parseDependentIdFromStaffId(staffId);
  if (dependentId) {
    const { error } = await supabase.from("dependents").delete().eq("id", dependentId);
    if (error) throw error;
    await ensureMemberSeed(true);
    return;
  }

  const companyUuid = await getCompanyUuidByCompanyCode(companyId);
  const { error } = await supabase.from("members").delete().eq("company_id", companyUuid).eq("staff_id", staffId);
  if (error) throw error;
  await ensureMemberSeed(true);
};

export const saveMemberAccount = async () => {
  throw new Error("MemberAccount local password hashes are no longer supported. Use Supabase Auth password reset instead.");
};

export const removeMembersByCompany = async (companyId: string) => {
  if (typeof window === "undefined") return;
  const supabase = createSupabaseBrowserClient();
  const companyUuid = await getCompanyUuidByCompanyCode(companyId);
  const { error } = await supabase.from("members").delete().eq("company_id", companyUuid);
  if (error) throw error;
  await ensureMemberSeed(true);
};
