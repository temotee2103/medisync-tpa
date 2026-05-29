"use client";

import { getMemberClaimsSnapshot, type MemberClaimRecord } from "@/lib/claimsStore";
import { getProviderClaimsSnapshot, type ProviderClaimRecord } from "@/lib/providerClaimsStore";
import {
  getMemberPayoutProfiles,
  getProviderPayoutProfiles,
  type MemberPayoutProfile,
  type ProviderPayoutProfile,
} from "@/lib/payoutProfilesStore";
import { normalizeUnifiedClaimStatus } from "@/lib/unifiedClaimLifecycle";

export type AccountantQueueItem = {
  scope: "member" | "vendor";
  id: string;
  claimNumber: string;
  subjectName: string;
  providerLabel: string;
  amount: number;
  status: "in_process";
  adminNote?: string;
  payoutStatus: "complete" | "missing";
  payoutSummary: string;
  claimHref: string;
  submittedAt?: string;
};

const maskAccountNumber = (value?: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "No account";
  if (normalized.length <= 4) return normalized;
  return `${"*".repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
};

const getLatestAdminNote = (auditTrail?: MemberClaimRecord["auditTrail"]) => {
  if (!auditTrail?.length) return undefined;
  const lastNotedEntry = [...auditTrail]
    .reverse()
    .find((entry) => entry.actorType === "admin" && typeof entry.note === "string" && entry.note.trim());
  return lastNotedEntry?.note?.trim() || undefined;
};

const resolveMemberPayoutProfile = (
  claim: MemberClaimRecord,
  payoutProfiles: MemberPayoutProfile[]
) => {
  const candidateIds = [
    (claim as unknown as { memberId?: string }).memberId,
    claim.memberKey,
    claim.submittedByProfileId,
    claim.patientId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return payoutProfiles.find((profile) => candidateIds.includes(profile.memberId)) || null;
};

const buildMemberPayoutSummary = (profile: MemberPayoutProfile | null) => {
  if (!profile) return "Missing member payout profile";
  return `${profile.accountHolderName} • ${profile.bankName} • ${maskAccountNumber(profile.accountNumber)}`;
};

const buildProviderPayoutSummary = (profile: ProviderPayoutProfile | null) => {
  if (!profile) return "Missing provider payout profile";
  const branchText = profile.branchName ? ` • ${profile.branchName}` : "";
  return `${profile.beneficiaryName} • ${profile.bankName}${branchText} • ${maskAccountNumber(profile.accountNumber)}`;
};

const mapMemberQueueItem = (
  claim: MemberClaimRecord,
  payoutProfiles: MemberPayoutProfile[]
): AccountantQueueItem => {
  const payoutProfile = resolveMemberPayoutProfile(claim, payoutProfiles);

  return {
    scope: "member",
    id: claim.id,
    claimNumber: claim.id,
    subjectName: claim.patient,
    providerLabel: claim.providerName,
    amount: Number(claim.amountSubmitted) || 0,
    status: "in_process",
    adminNote: getLatestAdminNote(claim.auditTrail),
    payoutStatus: payoutProfile ? "complete" : "missing",
    payoutSummary: buildMemberPayoutSummary(payoutProfile),
    claimHref: `/admin/claims/${claim.id}`,
    submittedAt: claim.createdAt || claim.visitDate,
  };
};

const mapProviderQueueItem = (
  claim: ProviderClaimRecord,
  payoutProfiles: ProviderPayoutProfile[]
): AccountantQueueItem => {
  const payoutProfile = payoutProfiles.find((profile) => profile.providerId === claim.providerId) || null;

  return {
    scope: "vendor",
    id: claim.id,
    claimNumber: claim.claimNumber || claim.id,
    subjectName: claim.patientName || "Unlinked member",
    providerLabel: claim.providerName || "Unknown provider",
    amount: claim.totalAmount,
    status: "in_process",
    adminNote: claim.reviewNote || undefined,
    payoutStatus: payoutProfile ? "complete" : "missing",
    payoutSummary: buildProviderPayoutSummary(payoutProfile),
    claimHref: `/admin/claims/${claim.id}`,
    submittedAt: claim.reviewedAt || claim.submittedAt || claim.createdAt,
  };
};

export const buildAccountantQueue = async (): Promise<AccountantQueueItem[]> => {
  const [memberPayoutProfiles, providerPayoutProfiles] = await Promise.all([
    getMemberPayoutProfiles(),
    getProviderPayoutProfiles(),
  ]);

  const memberQueue = getMemberClaimsSnapshot()
    .filter((claim) => normalizeUnifiedClaimStatus(claim.lifecycleStatus || claim.status) === "in_process")
    .map((claim) => mapMemberQueueItem(claim, memberPayoutProfiles));

  const providerQueue = getProviderClaimsSnapshot()
    .filter((claim) => normalizeUnifiedClaimStatus(claim.status) === "in_process")
    .map((claim) => mapProviderQueueItem(claim, providerPayoutProfiles));

  return [...memberQueue, ...providerQueue].sort((left, right) => {
    const leftTime = new Date(left.submittedAt || 0).getTime();
    const rightTime = new Date(right.submittedAt || 0).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
};
