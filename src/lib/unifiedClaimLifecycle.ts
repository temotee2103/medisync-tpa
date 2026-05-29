export const UNIFIED_CLAIM_STATUSES = [
  "submitted",
  "request_additional_information",
  "rejected",
  "in_process",
  "approved",
] as const;

export type UnifiedClaimStatus = (typeof UNIFIED_CLAIM_STATUSES)[number];

const NORMALIZED_STATUS_ALIASES: Record<string, UnifiedClaimStatus> = {
  submitted: "submitted",
  new: "submitted",
  "in review": "submitted",
  in_review: "submitted",
  "under review": "submitted",
  under_review: "submitted",
  "high priority": "submitted",
  high_priority: "submitted",
  request_additional_information: "request_additional_information",
  "request additional information": "request_additional_information",
  request_for_information: "request_additional_information",
  requested: "request_additional_information",
  rejected: "rejected",
  in_process: "in_process",
  "in process": "in_process",
  "in progress": "in_process",
  in_progress: "in_process",
  approved: "approved",
  listed: "approved",
  paid: "approved",
  "pv uploaded": "approved",
  pv_uploaded: "approved",
  "pv-uploaded": "approved",
};

const STATUS_LABELS: Record<UnifiedClaimStatus, string> = {
  submitted: "Submitted",
  request_additional_information: "Request Additional Information",
  rejected: "Rejected",
  in_process: "In Process",
  approved: "Approved",
};

const LEGACY_COMPATIBILITY_LABELS: Record<UnifiedClaimStatus, string> = {
  submitted: "In review",
  request_additional_information: "Request Additional Information",
  rejected: "Rejected",
  in_process: "In progress",
  approved: "Approved",
};

const STATUS_ORDER: Record<UnifiedClaimStatus, number> = {
  submitted: 0,
  request_additional_information: 1,
  rejected: 2,
  in_process: 3,
  approved: 4,
};

const normalizeStatusKey = (status?: string) => String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

export const normalizeUnifiedClaimStatus = (status?: string): UnifiedClaimStatus => {
  const directKey = String(status || "").trim().toLowerCase();
  const normalizedKey = normalizeStatusKey(status);

  if (directKey in NORMALIZED_STATUS_ALIASES) {
    return NORMALIZED_STATUS_ALIASES[directKey];
  }

  if (normalizedKey in NORMALIZED_STATUS_ALIASES) {
    return NORMALIZED_STATUS_ALIASES[normalizedKey];
  }

  return "submitted";
};

export const formatUnifiedClaimStatus = (status?: string) => {
  return STATUS_LABELS[normalizeUnifiedClaimStatus(status)];
};

export const formatLegacyCompatibleClaimStatus = (status?: string) => {
  return LEGACY_COMPATIBILITY_LABELS[normalizeUnifiedClaimStatus(status)];
};

export const getUnifiedClaimStatusSortOrder = (status?: string) => {
  return STATUS_ORDER[normalizeUnifiedClaimStatus(status)];
};
