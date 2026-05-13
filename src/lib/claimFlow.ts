export const CLAIM_STATUS = {
  IN_REVIEW: "In review",
  IN_PROGRESS: "In progress",
  APPROVED: "Approved",
  LISTED: "Listed",
  PAID: "Paid",
  PV_UPLOADED: "PV Uploaded",
  REJECTED: "Rejected",
} as const;

export type ClaimStatus = (typeof CLAIM_STATUS)[keyof typeof CLAIM_STATUS];

export const canTransition = (from: ClaimStatus, to: ClaimStatus) => {
  const allowed: Record<ClaimStatus, ClaimStatus[]> = {
    "In review": ["In progress", "Approved", "Rejected"],
    "In progress": ["Approved", "Rejected"],
    "Approved": ["Listed"],
    "Listed": ["Paid"],
    "Paid": ["PV Uploaded"],
    "PV Uploaded": [],
    "Rejected": [],
  };
  return (allowed[from] || []).includes(to);
};

