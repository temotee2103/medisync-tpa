import { normalizeUnifiedClaimStatus } from "@/lib/unifiedClaimLifecycle";

export const CLAIM_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  IN_PROCESS: "in_process",
  APPROVED: "approved",
  REJECTED: "rejected",
  MORE_INFORMATION: "more_information",
} as const;

export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

export function normalizeClaimStatus(value: unknown): ClaimStatus | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "in_review") return CLAIM_STATUS.SUBMITTED;
  if (normalized === "in_progress") return CLAIM_STATUS.IN_PROCESS;
  if (normalized === "listed") return CLAIM_STATUS.APPROVED;
  if (normalized === "paid") return CLAIM_STATUS.APPROVED;
  if (normalized === "pv_uploaded") return CLAIM_STATUS.APPROVED;
  if (normalized === "request_additional_information") return CLAIM_STATUS.MORE_INFORMATION;

  if (normalized === CLAIM_STATUS.DRAFT) return CLAIM_STATUS.DRAFT;
  if (normalized === CLAIM_STATUS.SUBMITTED) return CLAIM_STATUS.SUBMITTED;
  if (normalized === CLAIM_STATUS.IN_PROCESS) return CLAIM_STATUS.IN_PROCESS;
  if (normalized === CLAIM_STATUS.APPROVED) return CLAIM_STATUS.APPROVED;
  if (normalized === CLAIM_STATUS.REJECTED) return CLAIM_STATUS.REJECTED;
  if (normalized === CLAIM_STATUS.MORE_INFORMATION) return CLAIM_STATUS.MORE_INFORMATION;
  return null;
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted: ["more_information", "rejected", "in_process"],
  more_information: ["submitted"],
  rejected: [],
  in_process: ["approved"],
  approved: [],
  request_additional_information: ["submitted"],
};

export const canTransition = (from: string, to: string) => {
  const normalizedFrom = normalizeUnifiedClaimStatus(from);
  const normalizedTo = normalizeUnifiedClaimStatus(to);

  const fromKey = normalizedFrom === "request_additional_information" ? "more_information" : normalizedFrom;
  const toKey = normalizedTo === "request_additional_information" ? "more_information" : normalizedTo;

  const allowed = ALLOWED_TRANSITIONS[fromKey];
  return allowed ? allowed.includes(toKey) : false;
};
