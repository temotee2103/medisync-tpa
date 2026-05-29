import { assertEmergencyReleaseLimit } from "@/lib/emergencyReleaseLimits";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type JsonRecord = Record<string, unknown>;

type ProviderClaimRow = {
  id: string;
  claim_number: string | null;
  provider_id: string | null;
  company_id: string | null;
  member_id: string | null;
  member_record_id: string | null;
  dependent_id: string | null;
  provider_user_id: string | null;
  submitted_by_profile_id: string | null;
  treatment_date: string;
  invoice_number: string | null;
  diagnosis_code: string | null;
  diagnosis_codes: string[];
  diagnosis_summary: string | null;
  medication_description: string | null;
  total_amount: string | number;
  status: string | null;
  charge_breakdown: JsonRecord | null;
  selected_charge_items: JsonRecord | null;
  service_type: string | null;
  rate_card_category: string | null;
  rate_card_snapshot: JsonRecord | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_profile_id: string | null;
  review_note: string | null;
  approval_attachment_path: string | null;
  approval_attachment_name: string | null;
  approved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  members?:
    | { full_name: string | null; staff_id: string | null }
    | Array<{ full_name: string | null; staff_id: string | null }>
    | null;
  dependents?: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  providers?:
    | { provider_name: string | null; vendor_id: string | null }
    | Array<{ provider_name: string | null; vendor_id: string | null }>
    | null;
};

type ProviderClaimDocumentRow = {
  id: string;
  provider_claim_id: string | null;
  doc_type: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  uploaded_by_profile_id: string | null;
  created_at: string | null;
};

export type ProviderClaimRecord = {
  id: string;
  claimNumber: string;
  providerId: string;
  providerName?: string;
  providerVendorId?: string;
  companyId?: string;
  memberId?: string;
  memberRecordId?: string;
  dependentId?: string;
  patientName?: string;
  patientStaffId?: string;
  providerUserId?: string;
  submittedByProfileId?: string;
  treatmentDate: string;
  invoiceNumber?: string;
  diagnosisCode?: string;
  diagnosisCodes: string[];
  diagnosisSummary?: string;
  medicationDescription?: string;
  totalAmount: number;
  status: string;
  chargeBreakdown: JsonRecord;
  selectedChargeItems: JsonRecord;
  serviceType?: string;
  rateCardCategory?: string;
  rateCardSnapshot: JsonRecord;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedByProfileId?: string;
  reviewNote?: string;
  approvalAttachmentPath?: string;
  approvalAttachmentName?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderClaimDocumentType = "final_bill" | "mc" | "referral_letter";

export type ProviderClaimDocumentRecord = {
  id: string;
  providerClaimId: string;
  docType: string;
  storagePath: string;
  fileName?: string;
  mimeType?: string;
  uploadedByProfileId?: string;
  createdAt: string;
};

export type ProviderClaimInsertPayload = Record<string, unknown>;

export type ProviderClaimUpdatePayload = Record<string, unknown>;

export type ProviderClaimDocumentInsertPayload = Record<string, unknown>;

const toStringValue = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};

const toOptionalString = (value: unknown) => {
  const next = toStringValue(value);
  return next || undefined;
};

const toNumberValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }
  return 0;
};

const toStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toStringValue(item)).filter(Boolean);
};

const toJsonRecord = (value: unknown): JsonRecord => {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as JsonRecord;
};

const pickFirstRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
};

const mapProviderClaimRow = (row: ProviderClaimRow): ProviderClaimRecord => {
  const member = pickFirstRelation(row.members);
  const dependent = pickFirstRelation(row.dependents);
  const provider = pickFirstRelation(row.providers);

  return {
    id: toStringValue(row.id),
    claimNumber: toStringValue(row.claim_number),
    providerId: toStringValue(row.provider_id),
    providerName: toOptionalString(provider?.provider_name),
    providerVendorId: toOptionalString(provider?.vendor_id),
    companyId: toOptionalString(row.company_id),
    memberId: toOptionalString(row.member_id),
    memberRecordId: toOptionalString(row.member_record_id),
    dependentId: toOptionalString(row.dependent_id),
    patientName: toOptionalString(dependent?.full_name) || toOptionalString(member?.full_name),
    patientStaffId: toOptionalString(member?.staff_id),
    providerUserId: toOptionalString(row.provider_user_id),
    submittedByProfileId: toOptionalString(row.submitted_by_profile_id),
    treatmentDate: toStringValue(row.treatment_date),
    invoiceNumber: toOptionalString(row.invoice_number),
    diagnosisCode: toOptionalString(row.diagnosis_code),
    diagnosisCodes: toStringArray(row.diagnosis_codes),
    diagnosisSummary: toOptionalString(row.diagnosis_summary),
    medicationDescription: toOptionalString(row.medication_description),
    totalAmount: toNumberValue(row.total_amount),
    status: toStringValue(row.status, "submitted"),
    chargeBreakdown: toJsonRecord(row.charge_breakdown),
    selectedChargeItems: toJsonRecord(row.selected_charge_items),
    serviceType: toOptionalString(row.service_type),
    rateCardCategory: toOptionalString(row.rate_card_category),
    rateCardSnapshot: toJsonRecord(row.rate_card_snapshot),
    submittedAt: toOptionalString(row.submitted_at),
    reviewedAt: toOptionalString(row.reviewed_at),
    reviewedByProfileId: toOptionalString(row.reviewed_by_profile_id),
    reviewNote: toOptionalString(row.review_note),
    approvalAttachmentPath: toOptionalString(row.approval_attachment_path),
    approvalAttachmentName: toOptionalString(row.approval_attachment_name),
    approvedAt: toOptionalString(row.approved_at),
    createdAt: toStringValue(row.created_at),
    updatedAt: toStringValue(row.updated_at),
  };
};

const mapProviderClaimDocumentRow = (row: ProviderClaimDocumentRow): ProviderClaimDocumentRecord => ({
  id: toStringValue(row.id),
  providerClaimId: toStringValue(row.provider_claim_id),
  docType: toStringValue(row.doc_type),
  storagePath: toStringValue(row.storage_path),
  fileName: toOptionalString(row.file_name),
  mimeType: toOptionalString(row.mime_type),
  uploadedByProfileId: toOptionalString(row.uploaded_by_profile_id),
  createdAt: toStringValue(row.created_at),
});

let providerClaimsSnapshot: ProviderClaimRecord[] = [];
let providerClaimDocumentsSnapshot: ProviderClaimDocumentRecord[] = [];
let providerClaimsInitialized = false;

const providerClaimListeners = new Set<() => void>();

const PROVIDER_CLAIMS_SERVER_SNAPSHOT: ProviderClaimRecord[] = [];
const PROVIDER_CLAIM_DOCUMENTS_SERVER_SNAPSHOT: ProviderClaimDocumentRecord[] = [];

const emitProviderClaims = () => {
  providerClaimListeners.forEach((listener) => listener());
};

export const subscribeProviderClaims = (listener: () => void) => {
  providerClaimListeners.add(listener);
  return () => providerClaimListeners.delete(listener);
};

export const getProviderClaimsSnapshot = () => providerClaimsSnapshot;

export const getProviderClaimsServerSnapshot = () => PROVIDER_CLAIMS_SERVER_SNAPSHOT;

export const getProviderClaimDocumentsSnapshot = () => providerClaimDocumentsSnapshot;

export const getProviderClaimDocumentsServerSnapshot = () => PROVIDER_CLAIM_DOCUMENTS_SERVER_SNAPSHOT;

export const refreshProviderClaimsSnapshot = async () => {
  if (typeof window === "undefined") return;

  const supabase = createSupabaseBrowserClient();
  const [
    { data: claimRows, error: claimsError },
    { data: documentRows, error: documentsError },
  ] = await Promise.all([
    supabase
      .from("provider_claims")
      .select(
        "id,claim_number,provider_id,company_id,member_id,member_record_id,dependent_id,provider_user_id,submitted_by_profile_id,treatment_date,invoice_number,diagnosis_code,diagnosis_codes,diagnosis_summary,medication_description,total_amount,status,charge_breakdown,selected_charge_items,service_type,rate_card_category,rate_card_snapshot,submitted_at,reviewed_at,reviewed_by_profile_id,review_note,approval_attachment_path,approval_attachment_name,approved_at,created_at,updated_at,members(full_name,staff_id),dependents(full_name),providers(provider_name,vendor_id)"
      )
      .order("submitted_at", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("provider_claim_documents")
      .select("id,provider_claim_id,doc_type,storage_path,file_name,mime_type,uploaded_by_profile_id,created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (claimsError) throw claimsError;
  if (documentsError) throw documentsError;

  providerClaimsSnapshot = ((claimRows as ProviderClaimRow[] | null) || []).map(mapProviderClaimRow);
  providerClaimDocumentsSnapshot = ((documentRows as ProviderClaimDocumentRow[] | null) || []).map(
    mapProviderClaimDocumentRow
  );

  emitProviderClaims();
};

export const ensureProviderClaimsStore = () => {
  if (typeof window === "undefined") return;
  if (providerClaimsInitialized) return;
  providerClaimsInitialized = true;
  void refreshProviderClaimsSnapshot();
};

export const resetProviderClaimsStore = () => {
  providerClaimsSnapshot = [];
  providerClaimDocumentsSnapshot = [];
  providerClaimsInitialized = false;
  emitProviderClaims();
};

export const insertProviderClaim = async (payload: ProviderClaimInsertPayload) => {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("provider_claims").insert(payload).select("id").single();

  if (error) throw error;

  await refreshProviderClaimsSnapshot();

  return toStringValue(data?.id);
};

export const updateProviderClaim = async (
  providerClaimId: string,
  payload: ProviderClaimUpdatePayload
) => {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("provider_claims").update(payload).eq("id", providerClaimId);

  if (error) throw error;

  await refreshProviderClaimsSnapshot();
};

export const updateProviderClaimLifecycle = async (
  providerClaimId: string,
  payload: {
    status: string;
    reviewed_at?: string | null;
    reviewed_by_profile_id?: string | null;
    review_note?: string | null;
    approval_attachment_path?: string | null;
    approval_attachment_name?: string | null;
    approved_at?: string | null;
  }
) => {
  const supabase = createSupabaseBrowserClient();
  if (String(payload.status || "").trim().toLowerCase() === "in_process") {
    const currentClaim =
      providerClaimsSnapshot.find((claim) => claim.id === providerClaimId) ||
      null;

    if (!currentClaim) {
      throw new Error("Provider claim not found.");
    }

    await assertEmergencyReleaseLimit({
      category: currentClaim.rateCardCategory || currentClaim.serviceType || "GP",
      amount: currentClaim.totalAmount,
    });
  }
  const { error } = await supabase.from("provider_claims").update(payload).eq("id", providerClaimId);

  if (error) throw error;

  await refreshProviderClaimsSnapshot();
};

export const completeProviderClaimPayment = async (
  providerClaimId: string,
  payload: {
    approval_attachment_name: string;
    approval_attachment_path: string;
    approved_at: string;
    reviewed_by_profile_id?: string | null;
    review_note?: string | null;
  }
) => {
  return updateProviderClaimLifecycle(providerClaimId, {
    status: "approved",
    reviewed_at: payload.approved_at,
    reviewed_by_profile_id: payload.reviewed_by_profile_id || null,
    review_note: payload.review_note || null,
    approval_attachment_name: payload.approval_attachment_name,
    approval_attachment_path: payload.approval_attachment_path,
    approved_at: payload.approved_at,
  });
};

export const insertProviderClaimDocuments = async (rows: ProviderClaimDocumentInsertPayload[]) => {
  if (rows.length === 0) return;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("provider_claim_documents").insert(rows);

  if (error) throw error;

  await refreshProviderClaimsSnapshot();
};

export const upsertProviderClaimDocument = async (
  providerClaimId: string,
  docType: ProviderClaimDocumentType,
  payload: {
    storage_path: string;
    file_name?: string;
    mime_type?: string;
    uploaded_by_profile_id?: string | null;
  }
) => {
  const supabase = createSupabaseBrowserClient();
  const existing = getProviderClaimDocumentByType(providerClaimId, docType);

  if (existing) {
    const { error } = await supabase
      .from("provider_claim_documents")
      .update({
        storage_path: payload.storage_path,
        file_name: payload.file_name || null,
        mime_type: payload.mime_type || null,
        uploaded_by_profile_id: payload.uploaded_by_profile_id || null,
      })
      .eq("id", existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase.from("provider_claim_documents").insert({
      provider_claim_id: providerClaimId,
      doc_type: docType,
      storage_path: payload.storage_path,
      file_name: payload.file_name || null,
      mime_type: payload.mime_type || null,
      uploaded_by_profile_id: payload.uploaded_by_profile_id || null,
    });

    if (error) throw error;
  }

  await refreshProviderClaimsSnapshot();
};

export const updateProviderClaimStatus = async (
  providerClaimId: string,
  status: "submitted" | "approved" | "rejected" | "request_additional_information"
) => {
  const supabase = createSupabaseBrowserClient();
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("provider_claims").update(patch).eq("id", providerClaimId);

  if (error) throw error;

  await refreshProviderClaimsSnapshot();
};

export const getProviderClaimsByProvider = (providerUuid: string) => {
  if (!providerUuid) return [];
  return providerClaimsSnapshot.filter((row) => row.providerId === providerUuid);
};

export const getProviderClaimById = (providerClaimId: string) =>
  providerClaimsSnapshot.find((row) => row.id === providerClaimId) || null;

export const getProviderClaimByClaimNumber = (claimNumber: string) =>
  providerClaimsSnapshot.find((row) => row.claimNumber === claimNumber) || null;

export const getProviderClaimsByProviderAndStatus = (providerUuid: string, statuses: string[]) => {
  if (!providerUuid || statuses.length === 0) return [];

  const normalizedStatuses = new Set(
    statuses.map((status) => status.trim().toLowerCase()).filter(Boolean)
  );

  return providerClaimsSnapshot.filter(
    (row) =>
      row.providerId === providerUuid &&
      normalizedStatuses.has(row.status.trim().toLowerCase())
  );
};

export const getProviderClaimDocuments = (providerClaimId: string) => {
  if (!providerClaimId) return [];
  return providerClaimDocumentsSnapshot.filter((row) => row.providerClaimId === providerClaimId);
};

export const getProviderClaimDocumentByType = (
  providerClaimId: string,
  docType: ProviderClaimDocumentType
) => {
  return getProviderClaimDocuments(providerClaimId).find((row) => row.docType === docType);
};
