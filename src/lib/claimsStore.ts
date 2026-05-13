import { consumeReservation, releaseReservation } from "@/lib/entitlementStore";
import { canTransition, CLAIM_STATUS, type ClaimStatus } from "@/lib/claimFlow";

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
  consultationFee?: string;
  medicationFee?: string;
  injectionFee?: string;
  investigationFee?: string;
  procedureFee?: string;
  immunizationFee?: string;
  selectedChargeItems?: Record<string, string[]>;
  mcRequired?: boolean;
  mcFrom?: string;
  mcTo?: string;
  mcDays?: number;
  rlRequired?: boolean;
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
    case "listed":
      return "Listed";
    case "paid":
      return "Paid";
    case "pv uploaded":
    case "pvuploaed":
    case "pv_uploaded":
    case "pv-uploaded":
      return "PV Uploaded";
    case "request additional information":
    case "requested":
    case "in progress":
      return "In progress";
    case "new":
    case "submitted":
    case "in review":
    case "under review":
    case "high priority":
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
  {
    id: "CLM-2024-001",
    hospital: "City General Hospital",
    patient: "John Doe",
    patientId: "MEM-8823-01",
    memberKey: "MEM-8823-01",
    amount: 1250,
    status: "In review",
    date: "2024-01-28",
  },
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

type ClaimTransitionOptions = {
  claimSource?: UnifiedClaimRecord["claimSource"];
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

export const transitionClaimStatus = (claimId: string, nextStatus: string, options?: ClaimTransitionOptions) => {
  ensureUnifiedClaimsStore();

  const target = unifiedClaimsSnapshot.find(
    (claim) => claim.id === claimId && (!options?.claimSource || claim.claimSource === options.claimSource)
  );
  if (!target) {
    throw new Error("Claim not found.");
  }

  const fromStatus = normalizeClaimStatus((target as { status?: string }).status) as ClaimStatus;
  const toStatus = normalizeClaimStatus(nextStatus) as ClaimStatus;

  if (fromStatus === toStatus) return;
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error(`Cannot transition claim from "${fromStatus}" to "${toStatus}".`);
  }

  const bankSlipFileName =
    options?.bankSlipFileName?.trim() || (target as AdminClaimRecord | MemberClaimRecord).bankSlipFileName;
  const bankSlipDataUrl = options?.bankSlipDataUrl || (target as AdminClaimRecord | MemberClaimRecord).bankSlipDataUrl;
  const bankSlipUploadedAt =
    options?.bankSlipUploadedAt || (target as AdminClaimRecord | MemberClaimRecord).bankSlipUploadedAt;

  if (toStatus === CLAIM_STATUS.APPROVED && (!bankSlipFileName || !bankSlipDataUrl)) {
    throw new Error("Bank-in slip is required before approving a claim.");
  }

  if (toStatus === CLAIM_STATUS.PV_UPLOADED && target.claimSource === "provider_cashless") {
    const pvFileName = options?.pvFileName?.trim() || (target as AdminClaimRecord).pvFileName;
    const pvDataUrl = options?.pvDataUrl || (target as AdminClaimRecord).pvDataUrl;
    if (!pvFileName || !pvDataUrl) {
      throw new Error("PV file is required before marking a claim as PV Uploaded.");
    }
  }

  const actorType = options?.actorType || "admin";
  const actorId = options?.actorId || "admin";

  unifiedClaimsSnapshot = unifiedClaimsSnapshot.map((claim) => {
    if (claim.id !== claimId || claim.claimSource !== target.claimSource) return claim;

    const base = {
      ...claim,
      status: toStatus,
      rejectionReason:
        toStatus === CLAIM_STATUS.REJECTED
          ? options?.rejectionReason?.trim() || (claim as AdminClaimRecord | MemberClaimRecord).rejectionReason
          : undefined,
      bankSlipFileName,
      bankSlipDataUrl,
      bankSlipUploadedAt,
      pvFileName:
        target.claimSource === "provider_cashless"
          ? options?.pvFileName?.trim() || (claim as AdminClaimRecord).pvFileName
          : undefined,
      pvDataUrl:
        target.claimSource === "provider_cashless" ? options?.pvDataUrl || (claim as AdminClaimRecord).pvDataUrl : undefined,
      pvUploadedAt:
        target.claimSource === "provider_cashless"
          ? options?.pvUploadedAt || (claim as AdminClaimRecord).pvUploadedAt
          : undefined,
      auditTrail: [
        ...(((claim as AdminClaimRecord | MemberClaimRecord).auditTrail ||
          []) as NonNullable<AdminClaimRecord["auditTrail"]>),
        {
          at: new Date().toISOString(),
          actorType,
          actorId,
          actorName: options?.actorName,
          action: "status_change",
          fromStatus,
          toStatus,
          note:
            options?.note ||
            (toStatus === CLAIM_STATUS.REJECTED ? options?.rejectionReason?.trim() : undefined),
        },
      ],
    };

    return normalizeUnifiedClaim(base as UnifiedClaimRecord);
  });

  writeJson(CLAIMS_V2_KEY, unifiedClaimsSnapshot);
  rebuildDerivedSnapshots();
  if (target.claimSource === "provider_cashless") {
    emitAdminClaims();
  } else {
    emitMemberClaims();
  }

  // Entitlement rule: consume on approve, release on reject.
  if (toStatus === CLAIM_STATUS.APPROVED) {
    consumeReservation(claimId, bankSlipUploadedAt);
  }
  if (toStatus === CLAIM_STATUS.REJECTED) {
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
  transitionClaimStatus(claimId, nextStatus, { ...(options || {}), claimSource: "provider_cashless", actorType: "admin", actorId: "admin" });
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
  transitionClaimStatus(claimId, nextStatus, { ...(options || {}), claimSource: "member_reimbursement", actorType: "admin", actorId: "admin" });
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
