import type { CompanyPlanCategoryKey } from "@/lib/companyStore";

export function mapMemberClaimCategoryToPlanCategory(categoryRaw: string): CompanyPlanCategoryKey | null {
  const normalized = (categoryRaw || "").trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === "op") return "op";
  if (normalized === "ip") return "ip";
  if (normalized === "ahs") return "ahs";
  if (normalized === "sp") return "sp";

  if (normalized === "dental") return "dental";
  if (normalized === "tmc") return "tmc";
  if (normalized === "glasses") return "glasses";
  if (normalized === "others") return "others";

  return null;
}

