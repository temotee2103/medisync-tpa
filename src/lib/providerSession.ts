import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ProviderSession = {
  vendorId: string;
  providerUuid: string;
  providerName: string;
  providerUserId?: string;
  providerUserRole?: "doctor" | "provider_admin";
  requiresPasswordChange?: boolean;
};

export const PROVIDER_CREDENTIAL_DOC_TYPES = {
  CLINIC_LICENSE: "clinic_license",
  APC: "apc",
  BORANG_B: "borang_b",
  SSM: "ssm",
  TCM: "tcm",
} as const;

/** Doc types that never expire — once approved, always valid. */
export const NON_EXPIRY_DOC_TYPES: Set<ProviderCredentialDocType> = new Set([
  PROVIDER_CREDENTIAL_DOC_TYPES.CLINIC_LICENSE,
  PROVIDER_CREDENTIAL_DOC_TYPES.BORANG_B,
  PROVIDER_CREDENTIAL_DOC_TYPES.SSM,
]);

export type ProviderCredentialDocType =
  typeof PROVIDER_CREDENTIAL_DOC_TYPES[keyof typeof PROVIDER_CREDENTIAL_DOC_TYPES];

export type ProviderDirectoryEntry = {
  vendorId: string;
  providerName: string;
  status: "Active" | "Disabled";
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  complianceStatus?: string;
  compliance?: VendorCompliance;
};

export type ProviderAccount = {
  vendorId: string;
  username?: string;
  passwordHash: string;
};

export type VendorMemberDirectoryEntry = {
  vendorId: string;
  memberId: string;
  providerUserUuid?: string;
  profileId?: string | null;
  fullName: string;
  email: string;
  phone?: string;
  role?: "doctor" | "provider_admin" | string;
  status: "Active" | "Disabled";
};

export type VendorMemberAccount = {
  vendorId: string;
  memberId: string;
  username: string;
  passwordHash: string;
  mustChangePassword?: boolean;
};

export type VendorComplianceDocument = {
  docType?: ProviderCredentialDocType;
  credentialId?: string;
  fileName?: string;
  fileDataUrl?: string;
  storagePath?: string;
  fileMimeType?: string;
  expiryDate?: string;
  status?: "missing" | "submitted" | "approved" | "rejected";
  submittedBy?: "vendor" | "admin";
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type VendorDoctorApc = {
  credentialId?: string;
  providerUserId: string;
  doctorName: string;
  fileName?: string;
  fileDataUrl?: string;
  storagePath?: string;
  fileMimeType?: string;
  expiryDate?: string;
  status?: "missing" | "submitted" | "approved" | "rejected";
  submittedBy?: "vendor" | "admin";
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type VendorCompliance = {
  clinicLicense?: VendorComplianceDocument;
  documents?: VendorComplianceDocument[];
  doctorApcs?: VendorDoctorApc[];
};

export type VendorCompliancePendingItem = {
  vendorId: string;
  providerName: string;
  kind: ProviderCredentialDocType;
  name: string;
  credentialId?: string;
  providerUserId?: string;
  submittedAt?: string;
};

type ProviderDbRow = {
  id: string;
  vendor_id: string;
  provider_name: string;
  status: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  compliance_status: string | null;
};

type ProviderUserDbRow = {
  id: string;
  provider_id: string;
  member_code: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  profile_id?: string | null;
};

type ProviderCredentialDbRow = {
  id: string;
  provider_id: string | null;
  provider_user_id: string | null;
  doc_type: string | null;
  storage_path: string | null;
  expiry_date: string | null;
  status: string | null;
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  reviewed_at: string | null;
};

const TODAY_KEY = new Date().toISOString().slice(0, 10);

const toUiStatus = (value: unknown): "Active" | "Disabled" => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "disabled") return "Disabled";
  return "Active";
};

const toCredentialStatus = (
  value: unknown
): "missing" | "submitted" | "approved" | "rejected" => {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  if (normalized === "submitted") return "submitted";
  return "missing";
};

export function normalizeProviderUserRole(value?: string) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("admin") || normalized.includes("owner")) return "provider_admin" as const;
  if (normalized.includes("doctor") || normalized.includes("doc")) return "doctor" as const;
  return "provider_admin" as const;
}

let providerSessionSnapshot: ProviderSession | null = null;

export const getProviderSession = () => {
  if (typeof window === "undefined") return null;
  return providerSessionSnapshot;
};

export const setProviderSession = (session: ProviderSession) => {
  providerSessionSnapshot = session;
};

export const clearProviderSession = () => {
  providerSessionSnapshot = null;
};

let providerDirectorySnapshot: ProviderDirectoryEntry[] = [];
let providerDirectoryInitialized = false;
const providerDirectoryListeners = new Set<() => void>();

let vendorMembersSnapshot: VendorMemberDirectoryEntry[] = [];
let vendorMembersInitialized = false;
const vendorMembersListeners = new Set<() => void>();

let providerCredentialsSnapshot: ProviderCredentialDbRow[] = [];
let providerCredentialsInitialized = false;
const providerCredentialsListeners = new Set<() => void>();

let providerUuidByVendorId = new Map<string, string>();
let vendorIdByProviderUuid = new Map<string, string>();
let providerUserUuidByVendorMemberId = new Map<string, string>();
let vendorMemberIdByProviderUserUuid = new Map<string, string>();
let vendorMemberNameByProviderUserUuid = new Map<string, string>();

const notify = (listeners: Set<() => void>) => {
  listeners.forEach((listener) => listener());
};

export const subscribeProviderDirectory = (listener: () => void) => {
  providerDirectoryListeners.add(listener);
  return () => providerDirectoryListeners.delete(listener);
};

export const subscribeVendorMembers = (listener: () => void) => {
  vendorMembersListeners.add(listener);
  return () => vendorMembersListeners.delete(listener);
};

export const subscribeProviderCredentials = (listener: () => void) => {
  providerCredentialsListeners.add(listener);
  return () => providerCredentialsListeners.delete(listener);
};

export const resetProviderClientState = () => {
  providerSessionSnapshot = null;
  providerDirectorySnapshot = [];
  providerDirectoryInitialized = false;
  vendorMembersSnapshot = [];
  vendorMembersInitialized = false;
  providerCredentialsSnapshot = [];
  providerCredentialsInitialized = false;
  providerUuidByVendorId = new Map();
  vendorIdByProviderUuid = new Map();
  providerUserUuidByVendorMemberId = new Map();
  vendorMemberIdByProviderUserUuid = new Map();
  vendorMemberNameByProviderUserUuid = new Map();
  notify(providerDirectoryListeners);
  notify(vendorMembersListeners);
  notify(providerCredentialsListeners);
};

const PROVIDER_DIRECTORY_SERVER_SNAPSHOT: ProviderDirectoryEntry[] = [];
const VENDOR_MEMBERS_SERVER_SNAPSHOT: VendorMemberDirectoryEntry[] = [];
const PROVIDER_CREDENTIALS_SERVER_SNAPSHOT: ProviderCredentialDbRow[] = [];

export const getProviderDirectorySnapshot = () => providerDirectorySnapshot;
export const getProviderDirectoryServerSnapshot = () => PROVIDER_DIRECTORY_SERVER_SNAPSHOT;

export const getVendorMembersSnapshot = () => vendorMembersSnapshot;
export const getVendorMembersServerSnapshot = () => VENDOR_MEMBERS_SERVER_SNAPSHOT;

export const getProviderCredentialsSnapshot = () => providerCredentialsSnapshot;
export const getProviderCredentialsServerSnapshot = () => PROVIDER_CREDENTIALS_SERVER_SNAPSHOT;

export const refreshProviderDirectorySnapshot = async () => {
  if (typeof window === "undefined") return;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("providers")
      .select(
        "id, vendor_id, provider_name, status, contact_email, contact_phone, address_line1, address_line2, city, state, postal_code, compliance_status"
      )
      .order("vendor_id", { ascending: true });
    if (error) throw error;
    const rows = (data as ProviderDbRow[] | null) || [];

    providerUuidByVendorId = new Map(rows.map((row) => [String(row.vendor_id || ""), String(row.id || "")]));
    vendorIdByProviderUuid = new Map(rows.map((row) => [String(row.id || ""), String(row.vendor_id || "")]));

    providerDirectorySnapshot = rows.map((row) => ({
      vendorId: String(row.vendor_id || ""),
      providerName: String(row.provider_name || ""),
      status: toUiStatus(row.status),
      contactEmail: row.contact_email ? String(row.contact_email) : undefined,
      contactPhone: row.contact_phone ? String(row.contact_phone) : undefined,
      address: [row.address_line1, row.address_line2, row.city, row.state, row.postal_code]
        .filter((item) => !!item)
        .map((item) => String(item))
        .join(", ") || undefined,
      addressLine1: row.address_line1 ? String(row.address_line1) : undefined,
      addressLine2: row.address_line2 ? String(row.address_line2) : undefined,
      city: row.city ? String(row.city) : undefined,
      state: row.state ? String(row.state) : undefined,
      postalCode: row.postal_code ? String(row.postal_code) : undefined,
      complianceStatus: row.compliance_status ? String(row.compliance_status) : undefined,
    }));
  } catch {
    providerDirectorySnapshot = [];
    providerUuidByVendorId = new Map();
    vendorIdByProviderUuid = new Map();
  } finally {
    notify(providerDirectoryListeners);
  }
};

export const refreshVendorMembersSnapshot = async () => {
  if (typeof window === "undefined") return;
  try {
    if (vendorIdByProviderUuid.size === 0) {
      await refreshProviderDirectorySnapshot();
    }
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("provider_users")
      .select("id, provider_id, member_code, full_name, email, phone, role, status, profile_id")
      .order("member_code", { ascending: true });
    if (error) throw error;
    const rows = (data as ProviderUserDbRow[] | null) || [];

    providerUserUuidByVendorMemberId = new Map();
    vendorMemberIdByProviderUserUuid = new Map();
    vendorMemberNameByProviderUserUuid = new Map();

    vendorMembersSnapshot = rows
      .map((row) => {
        const providerUuid = String(row.provider_id || "");
        const vendorId = vendorIdByProviderUuid.get(providerUuid) || "";
        const memberId = String(row.member_code || "");
        const providerUserUuid = String(row.id || "");
        if (vendorId && memberId && providerUserUuid) {
          providerUserUuidByVendorMemberId.set(`${vendorId}::${memberId}`, providerUserUuid);
          vendorMemberIdByProviderUserUuid.set(providerUserUuid, memberId);
          vendorMemberNameByProviderUserUuid.set(providerUserUuid, String(row.full_name || ""));
        }
        return {
          vendorId,
          memberId,
          providerUserUuid,
          profileId: row.profile_id ? String(row.profile_id) : null,
          fullName: String(row.full_name || ""),
          email: String(row.email || ""),
          phone: row.phone ? String(row.phone) : undefined,
          role: normalizeProviderUserRole(String(row.role || "")) || (row.role ? String(row.role) : undefined),
          status: toUiStatus(row.status),
        } satisfies VendorMemberDirectoryEntry;
      })
      .filter((row) => row.vendorId && row.memberId);
  } catch {
    vendorMembersSnapshot = [];
    providerUserUuidByVendorMemberId = new Map();
    vendorMemberIdByProviderUserUuid = new Map();
    vendorMemberNameByProviderUserUuid = new Map();
  } finally {
    notify(vendorMembersListeners);
  }
};

export const refreshProviderCredentialsSnapshot = async () => {
  if (typeof window === "undefined") return;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("provider_credentials")
      .select(
        "id, provider_id, provider_user_id, doc_type, expiry_date, status, file_name, mime_type, created_at, updated_at, reviewed_at"
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    providerCredentialsSnapshot = ((data as ProviderCredentialDbRow[] | null) || []).map((row) => ({
      ...row,
      id: String(row.id || ""),
      provider_id: row.provider_id ? String(row.provider_id) : null,
      provider_user_id: row.provider_user_id ? String(row.provider_user_id) : null,
      doc_type: row.doc_type ? String(row.doc_type) : null,
      storage_path: null,
      expiry_date: row.expiry_date ? String(row.expiry_date) : null,
      status: row.status ? String(row.status) : null,
      file_name: row.file_name ? String(row.file_name) : null,
      mime_type: row.mime_type ? String(row.mime_type) : null,
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    }));
  } catch {
    providerCredentialsSnapshot = [];
  } finally {
    notify(providerCredentialsListeners);
  }
};

/** Fetch storage_path for a single credential (lazy, avoids bulk base64 in snapshot). */
export const fetchCredentialStoragePath = async (credentialId: string): Promise<string | null> => {
  if (typeof window === "undefined") return null;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("provider_credentials")
      .select("storage_path")
      .eq("id", credentialId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { storage_path: string | null }).storage_path || null;
  } catch {
    return null;
  }
};

export const ensureProviderDirectoryStore = () => {
  if (typeof window === "undefined") return;
  if (providerDirectoryInitialized) return;
  providerDirectoryInitialized = true;
  void refreshProviderDirectorySnapshot();
};

export const ensureVendorMembersStore = () => {
  if (typeof window === "undefined") return;
  if (vendorMembersInitialized) return;
  vendorMembersInitialized = true;
  void refreshVendorMembersSnapshot();
};

export const ensureProviderCredentialsStore = () => {
  if (typeof window === "undefined") return;
  if (providerCredentialsInitialized) return;
  providerCredentialsInitialized = true;
  void refreshProviderCredentialsSnapshot();
};

export const ensureProviderSeed = () => {
  ensureProviderDirectoryStore();
  ensureVendorMembersStore();
  ensureProviderCredentialsStore();
};

const resolveProviderUuid = (vendorId: string) => providerUuidByVendorId.get(vendorId) || "";

export const getProviderUuidByVendorId = (vendorId: string) => resolveProviderUuid(vendorId);

const resolveProviderUserUuid = (vendorId: string, providerUserIdOrMemberId: string) => {
  const normalized = String(providerUserIdOrMemberId || "").trim();
  if (!normalized) return "";
  if (vendorMemberIdByProviderUserUuid.has(normalized)) return normalized;
  return providerUserUuidByVendorMemberId.get(`${vendorId}::${normalized}`) || "";
};

const getCredentialSortKey = (row: ProviderCredentialDbRow) => {
  const stamp = row.updated_at || row.created_at || "";
  return String(stamp);
};

export const getProviderComplianceByVendorId = (vendorId: string): VendorCompliance => {
  const providerUuid = resolveProviderUuid(vendorId);
  if (!providerUuid) return { clinicLicense: undefined, documents: [], doctorApcs: [] };

  const providerRows = providerCredentialsSnapshot.filter((row) => row.provider_id === providerUuid);
  const clinicCandidates = providerRows.filter(
    (row) =>
      (row.doc_type === "clinic_license" || row.doc_type === "borang_b" || row.doc_type === "ssm" || row.doc_type === "tcm") &&
      !row.provider_user_id
  );

  const clinicLicenseRow = [...clinicCandidates.filter(r => r.doc_type === "clinic_license")].sort((a, b) => getCredentialSortKey(b).localeCompare(getCredentialSortKey(a)))[0];
  const documentRows = clinicCandidates.filter(r => r.doc_type !== "clinic_license");

  const clinicLicense: VendorComplianceDocument | undefined = clinicLicenseRow
    ? {
        credentialId: clinicLicenseRow.id,
        fileName: clinicLicenseRow.file_name || undefined,
        fileMimeType: clinicLicenseRow.mime_type || undefined,
        fileDataUrl: clinicLicenseRow.storage_path?.startsWith("data:") ? clinicLicenseRow.storage_path : undefined,
        storagePath: clinicLicenseRow.storage_path || undefined,
        expiryDate: clinicLicenseRow.expiry_date || undefined,
        status: toCredentialStatus(clinicLicenseRow.status),
        submittedAt: (clinicLicenseRow.created_at || "").slice(0, 10) || undefined,
        reviewedAt: (clinicLicenseRow.reviewed_at || "").slice(0, 10) || undefined,
        reviewedBy: clinicLicenseRow.reviewed_at ? "Admin" : undefined,
      }
    : undefined;

  const documents: VendorComplianceDocument[] = documentRows.map((row) => ({
    docType: (row.doc_type || "clinic_license") as ProviderCredentialDocType,
    credentialId: row.id,
    fileName: row.file_name || undefined,
    fileMimeType: row.mime_type || undefined,
    fileDataUrl: row.storage_path?.startsWith("data:") ? row.storage_path : undefined,
    storagePath: row.storage_path || undefined,
    expiryDate: row.expiry_date || undefined,
    status: toCredentialStatus(row.status),
    submittedAt: (row.created_at || "").slice(0, 10) || undefined,
    reviewedAt: (row.reviewed_at || "").slice(0, 10) || undefined,
    reviewedBy: row.reviewed_at ? "Admin" : undefined,
  }));

  const apcRows = providerRows.filter(
    (row) =>
      String(row.doc_type || "") === PROVIDER_CREDENTIAL_DOC_TYPES.APC &&
      !!row.provider_user_id
  );

  const bestApcByUserUuid = new Map<string, ProviderCredentialDbRow>();
  apcRows.forEach((row) => {
    const userUuid = String(row.provider_user_id || "");
    if (!userUuid) return;
    const existing = bestApcByUserUuid.get(userUuid);
    if (!existing) {
      bestApcByUserUuid.set(userUuid, row);
      return;
    }
    if (getCredentialSortKey(row) > getCredentialSortKey(existing)) {
      bestApcByUserUuid.set(userUuid, row);
    }
  });

  const doctorApcs: VendorDoctorApc[] = Array.from(bestApcByUserUuid.entries()).map(([userUuid, row]) => {
    const memberId = vendorMemberIdByProviderUserUuid.get(userUuid) || userUuid;
    const doctorName = vendorMemberNameByProviderUserUuid.get(userUuid) || memberId;
    return {
      credentialId: row.id,
      providerUserId: memberId,
      doctorName,
      fileName: row.file_name || undefined,
      fileMimeType: row.mime_type || undefined,
      fileDataUrl: row.storage_path?.startsWith("data:") ? row.storage_path : undefined,
      storagePath: row.storage_path || undefined,
      expiryDate: row.expiry_date || undefined,
      status: toCredentialStatus(row.status),
      submittedAt: (row.created_at || "").slice(0, 10) || undefined,
      reviewedAt: (row.reviewed_at || "").slice(0, 10) || undefined,
      reviewedBy: row.reviewed_at ? "Admin" : undefined,
    };
  });

  return {
    clinicLicense,
    documents,
    doctorApcs,
  };
};

export const getVendorPendingComplianceItems = (vendorId: string): VendorCompliancePendingItem[] => {
  const providerName = providerDirectorySnapshot.find((row) => row.vendorId === vendorId)?.providerName || "";
  const compliance = getProviderComplianceByVendorId(vendorId);
  const items: VendorCompliancePendingItem[] = [];

  if (compliance.clinicLicense?.status === "submitted") {
    items.push({
      vendorId,
      providerName,
      kind: "clinic_license",
      name: compliance.clinicLicense.fileName || "Unnamed file",
      credentialId: compliance.clinicLicense.credentialId,
      submittedAt: compliance.clinicLicense.submittedAt,
    });
  }

  (compliance.doctorApcs || []).forEach((doc) => {
    if (doc.status !== "submitted") return;
    items.push({
      vendorId,
      providerName,
      kind: PROVIDER_CREDENTIAL_DOC_TYPES.APC,
      name: `${doc.doctorName} • ${doc.fileName || "Unnamed file"}`,
      credentialId: doc.credentialId,
      providerUserId: doc.providerUserId,
      submittedAt: doc.submittedAt,
    });
  });

  (compliance.documents || []).forEach((doc) => {
    if (doc.status !== "submitted") return;
    items.push({
      vendorId,
      providerName,
      kind: doc.docType || "clinic_license",
      name: doc.fileName || "Unnamed file",
      credentialId: doc.credentialId,
      submittedAt: doc.submittedAt,
    });
  });

  return items.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
};

export const getProviderDirectory = () => {
  return providerDirectorySnapshot.map((row) => ({
    ...row,
    compliance: getProviderComplianceByVendorId(row.vendorId),
  }));
};

export const getProviderById = (vendorId: string) => {
  const provider = getProviderDirectory().find((entry) => entry.vendorId === vendorId) || null;
  return provider;
};

export const getProviderAccounts = () => {
  return [] as ProviderAccount[];
};

export const saveProviderDirectoryEntry = async (entry: ProviderDirectoryEntry) => {
  const supabase = createSupabaseBrowserClient();
  const payload = {
    vendor_id: entry.vendorId,
    provider_name: entry.providerName,
    status: entry.status === "Disabled" ? "disabled" : "active",
    contact_email: entry.contactEmail || null,
    contact_phone: entry.contactPhone || null,
    address_line1: entry.addressLine1 || null,
    address_line2: entry.addressLine2 || null,
    city: entry.city || null,
    state: entry.state || null,
    postal_code: entry.postalCode || null,
    compliance_status: entry.complianceStatus || null,
  };
  await supabase.from("providers").upsert(payload, { onConflict: "vendor_id" });
  await refreshProviderDirectorySnapshot();
};

export const saveProviderAccount = async (account: ProviderAccount) => {
  void account;
};

export const deleteProviderDirectoryEntry = async (vendorId: string) => {
  const supabase = createSupabaseBrowserClient();
  await supabase.from("providers").delete().eq("vendor_id", vendorId);
  await refreshProviderDirectorySnapshot();
  await refreshVendorMembersSnapshot();
  await refreshProviderCredentialsSnapshot();
};

export function getVendorMembers() {
  return vendorMembersSnapshot;
}

export function getVendorMemberAccounts() {
  return [] as VendorMemberAccount[];
}

export function getVendorMembersByVendor(vendorId: string) {
  return getVendorMembers().filter((member) => member.vendorId === vendorId);
}

export function getProviderUserById(vendorId: string, memberId: string) {
  const normalized = (memberId || "").trim();
  if (!normalized) return null;
  return (
    getVendorMembers().find(
      (member) =>
        member.vendorId === vendorId &&
        (member.memberId === normalized || member.providerUserUuid === normalized)
    ) || null
  );
}

export const saveVendorMember = async (entry: VendorMemberDirectoryEntry) => {
  const providerUuid = resolveProviderUuid(entry.vendorId);
  if (!providerUuid) return;
  const supabase = createSupabaseBrowserClient();
  const normalizedMemberCode = (entry.memberId || "").trim();
  if (!normalizedMemberCode) return;
  const payload = {
    provider_id: providerUuid,
    member_code: normalizedMemberCode,
    full_name: entry.fullName,
    email: entry.email,
    phone: entry.phone || null,
    role: normalizeProviderUserRole(entry.role) || entry.role || "provider_user",
    status: entry.status === "Disabled" ? "disabled" : "active",
  };
  await supabase.from("provider_users").upsert(payload, { onConflict: "provider_id,member_code" });
  await refreshVendorMembersSnapshot();
};

export const saveVendorMemberAccount = async (entry: VendorMemberAccount) => {
  void entry;
};

export const removeVendorMembersByVendor = async (vendorId: string) => {
  const providerUuid = resolveProviderUuid(vendorId);
  if (!providerUuid) return;
  const supabase = createSupabaseBrowserClient();
  await supabase.from("provider_users").delete().eq("provider_id", providerUuid);
  await refreshVendorMembersSnapshot();
};

export const insertProviderCredential = async (payload: {
  vendorId: string;
  docType: ProviderCredentialDocType;
  providerUserId?: string | null;
  fileName: string;
  storagePath?: string;
  fileMimeType?: string;
  expiryDate?: string;
  submittedBy: "vendor" | "admin";
}) => {
  const providerUuid = resolveProviderUuid(payload.vendorId);
  if (!providerUuid) {
    // Vendor-to-UUID map may not be loaded yet — try to ensure it
    await ensureProviderDirectoryStore();
    const retryUuid = resolveProviderUuid(payload.vendorId);
    if (!retryUuid) {
      throw new Error(`Cannot resolve provider for vendorId: ${payload.vendorId}. The vendor may not exist in the system. Please refresh the page and try again.`);
    }
    // Use the retry UUID
    const providerUserUuid = payload.providerUserId ? resolveProviderUserUuid(payload.vendorId, payload.providerUserId) : "";
    const supabase = createSupabaseBrowserClient();
    const row: Record<string, unknown> = {
      provider_id: retryUuid,
      provider_user_id: providerUserUuid || null,
      doc_type: payload.docType,
      storage_path: payload.storagePath || null,
      expiry_date: payload.expiryDate || null,
      status: "submitted",
      file_name: payload.fileName,
      mime_type: payload.fileMimeType || null,
    };
    const { error: insertErr } = await supabase.from("provider_credentials").insert(row);
    if (insertErr) throw insertErr;
    await refreshProviderCredentialsSnapshot();
    return;
  }
  const providerUserUuid = payload.providerUserId ? resolveProviderUserUuid(payload.vendorId, payload.providerUserId) : "";
  const supabase = createSupabaseBrowserClient();
  const row: Record<string, unknown> = {
    provider_id: providerUuid,
    provider_user_id: providerUserUuid || null,
    doc_type: payload.docType,
    storage_path: payload.storagePath || null,
    expiry_date: payload.expiryDate || null,
    status: "submitted",
    file_name: payload.fileName,
    mime_type: payload.fileMimeType || null,
  };
  const { error: insertErr } = await supabase.from("provider_credentials").insert(row);
  if (insertErr) throw insertErr;
  await refreshProviderCredentialsSnapshot();
};

export const reviewProviderCredential = async (credentialId: string, status: "approved" | "rejected") => {
  const supabase = createSupabaseBrowserClient();
  await supabase.from("provider_credentials").update({ status, reviewed_at: new Date().toISOString() }).eq("id", credentialId);
  await refreshProviderCredentialsSnapshot();
};

export const deleteProviderCredential = async (credentialId: string) => {
  const supabase = createSupabaseBrowserClient();
  await supabase.from("provider_credentials").delete().eq("id", credentialId);
  await refreshProviderCredentialsSnapshot();
};

export const submitVendorClinicLicense = (
  vendorId: string,
  payload: {
    fileName: string;
    storagePath?: string;
    fileMimeType?: string;
    expiryDate: string;
    submittedBy: "vendor" | "admin";
  }
) => {
  void insertProviderCredential({
    vendorId,
    docType: PROVIDER_CREDENTIAL_DOC_TYPES.CLINIC_LICENSE,
    providerUserId: null,
    fileName: payload.fileName,
    storagePath: payload.storagePath,
    fileMimeType: payload.fileMimeType,
    expiryDate: payload.expiryDate,
    submittedBy: payload.submittedBy,
  });
};

export const submitVendorDocument = (
  vendorId: string,
  payload: {
    fileName: string;
    storagePath?: string;
    fileMimeType?: string;
    docType: ProviderCredentialDocType;
    expiryDate?: string;
    submittedBy: "vendor" | "admin";
  }
) => {
  void insertProviderCredential({
    vendorId,
    docType: payload.docType,
    providerUserId: null,
    fileName: payload.fileName,
    storagePath: payload.storagePath,
    fileMimeType: payload.fileMimeType,
    expiryDate: payload.expiryDate || undefined,
    submittedBy: payload.submittedBy,
  });
};

export const submitVendorDoctorApc = async (
  vendorId: string,
  payload: {
    providerUserId: string;
    fileName: string;
    storagePath?: string;
    fileMimeType?: string;
    expiryDate: string;
    submittedBy: "vendor" | "admin";
  }
) => {
  await insertProviderCredential({
    vendorId,
    docType: PROVIDER_CREDENTIAL_DOC_TYPES.APC,
    providerUserId: payload.providerUserId,
    fileName: payload.fileName,
    storagePath: payload.storagePath,
    fileMimeType: payload.fileMimeType,
    expiryDate: payload.expiryDate,
    submittedBy: payload.submittedBy,
  });
};

const getExpiryState = (expiryDate?: string) => {
  if (!expiryDate) return "missing";
  if (expiryDate < TODAY_KEY) return "expired";
  return "valid";
};

const getDocumentState = (doc?: VendorComplianceDocument | VendorDoctorApc, docType?: ProviderCredentialDocType | string) => {
  if (!doc || doc.status === "missing" || !doc.fileName) return "missing";
  if (doc.status === "rejected") return "rejected";
  if (doc.status === "submitted") return "submitted";
  // Non-expiry doc types: once approved, always valid (never check expiry)
  if (docType && NON_EXPIRY_DOC_TYPES.has(docType as ProviderCredentialDocType)) return "approved";
  return getExpiryState(doc.expiryDate) === "expired" ? "expired" : "approved";
};

export const isProviderCompliant = (vendorId: string) => {
  const provider = getProviderById(vendorId);
  if (!provider) return false;
  const compliance = provider.compliance || getProviderComplianceByVendorId(vendorId);
  
  // APC: Required — at least one active doctor must have approved APC
  const apcStates = (compliance.doctorApcs || [])
    .filter((doc) => {
      const doctor = getProviderUserById(vendorId, doc.providerUserId);
      const role = normalizeProviderUserRole(doctor?.role);
      return !!doctor && doctor.status === "Active" && role === "doctor";
    })
    .map((doc) => getDocumentState(doc, PROVIDER_CREDENTIAL_DOC_TYPES.APC));
  if (apcStates.length === 0) return false;
  const hasApprovedApc = apcStates.some((state) => state === "approved");
  if (!hasApprovedApc) return false;

  // SSM: Required — must be approved (non-expiry)
  const ssmDoc = (compliance.documents || []).find((d) => d.docType === PROVIDER_CREDENTIAL_DOC_TYPES.SSM);
  const ssmState = getDocumentState(ssmDoc, PROVIDER_CREDENTIAL_DOC_TYPES.SSM);
  if (ssmState !== "approved") return false;

  // Borang B OR Borang F: At least one must be approved (non-expiry)
  const borangB = (compliance.documents || []).find((d) => d.docType === PROVIDER_CREDENTIAL_DOC_TYPES.BORANG_B);
  const borangBState = getDocumentState(borangB, PROVIDER_CREDENTIAL_DOC_TYPES.BORANG_B);
  const clinicState = getDocumentState(compliance.clinicLicense, PROVIDER_CREDENTIAL_DOC_TYPES.CLINIC_LICENSE);
  const hasEitherBOrF = borangBState === "approved" || clinicState === "approved";
  if (!hasEitherBOrF) return false;

  // TCM: Optional — not checked
  
  return true;
};

export const isProviderBlockedByCompliance = (vendorId: string) => {
  return !isProviderCompliant(vendorId);
};
