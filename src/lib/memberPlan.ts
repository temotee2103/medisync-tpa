"use client";

import type { Company, CompanyPlanCategoryKey, CompanyPlanType } from "@/lib/companyStore";
import { createDefaultPlanConfig } from "@/lib/companyStore";
import type { MemberDirectoryEntry } from "@/lib/memberSession";

export const PLAN_CATEGORY_ORDER: CompanyPlanCategoryKey[] = [
  "op",
  "ip",
  "ahs",
  "dental",
  "sp",
  "tmc",
  "glasses",
  "others",
];

export type ResolvedMemberPlanCategory = {
  key: CompanyPlanCategoryKey;
  label: string;
  enabled: boolean;
  selected: boolean;
  limit: number;
  companyLimit: number;
};

export type ResolvedMemberPlan = {
  type: CompanyPlanType;
  lumpSumLimit: number;
  categories: ResolvedMemberPlanCategory[];
};

export const formatPlanTypeLabel = (type: CompanyPlanType) =>
  type === "lump_sum" ? "Lump Sum Limit" : "Categorized Limits";

export const getMemberLimitOwnerStaffId = (
  member: Pick<MemberDirectoryEntry, "staffId" | "relationship"> | null | undefined,
  company: Company | null | undefined
) => {
  if (!member?.staffId) return "";
  if (!company?.planConfig.dependents.sharedLimit) return member.staffId;
  if ((member.relationship || "Employee") === "Employee") return member.staffId;
  return member.staffId.includes("-DEP-") ? member.staffId.split("-DEP-")[0] : member.staffId;
};

export const resolveMemberPlan = (
  member: Pick<MemberDirectoryEntry, "planType" | "lumpSumLimit" | "planSelection" | "planLimits"> | null | undefined,
  company: Company | null | undefined
): ResolvedMemberPlan => {
  const companyConfig = company?.planConfig ?? createDefaultPlanConfig();
  const type = member?.planType ?? companyConfig.type;
  const lumpSumLimit =
    typeof member?.lumpSumLimit === "number" && Number.isFinite(member.lumpSumLimit)
      ? member.lumpSumLimit
      : companyConfig.lumpSumLimit;

  const categories = PLAN_CATEGORY_ORDER.map((key) => {
    const companyCategory = companyConfig.categories[key];
    const selected = member?.planSelection?.[key] ?? companyCategory.enabled;
    const limit = member?.planLimits?.[key] ?? companyCategory.limit;
    return {
      key,
      label: companyCategory.label,
      enabled: companyCategory.enabled,
      selected: companyCategory.enabled ? selected : false,
      limit,
      companyLimit: companyCategory.limit,
    };
  });

  return {
    type,
    lumpSumLimit,
    categories,
  };
};

export const countSelectedPlanBenefits = (plan: ResolvedMemberPlan) =>
  plan.type === "lump_sum" ? 1 : plan.categories.filter((category) => category.selected).length;

export const countConfiguredPlanLimits = (plan: ResolvedMemberPlan) =>
  plan.type === "lump_sum" ? 1 : plan.categories.filter((category) => category.selected).length;

export const getCategoryLimit = (plan: ResolvedMemberPlan, key: CompanyPlanCategoryKey) => {
  const category = plan.categories.find((item) => item.key === key);
  if (!category || !category.selected) return 0;
  return category.limit;
};
