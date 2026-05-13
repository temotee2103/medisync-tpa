import type { CompanyPlanCategoryKey, Company } from "@/lib/companyStore";
import type { MemberDirectoryEntry } from "@/lib/memberSession";
import { getMemberLimitOwnerStaffId, resolveMemberPlan } from "@/lib/memberPlan";
import { getLimitLocks, getUtilizations } from "@/lib/entitlementStore";

export type CategoryBalanceRow = {
  key: CompanyPlanCategoryKey;
  label: string;
  limit: number;
  reserved: number;
  utilized: number;
  available: number;
};

export function getCategoryBalanceBreakdown(member: MemberDirectoryEntry, company: Company | null) {
  const plan = resolveMemberPlan(member, company);
  const memberKey = getMemberLimitOwnerStaffId(member, company) || member.staffId;
  const locks = getLimitLocks().filter((l) => l.memberKey === memberKey);
  const utils = getUtilizations().filter((u) => u.memberKey === memberKey);

  if (plan.type === "lump_sum") {
    const limit = plan.lumpSumLimit;
    const reserved = locks.reduce((s, l) => s + l.amount, 0);
    const utilized = utils.reduce((s, u) => s + u.amount, 0);
    return [
      {
        key: "op",
        label: "Overall (Lump Sum)",
        limit,
        reserved,
        utilized,
        available: Math.max(limit - reserved - utilized, 0),
      },
    ] as CategoryBalanceRow[];
  }

  return plan.categories.map((c) => {
    const limit = c.selected ? c.limit : 0;
    const reserved = locks.filter((l) => l.category === c.key).reduce((s, l) => s + l.amount, 0);
    const utilized = utils.filter((u) => u.category === c.key).reduce((s, u) => s + u.amount, 0);
    return {
      key: c.key,
      label: c.label,
      limit,
      reserved,
      utilized,
      available: Math.max(limit - reserved - utilized, 0),
    };
  });
}

