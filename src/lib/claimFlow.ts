import { normalizeUnifiedClaimStatus, type UnifiedClaimStatus } from "@/lib/unifiedClaimLifecycle";

export const CLAIM_STATUS = {
  SUBMITTED: "submitted",
  REQUEST_ADDITIONAL_INFORMATION: "request_additional_information",
  REJECTED: "rejected",
  IN_PROCESS: "in_process",
  APPROVED: "approved",
  // Deprecated aliases kept temporarily so existing pages can compile during the rollout.
  IN_REVIEW: "submitted",
  IN_PROGRESS: "in_process",
  LISTED: "approved",
  PAID: "approved",
  PV_UPLOADED: "approved",
} as const;

export type ClaimStatus = UnifiedClaimStatus;

const ALLOWED_TRANSITIONS: Record<UnifiedClaimStatus, UnifiedClaimStatus[]> = {
  submitted: ["request_additional_information", "rejected", "in_process"],
  request_additional_information: ["submitted"],
  rejected: [],
  in_process: ["approved"],
  approved: [],
};

export const canTransition = (from: string, to: string) => {
  const normalizedFrom = normalizeUnifiedClaimStatus(from);
  const normalizedTo = normalizeUnifiedClaimStatus(to);
  return ALLOWED_TRANSITIONS[normalizedFrom].includes(normalizedTo);
};
