"use client";

import type { Company } from "@/lib/companyStore";
import { getCompanies } from "@/lib/companyStore";
import type { MemberDirectoryEntry } from "@/lib/memberSession";
import { getMemberDirectory } from "@/lib/memberSession";
import type { ResolvedMemberPlan } from "@/lib/memberPlan";
import { resolveMemberPlan } from "@/lib/memberPlan";

export type ProviderEligibilityStatus = "Active" | "Disabled";

export type ProviderEligibilityResult = {
  member: MemberDirectoryEntry;
  company: Company | null;
  plan: ResolvedMemberPlan;
  eligibilityStatus: ProviderEligibilityStatus;
  ineligibilityReason?: string;
};

export function findMemberByPayload(payload: string) {
  const q = payload.trim().toLowerCase();
  if (!q) return null;
  const members = getMemberDirectory();
  return (
    members.find((m) => m.staffId.toLowerCase() === q) ||
    members.find((m) => (m.nricPassport || "").toLowerCase() === q) ||
    members.find((m) => (m.passportNo || "").toLowerCase() === q) ||
    null
  );
}

const isPassportExpired = (passportExpiry?: string) => {
  if (!passportExpiry || passportExpiry.length < 10) return false;
  const todayKey = new Date().toISOString().slice(0, 10);
  return passportExpiry <= todayKey;
};

export function buildEligibilityResult(member: NonNullable<ReturnType<typeof findMemberByPayload>>): ProviderEligibilityResult {
  const companies = getCompanies();
  const company = companies.find((c) => c.companyId === member.companyId) || null;
  const plan = resolveMemberPlan(member, company);

  if (member.status === "Disabled") {
    return {
      member,
      company,
      plan,
      eligibilityStatus: "Disabled",
      ineligibilityReason: "Member account is disabled.",
    };
  }

  if (isPassportExpired(member.passportExpiry)) {
    return {
      member,
      company,
      plan,
      eligibilityStatus: "Disabled",
      ineligibilityReason: "Passport has expired.",
    };
  }

  return {
    member,
    company,
    plan,
    eligibilityStatus: "Active",
  };
}

