import { consumeReservation, releaseReservation } from "@/lib/entitlementStore";

export type AdminClaimRecord = {
  id: string;
  hospital: string;
  patient: string;
  amount: number;
  status: string;
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
  medicationFee?: string;
  injectionFee?: string;
  investigationFee?: string;
  procedureFee?: string;
  immunizationFee?: string;
  selectedChargeItems?: Record<string, string[]>;
  mcFileName?: string;
  referralFileName?: string;
  finalBillFileName?: string;
  /**
   * Entitlement reservation details (localStorage-backed for now).
   * Reservation is created on draft/submit and consumed only when admin approves.
   */
  memberKey?: string;
  limitCategory?: string;
  reservedAmount?: number;
  claimSource?: "provider_cashless";
  submittedByProfileId?: string;
  auditTrail?: Array<{
    at: string;
    actorType: "admin" | "provider_user" | "member";
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
};

export type AdminClaimRequestRecord = {
  token: string;
  id: string;
  note: string;
  createdAt: string;
};

export type MemberClaimRecord = {
  id: string;
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
  createdAt: string;
  claimSource?: "member_reimbursement";
  submittedByProfileId?: string;
  auditTrail?: AdminClaimRecord["auditTrail"];
  rejectionReason?: string;
  bankSlipFileName?: string;
  bankSlipDataUrl?: string;
  bankSlipUploadedAt?: string;
};

const ADMIN_CLAIMS_KEY = "admin_claims";
const ADMIN_CLAIM_REQUESTS_KEY = "admin_claim_requests";
const MEMBER_CLAIMS_KEY = "member_claims";
const CLAIMS_V2_KEY = "claims_v2";

type UnifiedClaimRecord = (AdminClaimRecord | MemberClaimRecord) & {
  claimSource: "provider_cashless" | "member_reimbursement";
};

export const normalizeClaimStatus = (status?: string) => {
  switch ((status || "").trim().toLowerCase()) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "request additional information":
    case "requested":
    case "in progress":
      return "In progress";
    case "new":
    case "submitted":
    case "in review":
    case "under review":
    case "high priority":
    case "paid":
    default:
      return "In review";
  }
};

const normalizeAdminClaim = (claim: AdminClaimRecord): AdminClaimRecord => ({
  ...claim,
  status: normalizeClaimStatus(claim.status),
});

const normalizeMemberClaim = (claim: MemberClaimRecord): MemberClaimRecord => ({
  ...claim,
  status: normalizeClaimStatus(claim.status),
});

const normalizeUnifiedClaim = (claim: UnifiedClaimRecord): UnifiedClaimRecord => ({
  ...claim,
  status: normalizeClaimStatus((claim as { status?: string }).status),
});

const SEEDED_ADMIN_CLAIMS: AdminClaimRecord[] = [
  { id: "CLM-2024-001", hospital: "City General Hospital", patient: "John Doe", amount: 1250, status: "In review", date: "2024-01-28" },
  { id: "CLM-2024-002", hospital: "St. Mary's Clinic", patient: "Jane Smith", amount: 450, status: "In review", date: "2024-01-29" },
  { id: "CLM-2024-003", hospital: "Ortho Specialist Ctr", patient: "Robert Brown", amount: 3400, status: "In progress", date: "2024-01-29" },
  { id: "CLM-2024-004", hospital: "Dental Care Plus", patient: "Alice Cooper", amount: 800, status: "Approved", date: "2024-01-27" },
  { id: "CLM-2024-005", hospital: "City General Hospital", patient: "Mike Ross", amount: 5000, status: "Rejected", date: "2024-01-26" },
];
const SEEDED_ADMIN_CLAIMS_SNAPSHOT = SEEDED_ADMIN_CLAIMS.map(normalizeAdminClaim);

let adminClaimsSnapshot: AdminClaimRecord[] = SEEDED_ADMIN_CLAIMS_SNAPSHOT;
let adminClaimRequestsSnapshot: AdminClaimRequestRecord[] = [];
let memberClaimsSnapshot: MemberClaimRecord[] = [];
const MEMBER_CLAIMS_SERVER_SNAPSHOT: MemberClaimRecord[] = [];
let unifiedClaimsSnapshot: UnifiedClaimRecord[] = [];
let adminClaimsHydrated = false;
let adminClaimRequestsHydrated = false;
let memberClaimsHydrated = false;
let unifiedClaimsHydrated = false;

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
export const getAdminClaimsServerSnapshot = () => SEEDED_ADMIN_CLAIMS_SNAPSHOT;
export const getAdminClaimRequestsSnapshot = () => adminClaimRequestsSnapshot;
export const getMemberClaimsSnapshot = () => memberClaimsSnapshot;
export const getMemberClaimsServerSnapshot = () => MEMBER_CLAIMS_SERVER_SNAPSHOT;

const readJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
};

const rebuildDerivedSnapshots = () => {
  adminClaimsSnapshot = unifiedClaimsSnapshot
    .filter((claim) => claim.claimSource === "provider_cashless")
    .map((claim) => normalizeAdminClaim(claim as AdminClaimRecord));
  memberClaimsSnapshot = unifiedClaimsSnapshot
    .filter((claim) => claim.claimSource === "member_reimbursement")
    .map((claim) => normalizeMemberClaim(claim as MemberClaimRecord));

  // Keep legacy keys synced for now (until UI no longer depends on them).
  writeJson(ADMIN_CLAIMS_KEY, adminClaimsSnapshot);
  writeJson(MEMBER_CLAIMS_KEY, memberClaimsSnapshot);
};

const ensureUnifiedClaimsStore = () => {
  if (typeof window === "undefined") return;

  // Ensure legacy keys exist (some pages still seed/read them).
  if (!localStorage.getItem(ADMIN_CLAIMS_KEY)) {
    writeJson(ADMIN_CLAIMS_KEY, SEEDED_ADMIN_CLAIMS);
  }
  if (!localStorage.getItem(MEMBER_CLAIMS_KEY)) {
    writeJson(MEMBER_CLAIMS_KEY, []);
  }

  // One-time migration into unified store.
  if (!localStorage.getItem(CLAIMS_V2_KEY)) {
    const legacyAdmin = readJson<AdminClaimRecord[]>(ADMIN_CLAIMS_KEY, SEEDED_ADMIN_CLAIMS)
      .map(normalizeAdminClaim)
      .map(
        (claim) =>
          ({
            ...claim,
            claimSource: "provider_cashless",
          }) as UnifiedClaimRecord
      );
    const legacyMember = readJson<MemberClaimRecord[]>(MEMBER_CLAIMS_KEY, [])
      .map(normalizeMemberClaim)
      .map(
        (claim) =>
          ({
            ...claim,
            claimSource: "member_reimbursement",
          }) as UnifiedClaimRecord
      );
    writeJson(CLAIMS_V2_KEY, [...legacyAdmin, ...legacyMember]);
  }

  if (!unifiedClaimsHydrated) {
    unifiedClaimsSnapshot = readJson<UnifiedClaimRecord[]>(CLAIMS_V2_KEY, []).map(normalizeUnifiedClaim);
    writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
    unifiedClaimsHydrated = true;
    rebuildDerivedSnapshots();
  }
};

export const ensureAdminClaimsSeed = () => {
  if (typeof window === "undefined") return;
  ensureUnifiedClaimsStore();
  adminClaimsHydrated = true;
};

export const ensureMemberClaimsStore = () => {
  if (typeof window === "undefined") return;
  ensureUnifiedClaimsStore();
  memberClaimsHydrated = true;
};

export const refreshAdminClaimsSnapshot = () => {
  ensureUnifiedClaimsStore();
  unifiedClaimsSnapshot = readJson<UnifiedClaimRecord[]>(CLAIMS_V2_KEY, []).map(normalizeUnifiedClaim);
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  adminClaimsHydrated = true;
  unifiedClaimsHydrated = true;
  emitAdminClaims();
};

export const refreshAdminClaimRequestsSnapshot = () => {
  adminClaimRequestsSnapshot = readJson<AdminClaimRequestRecord[]>(ADMIN_CLAIM_REQUESTS_KEY, []);
  adminClaimRequestsHydrated = true;
  emitAdminClaimRequests();
};

export const refreshMemberClaimsSnapshot = () => {
  ensureUnifiedClaimsStore();
  unifiedClaimsSnapshot = readJson<UnifiedClaimRecord[]>(CLAIMS_V2_KEY, []).map(normalizeUnifiedClaim);
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  memberClaimsHydrated = true;
  unifiedClaimsHydrated = true;
  emitMemberClaims();
};

export const updateAdminClaimStatus = (
  claimId: string,
  nextStatus: string,
  options?: {
    rejectionReason?: string;
    bankSlipFileName?: string;
    bankSlipDataUrl?: string;
    bankSlipUploadedAt?: string;
  }
) => {
  ensureUnifiedClaimsStore();
  const normalizedStatus = normalizeClaimStatus(nextStatus);
  if (
    normalizedStatus === "Approved" &&
    (!options?.bankSlipFileName?.trim() || !options.bankSlipDataUrl)
  ) {
    throw new Error("Bank-in slip is required before approving a claim.");
  }

  const previous = unifiedClaimsSnapshot.find((claim) => claim.id === claimId) || null;
  const nextUnified = unifiedClaimsSnapshot.map((claim) =>
    claim.id === claimId && claim.claimSource === "provider_cashless"
      ? normalizeUnifiedClaim({
          ...claim,
          status: normalizedStatus,
          rejectionReason:
            normalizedStatus === "Rejected"
              ? options?.rejectionReason?.trim() || (claim as AdminClaimRecord).rejectionReason
              : undefined,
          bankSlipFileName: options?.bankSlipFileName?.trim() || (claim as AdminClaimRecord).bankSlipFileName,
          bankSlipDataUrl: options?.bankSlipDataUrl || (claim as AdminClaimRecord).bankSlipDataUrl,
          bankSlipUploadedAt: options?.bankSlipUploadedAt || (claim as AdminClaimRecord).bankSlipUploadedAt,
          auditTrail: [
            ...(((claim as AdminClaimRecord).auditTrail || []) as NonNullable<AdminClaimRecord["auditTrail"]>),
            {
              at: new Date().toISOString(),
              actorType: "admin",
              actorId: "admin",
              action: "status_change",
              fromStatus: previous?.status,
              toStatus: normalizedStatus,
              note: normalizedStatus === "Rejected" ? options?.rejectionReason?.trim() : undefined,
            },
          ],
        })
      : claim
  );

  unifiedClaimsSnapshot = nextUnified;
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  emitAdminClaims();

  // Entitlement rule: consume on approve, release on reject/cancel.
  if (normalizedStatus === "Approved") {
    consumeReservation(claimId, options?.bankSlipUploadedAt);
  }
  if (normalizedStatus === "Rejected") {
    releaseReservation(claimId);
  }
};

export const deleteAdminClaim = (claimId: string) => {
  ensureUnifiedClaimsStore();
  unifiedClaimsSnapshot = unifiedClaimsSnapshot.filter(
    (claim) => !(claim.id === claimId && claim.claimSource === "provider_cashless")
  );
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  emitAdminClaims();
  releaseReservation(claimId);
};

export const addAdminClaim = (claim: AdminClaimRecord) => {
  ensureUnifiedClaimsStore();
  const nextClaim: UnifiedClaimRecord = normalizeUnifiedClaim({
    ...(claim as AdminClaimRecord),
    claimSource: "provider_cashless",
    status: normalizeClaimStatus(claim.status),
  });
  unifiedClaimsSnapshot = [...unifiedClaimsSnapshot.filter((item) => item.id !== claim.id), nextClaim];
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  emitAdminClaims();
};

export const addAdminClaimRequest = (request: AdminClaimRequestRecord) => {
  if (!adminClaimRequestsHydrated && typeof window !== "undefined") {
    adminClaimRequestsSnapshot = readJson<AdminClaimRequestRecord[]>(ADMIN_CLAIM_REQUESTS_KEY, []);
    adminClaimRequestsHydrated = true;
  }
  const next = [...readJson<AdminClaimRequestRecord[]>(ADMIN_CLAIM_REQUESTS_KEY, []), request];
  writeJson(ADMIN_CLAIM_REQUESTS_KEY, next);
  refreshAdminClaimRequestsSnapshot();
};

export const removeAdminClaimRequest = (token: string) => {
  if (!adminClaimRequestsHydrated && typeof window !== "undefined") {
    adminClaimRequestsSnapshot = readJson<AdminClaimRequestRecord[]>(ADMIN_CLAIM_REQUESTS_KEY, []);
    adminClaimRequestsHydrated = true;
  }
  const next = readJson<AdminClaimRequestRecord[]>(ADMIN_CLAIM_REQUESTS_KEY, []).filter((item) => item.token !== token);
  writeJson(ADMIN_CLAIM_REQUESTS_KEY, next);
  refreshAdminClaimRequestsSnapshot();
};

export const addMemberClaim = (claim: MemberClaimRecord) => {
  ensureUnifiedClaimsStore();
  const nextClaim: UnifiedClaimRecord = normalizeUnifiedClaim({
    ...(claim as MemberClaimRecord),
    claimSource: "member_reimbursement",
    status: normalizeClaimStatus(claim.status),
  });
  unifiedClaimsSnapshot = [...unifiedClaimsSnapshot.filter((item) => item.id !== claim.id), nextClaim];
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  emitMemberClaims();
};

export const updateMemberClaimStatus = (
  claimId: string,
  nextStatus: string,
  options?: {
    rejectionReason?: string;
    bankSlipFileName?: string;
    bankSlipDataUrl?: string;
    bankSlipUploadedAt?: string;
  }
) => {
  ensureUnifiedClaimsStore();
  const normalizedStatus = normalizeClaimStatus(nextStatus);
  if (
    normalizedStatus === "Approved" &&
    (!options?.bankSlipFileName?.trim() || !options.bankSlipDataUrl)
  ) {
    throw new Error("Bank-in slip is required before approving a claim.");
  }
  const previous = unifiedClaimsSnapshot.find((claim) => claim.id === claimId) || null;
  unifiedClaimsSnapshot = unifiedClaimsSnapshot.map((claim) =>
    claim.id === claimId && claim.claimSource === "member_reimbursement"
      ? normalizeUnifiedClaim({
          ...claim,
          status: normalizedStatus,
          rejectionReason:
            normalizedStatus === "Rejected"
              ? options?.rejectionReason?.trim() || (claim as MemberClaimRecord).rejectionReason
              : undefined,
          bankSlipFileName: options?.bankSlipFileName?.trim() || (claim as MemberClaimRecord).bankSlipFileName,
          bankSlipDataUrl: options?.bankSlipDataUrl || (claim as MemberClaimRecord).bankSlipDataUrl,
          bankSlipUploadedAt: options?.bankSlipUploadedAt || (claim as MemberClaimRecord).bankSlipUploadedAt,
          auditTrail: [
            ...(((claim as MemberClaimRecord).auditTrail || []) as NonNullable<MemberClaimRecord["auditTrail"]>),
            {
              at: new Date().toISOString(),
              actorType: "admin",
              actorId: "admin",
              action: "status_change",
              fromStatus: previous?.status,
              toStatus: normalizedStatus,
              note: normalizedStatus === "Rejected" ? options?.rejectionReason?.trim() : undefined,
            },
          ],
        })
      : claim
  );
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  emitMemberClaims();
};

export const deleteMemberClaim = (claimId: string) => {
  ensureUnifiedClaimsStore();
  unifiedClaimsSnapshot = unifiedClaimsSnapshot.filter(
    (claim) => !(claim.id === claimId && claim.claimSource === "member_reimbursement")
  );
  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  emitMemberClaims();
};
