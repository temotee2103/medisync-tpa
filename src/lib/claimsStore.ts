import { consumeReservation, releaseReservation } from "@/lib/entitlementStore";
import { canTransition, CLAIM_STATUS, type ClaimStatus } from "@/lib/claimFlow";
import { assertEmergencyReleaseLimit } from "@/lib/emergencyReleaseLimits";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  formatLegacyCompatibleClaimStatus,
  formatUnifiedClaimStatus,
  normalizeUnifiedClaimStatus,
  type UnifiedClaimStatus,
} from "@/lib/unifiedClaimLifecycle";

export type AdminClaimRecord = {
  id: string;
  providerUuid?: string;
  companyId?: string;
  memberId?: string;
  dependentId?: string;
  hospital: string;
  patient: string;
  amount: number;
  status: string;
  lifecycleStatus?: UnifiedClaimStatus;
  statusLabel?: string;
  date: string;
  createdAt?: string;
  submittedAt?: string;
  patientId?: string;
  doctorName?: string;
  doctorUserId?: string;
  operatorName?: string;
  operatorMemberId?: string;
  serviceType?: string;
  diagnosis?: string;
  diagnosisCodes?: string[];
  medicationDescription?: string;
  consultationFee?: string;
  medicationFee?: string;
  injectionFee?: string;
  investigationFee?: string;
  procedureFee?: string;
  immunizationFee?: string;
  selectedChargeItems?: Record<string, string[]>;
  selectedChargeItemMeta?: Record<string, Record<string, { quantity: string; unit: string; frequency: string }>>;
  mcRequired?: boolean;
  mcFrom?: string;
  mcTo?: string;
  mcDays?: number;
  rlRequired?: boolean;
  mcFileName?: string;
  referralFileName?: string;
  finalBillFileName?: string;
  memberKey?: string;
  limitCategory?: string;
  reservedAmount?: number;
  claimSource?: "provider_cashless";
  submittedByProfileId?: string;
  auditTrail?: Array<{
    at: string;
    actorType: "admin" | "accountant" | "provider_user" | "member";
    actorId: string;
    actorName?: string;
    action: string;
    fromStatus?: string;
    toStatus?: string;
    note?: string;
  }>;
  rejectionReason?: string;
  bankSlipFileName?: string;
  bankSlipDataUrl?: string;
  bankSlipUploadedAt?: string;
  pvFileName?: string;
  pvDataUrl?: string;
  pvUploadedAt?: string;
};

export type AdminClaimRequestRecord = {
  token: string;
  id: string;
  note: string;
  createdAt: string;
};

export type MemberClaimRecord = {
  id: string;
  companyId?: string;
  memberId?: string;
  dependentId?: string;
  patient: string;
  patientId?: string;
  category: string;
  visitDate: string;
  providerName: string;
  diagnosis?: string;
  amountSubmitted: string;
  invoiceReceiptNo: string;
  receiptFiles: string[];
  referralFileName: string;
  mcFileName: string;
  rlFileName: string;
  mcRequired?: boolean;
  mcFrom?: string;
  mcTo?: string;
  mcDays?: number;
  status: string;
  lifecycleStatus?: UnifiedClaimStatus;
  statusLabel?: string;
  createdAt: string;
  claimSource?: "member_reimbursement";
  submittedByProfileId?: string;
  auditTrail?: AdminClaimRecord["auditTrail"];
  rejectionReason?: string;
  bankSlipFileName?: string;
  bankSlipDataUrl?: string;
  bankSlipUploadedAt?: string;
  memberKey?: string;
  limitCategory?: string;
  reservedAmount?: number;
  pvFileName?: string;
  pvDataUrl?: string;
  pvUploadedAt?: string;
};

export type ClaimRow = {
  id: string;
  claim_number: string | null;
  member_id: string | null;
  dependent_id: string | null;
  provider_id: string | null;
  submitted_by_profile_id: string | null;
  category_code: string;
  visit_date: string;
  provider_name: string | null;
  diagnosis: string | null;
  diagnosis_codes: string[];
  diagnosis_summary: string | null;
  medication_description: string | null;
  invoice_number: string | null;
  amount: string | number;
  status: string | null;
  referral_date: string | null;
  service_type: string | null;
  rate_card_category: string | null;
  rate_card_snapshot: unknown;
  charge_breakdown: Record<string, unknown>;
  selected_charge_items: Record<string, unknown>;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string;
  members?: { full_name: string; staff_id: string; company_id: string | null } | null;
  dependents?: { full_name: string } | null;
  providers?: { provider_name: string; vendor_id: string } | null;
};

type ClaimRowWithJson = ClaimRow & {
  charge_breakdown?: unknown;
  selected_charge_items?: unknown;
  diagnosis_codes?: unknown;
};

type ClaimSource = "provider_cashless" | "member_reimbursement";

export type MemberClaimScope = {
  companyId?: string;
  staffId?: string;
  memberId?: string;
  dependentId?: string;
  memberKey?: string;
};

export const normalizeClaimStatus = (status?: string) => {
  return formatLegacyCompatibleClaimStatus(status);
};

export const normalizeClaimLifecycleStatus = (status?: string): UnifiedClaimStatus => {
  return normalizeUnifiedClaimStatus(status);
};

const normalizeClaimSource = (row: ClaimRow): ClaimSource => {
  const raw = (row.charge_breakdown as { claimSource?: unknown } | undefined)?.claimSource;
  if (raw === "provider_cashless" || raw === "member_reimbursement") return raw;
  return row.provider_id ? "provider_cashless" : "member_reimbursement";
};

const getChargeString = (data: Record<string, unknown>, key: string) => {
  const value = data[key];
  return typeof value === "string" ? value : "";
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
};

const getRequestedStatusKey = (status?: string) =>
  String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const isLegacyApprovedAlias = (status?: string) => {
  const key = getRequestedStatusKey(status);
  return key === "listed" || key === "paid" || key === "pv_uploaded";
};

const normalizeScopeValue = (value?: string | null) => String(value || "").trim();

const adminClaimMatchesMemberScope = (claim: AdminClaimRecord, scope: MemberClaimScope) => {
  const companyId = normalizeScopeValue(scope.companyId);
  const staffId = normalizeScopeValue(scope.staffId);
  const memberId = normalizeScopeValue(scope.memberId);
  const dependentId = normalizeScopeValue(scope.dependentId);
  const memberKey = normalizeScopeValue(scope.memberKey);

  if (!staffId && !memberId && !dependentId) return false;

  const claimCompanyId = normalizeScopeValue(claim.companyId);
  if (companyId && claimCompanyId && claimCompanyId !== companyId) return false;

  if (dependentId) {
    return normalizeScopeValue(claim.dependentId) === dependentId;
  }

  if (memberId && normalizeScopeValue(claim.memberId) === memberId) return true;
  if (staffId && normalizeScopeValue(claim.patientId) === staffId) return true;

  return Boolean(
    memberKey &&
      staffId &&
      normalizeScopeValue(claim.memberKey) === memberKey &&
      normalizeScopeValue(claim.patientId) === staffId
  );
};

const memberClaimMatchesScope = (claim: MemberClaimRecord, scope: MemberClaimScope) => {
  const companyId = normalizeScopeValue(scope.companyId);
  const staffId = normalizeScopeValue(scope.staffId);
  const memberId = normalizeScopeValue(scope.memberId);
  const dependentId = normalizeScopeValue(scope.dependentId);
  const memberKey = normalizeScopeValue(scope.memberKey);

  if (!staffId && !memberId && !dependentId) return false;

  const claimCompanyId = normalizeScopeValue(claim.companyId);
  if (companyId && claimCompanyId && claimCompanyId !== companyId) return false;

  if (dependentId) {
    return normalizeScopeValue(claim.dependentId) === dependentId;
  }

  if (memberId && normalizeScopeValue(claim.memberId) === memberId) return true;
  if (staffId && normalizeScopeValue(claim.patientId) === staffId) return true;

  return Boolean(
    memberKey &&
      staffId &&
      normalizeScopeValue(claim.memberKey) === memberKey &&
      normalizeScopeValue(claim.patientId) === staffId
  );
};

const rowToAdminClaim = (row: ClaimRow): AdminClaimRecord => {
  const details = row.charge_breakdown || {};
  const derivedCompanyId =
    row.members?.company_id ||
    getChargeString(details, "companyId") ||
    getChargeString(details, "company_id") ||
    undefined;
  const derivedMemberId =
    row.member_id ||
    getChargeString(details, "memberId") ||
    getChargeString(details, "member_id") ||
    undefined;
  const derivedDependentId =
    row.dependent_id ||
    getChargeString(details, "dependentId") ||
    getChargeString(details, "dependent_id") ||
    undefined;
  const derivedPatientId =
    row.members?.staff_id ||
    getChargeString(details, "patientId") ||
    getChargeString(details, "patient_id") ||
    getChargeString(details, "staffId") ||
    getChargeString(details, "staff_id") ||
    undefined;
  const claimNo = row.claim_number || `CLM-${row.id.slice(0, 8).toUpperCase()}`;
  const fallbackDate = row.submitted_at?.slice(0, 10) || row.created_at?.slice(0, 10) || row.visit_date;
  const lifecycleStatus = normalizeUnifiedClaimStatus(row.status || "submitted");
  return {
    ...(details as unknown as AdminClaimRecord),
    id: claimNo,
    companyId: derivedCompanyId,
    memberId: derivedMemberId,
    dependentId: derivedDependentId,
    status: normalizeClaimStatus(lifecycleStatus),
    lifecycleStatus,
    statusLabel: formatUnifiedClaimStatus(lifecycleStatus),
    hospital: row.provider_name || row.providers?.provider_name || "—",
    patient: row.dependents?.full_name || row.members?.full_name || "—",
    patientId: derivedPatientId,
    amount: toNumber(row.amount),
    date: row.visit_date || fallbackDate,
    createdAt: row.created_at || row.updated_at,
    submittedAt: row.submitted_at || undefined,
    diagnosis: row.diagnosis_summary || row.diagnosis || undefined,
    diagnosisCodes: row.diagnosis_codes || [],
    medicationDescription: row.medication_description || undefined,
    serviceType: row.service_type || row.category_code || undefined,
    selectedChargeItems: (row.selected_charge_items || {}) as Record<string, string[]>,
  };
};

const rowToMemberClaim = (row: ClaimRow): MemberClaimRecord => {
  const details = row.charge_breakdown || {};
  const claimNo = row.claim_number || `CLM-${row.id.slice(0, 8).toUpperCase()}`;
  const fallbackVisitDate =
    row.visit_date ||
    row.submitted_at?.slice(0, 10) ||
    row.created_at?.slice(0, 10) ||
    row.updated_at.slice(0, 10);
  const lifecycleStatus = normalizeUnifiedClaimStatus(row.status || "submitted");
  return {
    ...(details as unknown as MemberClaimRecord),
    id: claimNo,
    companyId: row.members?.company_id || undefined,
    memberId: row.member_id || undefined,
    dependentId: row.dependent_id || undefined,
    status: normalizeClaimStatus(lifecycleStatus),
    lifecycleStatus,
    statusLabel: formatUnifiedClaimStatus(lifecycleStatus),
    patient: row.dependents?.full_name || row.members?.full_name || "—",
    patientId: row.members?.staff_id,
    category: row.category_code || "GP",
    visitDate: row.visit_date || fallbackVisitDate,
    providerName: row.provider_name || row.providers?.provider_name || "—",
    diagnosis: row.diagnosis_summary || row.diagnosis || undefined,
    amountSubmitted: String(toNumber(row.amount)),
    invoiceReceiptNo: row.invoice_number || "",
    receiptFiles: (details as { receiptFiles?: unknown })?.receiptFiles as string[] || [],
    referralFileName: getChargeString(details, "referralFileName"),
    mcFileName: getChargeString(details, "mcFileName"),
    rlFileName: getChargeString(details, "rlFileName"),
    bankSlipFileName: getChargeString(details, "bankSlipFileName") || undefined,
    bankSlipDataUrl: getChargeString(details, "bankSlipDataUrl") || undefined,
    bankSlipUploadedAt: getChargeString(details, "bankSlipUploadedAt") || undefined,
    pvFileName: getChargeString(details, "pvFileName") || undefined,
    pvDataUrl: getChargeString(details, "pvDataUrl") || undefined,
    pvUploadedAt: getChargeString(details, "pvUploadedAt") || undefined,
    createdAt: row.created_at || row.updated_at,
  };
};

let claimRowsSnapshot: ClaimRow[] = [];
let adminClaimsSnapshot: AdminClaimRecord[] = [];
let memberClaimsSnapshot: MemberClaimRecord[] = [];
let adminClaimRequestsSnapshot: AdminClaimRequestRecord[] = [];

const ADMIN_CLAIMS_SERVER_SNAPSHOT: AdminClaimRecord[] = [];
const MEMBER_CLAIMS_SERVER_SNAPSHOT: MemberClaimRecord[] = [];

const adminClaimListeners = new Set<() => void>();
const adminClaimRequestListeners = new Set<() => void>();
const memberClaimListeners = new Set<() => void>();

const emitAdminClaims = () => {
  adminClaimListeners.forEach((listener) => listener());
};

const emitAdminClaimRequests = () => {
  adminClaimRequestListeners.forEach((listener) => listener());
};

const emitMemberClaims = () => {
  memberClaimListeners.forEach((listener) => listener());
};

export const subscribeAdminClaims = (listener: () => void) => {
  adminClaimListeners.add(listener);
  return () => adminClaimListeners.delete(listener);
};

export const subscribeAdminClaimRequests = (listener: () => void) => {
  adminClaimRequestListeners.add(listener);
  return () => adminClaimRequestListeners.delete(listener);
};

export const subscribeMemberClaims = (listener: () => void) => {
  memberClaimListeners.add(listener);
  return () => memberClaimListeners.delete(listener);
};

export const getAdminClaimsSnapshot = () => adminClaimsSnapshot;
export const getAdminClaimsServerSnapshot = () => ADMIN_CLAIMS_SERVER_SNAPSHOT;
export const getAdminClaimRequestsSnapshot = () => adminClaimRequestsSnapshot;
export const getMemberClaimsSnapshot = () => memberClaimsSnapshot;
export const getMemberClaimsServerSnapshot = () => MEMBER_CLAIMS_SERVER_SNAPSHOT;
export const getMemberScopedAdminClaimsSnapshot = (scope: MemberClaimScope) =>
  adminClaimsSnapshot.filter((claim) => adminClaimMatchesMemberScope(claim, scope));
export const getMemberScopedAdminClaimsServerSnapshot = (scope: MemberClaimScope) =>
  ADMIN_CLAIMS_SERVER_SNAPSHOT.filter((claim) => adminClaimMatchesMemberScope(claim, scope));
export const getMemberScopedMemberClaimsSnapshot = (scope: MemberClaimScope) =>
  memberClaimsSnapshot.filter((claim) => memberClaimMatchesScope(claim, scope));
export const getMemberScopedMemberClaimsServerSnapshot = (scope: MemberClaimScope) =>
  MEMBER_CLAIMS_SERVER_SNAPSHOT.filter((claim) => memberClaimMatchesScope(claim, scope));

const rebuildDerivedSnapshots = () => {
  const admin: AdminClaimRecord[] = [];
  const member: MemberClaimRecord[] = [];
  claimRowsSnapshot.forEach((row) => {
    const source = normalizeClaimSource(row);
    if (source === "provider_cashless") {
      admin.push(rowToAdminClaim(row));
      return;
    }
    member.push(rowToMemberClaim(row));
  });
  adminClaimsSnapshot = admin;
  memberClaimsSnapshot = member;
};

export const fetchClaimRows = async (): Promise<ClaimRow[]> => {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("public")
    .from("claims")
    .select(
      "id,claim_number,member_id,dependent_id,provider_id,submitted_by_profile_id,category_code,visit_date,provider_name,diagnosis,amount,status,referral_date,created_at,updated_at,submitted_at,reviewed_at,diagnosis_codes,diagnosis_summary,medication_description,charge_breakdown,selected_charge_items,invoice_number,service_type,rate_card_category,rate_card_snapshot,members(full_name,staff_id,company_id),dependents(full_name),providers(provider_name,vendor_id)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data || []) as unknown as ClaimRow[]).map((row) => {
    const rawRow = row as ClaimRowWithJson;
    return {
    ...row,
    charge_breakdown: ((rawRow.charge_breakdown as Record<string, unknown> | undefined) || {}) as Record<string, unknown>,
    selected_charge_items:
      ((rawRow.selected_charge_items as Record<string, unknown> | undefined) || {}) as Record<string, unknown>,
    diagnosis_codes: Array.isArray(rawRow.diagnosis_codes) ? (rawRow.diagnosis_codes as string[]) : [],
  };
  });
};

export const refreshClaimsSnapshot = async () => {
  claimRowsSnapshot = await fetchClaimRows();
  rebuildDerivedSnapshots();
  emitAdminClaims();
  emitMemberClaims();
};

export const ensureAdminClaimsSeed = () => {};
export const ensureMemberClaimsStore = () => {};

export const refreshAdminClaimsSnapshot = async () => {
  await refreshClaimsSnapshot();
};

export const refreshMemberClaimsSnapshot = async () => {
  await refreshClaimsSnapshot();
};

export const refreshAdminClaimRequestsSnapshot = () => {
  emitAdminClaimRequests();
};

export const resetClaimsStore = () => {
  claimRowsSnapshot = [];
  adminClaimsSnapshot = [];
  memberClaimsSnapshot = [];
  adminClaimRequestsSnapshot = [];
  emitAdminClaims();
  emitAdminClaimRequests();
  emitMemberClaims();
};

type ClaimTransitionOptions = {
  claimSource?: ClaimSource;
  rejectionReason?: string;
  bankSlipFileName?: string;
  bankSlipDataUrl?: string;
  bankSlipUploadedAt?: string;
  pvFileName?: string;
  pvDataUrl?: string;
  pvUploadedAt?: string;
  actorType?: NonNullable<AdminClaimRecord["auditTrail"]>[number]["actorType"];
  actorId?: string;
  actorName?: string;
  note?: string;
};

export const transitionClaimStatus = async (claimId: string, nextStatus: string, options?: ClaimTransitionOptions) => {
  const supabase = createSupabaseBrowserClient();
  const { data: row, error } = await supabase
    .schema("public")
    .from("claims")
    .select(
      "id,claim_number,member_id,dependent_id,provider_id,submitted_by_profile_id,category_code,visit_date,provider_name,diagnosis,amount,status,referral_date,created_at,updated_at,submitted_at,reviewed_at,diagnosis_codes,diagnosis_summary,medication_description,charge_breakdown,selected_charge_items,invoice_number,service_type,rate_card_category,rate_card_snapshot"
    )
    .eq("claim_number", claimId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Claim not found.");

  const rawRow = row as ClaimRowWithJson;
  const normalizedRow = {
    ...(row as unknown as ClaimRow),
    charge_breakdown: ((rawRow.charge_breakdown as Record<string, unknown> | undefined) || {}) as Record<string, unknown>,
    selected_charge_items:
      ((rawRow.selected_charge_items as Record<string, unknown> | undefined) || {}) as Record<string, unknown>,
    diagnosis_codes: Array.isArray(rawRow.diagnosis_codes) ? (rawRow.diagnosis_codes as string[]) : [],
  };
  const claimSource = normalizeClaimSource(normalizedRow);
  if (options?.claimSource && options.claimSource !== claimSource) {
    throw new Error("Claim not found.");
  }

  const fromStatus = normalizeUnifiedClaimStatus(normalizedRow.status || undefined) as ClaimStatus;
  const toStatus = normalizeUnifiedClaimStatus(nextStatus) as ClaimStatus;
  const requestedStatusKey = getRequestedStatusKey(nextStatus);
  const legacyApprovedAlias = isLegacyApprovedAlias(nextStatus);
  const sameLifecycleStatus = fromStatus === toStatus;
  const hasMetadataUpdate =
    Boolean(options?.rejectionReason?.trim()) ||
    Boolean(options?.bankSlipFileName?.trim()) ||
    Boolean(options?.bankSlipDataUrl) ||
    Boolean(options?.bankSlipUploadedAt) ||
    Boolean(options?.pvFileName?.trim()) ||
    Boolean(options?.pvDataUrl) ||
    Boolean(options?.pvUploadedAt) ||
    Boolean(options?.note?.trim());

  if (sameLifecycleStatus && !hasMetadataUpdate) return;
  if (!sameLifecycleStatus && !canTransition(fromStatus, toStatus)) {
    throw new Error(`Cannot transition claim from "${fromStatus}" to "${toStatus}".`);
  }

  const existingDetails = normalizedRow.charge_breakdown || {};
  const bankSlipFileName = options?.bankSlipFileName?.trim() || getChargeString(existingDetails, "bankSlipFileName");
  const bankSlipDataUrl = options?.bankSlipDataUrl || (existingDetails.bankSlipDataUrl as string | undefined);
  const bankSlipUploadedAt = options?.bankSlipUploadedAt || (existingDetails.bankSlipUploadedAt as string | undefined);

  if (toStatus === CLAIM_STATUS.APPROVED && !legacyApprovedAlias && (!bankSlipFileName || !bankSlipDataUrl)) {
    throw new Error("Bank-in slip is required before approving a claim.");
  }

  if (toStatus === CLAIM_STATUS.IN_PROCESS) {
    await assertEmergencyReleaseLimit({
      category: String(normalizedRow.category_code || normalizedRow.service_type || normalizedRow.rate_card_category || "GP"),
      amount: Number(normalizedRow.amount || 0),
    });
  }

  if (requestedStatusKey === "pv_uploaded") {
    const pvFileName = options?.pvFileName?.trim() || getChargeString(existingDetails, "pvFileName");
    const pvDataUrl = options?.pvDataUrl || (existingDetails.pvDataUrl as string | undefined);
    if (!pvFileName || !pvDataUrl) {
      throw new Error("PV file is required before marking a claim as PV Uploaded.");
    }
  }

  const actorType = options?.actorType || "admin";
  const actorId = options?.actorId || "admin";
  const auditTrail = Array.isArray(existingDetails.auditTrail) ? existingDetails.auditTrail : [];

  const nextDetails: Record<string, unknown> = {
    ...existingDetails,
    claimSource,
    status: toStatus,
    lifecycleStatus: toStatus,
    statusLabel: formatUnifiedClaimStatus(toStatus),
    rejectionReason:
      toStatus === CLAIM_STATUS.REJECTED
        ? options?.rejectionReason?.trim() || (existingDetails.rejectionReason as string | undefined)
        : undefined,
    bankSlipFileName: bankSlipFileName || undefined,
    bankSlipDataUrl: bankSlipDataUrl || undefined,
    bankSlipUploadedAt: bankSlipUploadedAt || undefined,
    pvFileName: options?.pvFileName?.trim() || (existingDetails.pvFileName as string | undefined),
    pvDataUrl: options?.pvDataUrl || (existingDetails.pvDataUrl as string | undefined),
    pvUploadedAt: options?.pvUploadedAt || (existingDetails.pvUploadedAt as string | undefined),
    auditTrail: [
      ...(auditTrail as unknown[]),
      {
        at: new Date().toISOString(),
        actorType,
        actorId,
        actorName: options?.actorName,
        action: "status_change",
        fromStatus,
        toStatus,
        note: options?.note || (toStatus === CLAIM_STATUS.REJECTED ? options?.rejectionReason?.trim() : undefined),
      },
    ],
  };

  const nowIso = new Date().toISOString();
  const reviewed_at = nowIso;
  const submitted_at = normalizedRow.submitted_at || nowIso;

  const { error: updateError } = await supabase
    .schema("public")
    .from("claims")
    .update({
      status: toStatus,
      submitted_at,
      reviewed_at,
      updated_at: nowIso,
      charge_breakdown: nextDetails,
    })
    .eq("id", normalizedRow.id);
  if (updateError) throw updateError;

  await refreshClaimsSnapshot();

  if (toStatus === CLAIM_STATUS.APPROVED && fromStatus !== CLAIM_STATUS.APPROVED) {
    consumeReservation(claimId, nowIso);
  }
  if (toStatus === CLAIM_STATUS.REJECTED && fromStatus !== CLAIM_STATUS.REJECTED) {
    releaseReservation(claimId);
  }
};

export const updateAdminClaimStatus = (
  claimId: string,
  nextStatus: string,
  options?: {
    rejectionReason?: string;
    bankSlipFileName?: string;
    bankSlipDataUrl?: string;
    bankSlipUploadedAt?: string;
    pvFileName?: string;
    pvDataUrl?: string;
    pvUploadedAt?: string;
  }
) => {
  return transitionClaimStatus(claimId, nextStatus, {
    ...(options || {}),
    claimSource: "provider_cashless",
    actorType: "admin",
    actorId: "admin",
  });
};

export const deleteAdminClaim = (claimId: string) => {
  const supabase = createSupabaseBrowserClient();
  return supabase
    .schema("public")
    .from("claims")
    .delete()
    .eq("claim_number", claimId)
    .then(({ error }) => {
      if (error) throw error;
      return refreshClaimsSnapshot();
    })
    .then(() => {
      releaseReservation(claimId);
    });
};

export const addAdminClaim = (claim: AdminClaimRecord) => {
  const supabase = createSupabaseBrowserClient();
  return supabase.auth.getUser().then(async ({ data }) => {
    const userId = data.user?.id || null;
    const nowIso = new Date().toISOString();
    const lifecycleStatus = normalizeUnifiedClaimStatus(claim.lifecycleStatus || claim.status);
    const details = {
      ...(claim as unknown as Record<string, unknown>),
      lifecycleStatus,
      statusLabel: claim.statusLabel || formatUnifiedClaimStatus(lifecycleStatus),
      claimSource: "provider_cashless",
    } as Record<string, unknown>;
    const { error } = await supabase.schema("public").from("claims").insert(
      {
        claim_number: claim.id,
        status: lifecycleStatus,
        category_code: claim.limitCategory || claim.serviceType || "GP",
        visit_date: claim.date || nowIso.slice(0, 10),
        provider_id: claim.providerUuid || null,
        provider_name: claim.hospital || null,
        diagnosis_summary: claim.diagnosis || null,
        amount: claim.amount || 0,
        submitted_at: claim.submittedAt || claim.createdAt || nowIso,
        submitted_by_profile_id: claim.submittedByProfileId || userId,
        updated_at: nowIso,
        charge_breakdown: details,
        selected_charge_items: (claim.selectedChargeItems || {}) as unknown,
      },
    );
    if (error) throw error;
    await refreshClaimsSnapshot();
  });
};

export const addAdminClaimRequest = (request: AdminClaimRequestRecord) => {
  adminClaimRequestsSnapshot = [...adminClaimRequestsSnapshot, request];
  emitAdminClaimRequests();
};

export const removeAdminClaimRequest = (token: string) => {
  adminClaimRequestsSnapshot = adminClaimRequestsSnapshot.filter((item) => item.token !== token);
  emitAdminClaimRequests();
};

export const addMemberClaim = (claim: MemberClaimRecord) => {
  const supabase = createSupabaseBrowserClient();
  return supabase.auth.getUser().then(async ({ data }) => {
    const userId = data.user?.id || null;
    const nowIso = new Date().toISOString();
    const lifecycleStatus = normalizeUnifiedClaimStatus(claim.lifecycleStatus || claim.status);
    const details = {
      ...(claim as unknown as Record<string, unknown>),
      lifecycleStatus,
      statusLabel: claim.statusLabel || formatUnifiedClaimStatus(lifecycleStatus),
      claimSource: "member_reimbursement",
    } as Record<string, unknown>;
    const { error } = await supabase.schema("public").from("claims").upsert(
      {
        claim_number: claim.id,
        status: lifecycleStatus,
        category_code: claim.limitCategory || claim.category || "GP",
        visit_date: claim.visitDate || nowIso.slice(0, 10),
        provider_name: claim.providerName || null,
        diagnosis_summary: claim.diagnosis || null,
        amount: Number(claim.amountSubmitted || 0) || 0,
        invoice_number: claim.invoiceReceiptNo || null,
        submitted_at: claim.createdAt || nowIso,
        submitted_by_profile_id: claim.submittedByProfileId || userId,
        updated_at: nowIso,
        charge_breakdown: details,
      },
      { onConflict: "claim_number" }
    );
    if (error) throw error;
    await refreshClaimsSnapshot();
  });
};

export const updateMemberClaimStatus = (
  claimId: string,
  nextStatus: string,
  options?: {
    rejectionReason?: string;
    bankSlipFileName?: string;
    bankSlipDataUrl?: string;
    bankSlipUploadedAt?: string;
    pvFileName?: string;
    pvDataUrl?: string;
    pvUploadedAt?: string;
  }
) => {
  return transitionClaimStatus(claimId, nextStatus, {
    ...(options || {}),
    claimSource: "member_reimbursement",
    actorType: "admin",
    actorId: "admin",
  });
};

export const completeMemberClaimPayment = (
  claimId: string,
  payload: {
    bankSlipFileName: string;
    bankSlipDataUrl: string;
    bankSlipUploadedAt: string;
    actorId?: string;
    actorName?: string;
  }
) => {
  return transitionClaimStatus(claimId, CLAIM_STATUS.APPROVED, {
    bankSlipFileName: payload.bankSlipFileName,
    bankSlipDataUrl: payload.bankSlipDataUrl,
    bankSlipUploadedAt: payload.bankSlipUploadedAt,
    claimSource: "member_reimbursement",
    actorType: "accountant",
    actorId: payload.actorId || "accountant",
    actorName: payload.actorName,
  });
};

export const deleteMemberClaim = (claimId: string) => {
  const supabase = createSupabaseBrowserClient();
  return supabase
    .schema("public")
    .from("claims")
    .delete()
    .eq("claim_number", claimId)
    .then(({ error }) => {
      if (error) throw error;
      return refreshClaimsSnapshot();
    })
    .then(() => {
      releaseReservation(claimId);
    });
};
