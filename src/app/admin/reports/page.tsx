"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import {
  PieChart,
  DollarSign,
  Calendar,
  Download,
  Users,
  Activity,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";
import {
  getCompaniesServerSnapshot,
  getCompaniesSnapshot,
  refreshCompaniesSnapshot,
  subscribeCompanies,
} from "@/lib/companyStore";
import {
  getAdminClaimsServerSnapshot,
  getAdminClaimsSnapshot,
  refreshAdminClaimsSnapshot,
  subscribeAdminClaims,
} from "@/lib/claimsStore";
import {
  ensureMemberSeed,
  getMemberDirectoryServerSnapshot,
  getMemberDirectorySnapshot,
  isPrimaryMember,
  subscribeMemberDirectory,
} from "@/lib/memberSession";

const CATEGORY_COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

const getClaimDateStamp = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const getClaimMonthKey = (value?: string) => {
  const stamp = getClaimDateStamp(value);
  return stamp ? stamp.slice(0, 7) : "";
};

const formatMonthLabel = (monthKey: string) => {
  if (!monthKey) return "All Periods";
  const parsed = new Date(`${monthKey}-01T00:00:00`);
  if (!Number.isFinite(parsed.getTime())) return monthKey;
  return parsed.toLocaleString("en-MY", { month: "short", year: "numeric" });
};

export default function ReportsPage() {
  const [isReportsLoaded, setIsReportsLoaded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState("all");

  const adminClaims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsServerSnapshot
  );
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const members = useSyncExternalStore(
    subscribeMemberDirectory,
    getMemberDirectorySnapshot,
    getMemberDirectoryServerSnapshot
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      refreshAdminClaimsSnapshot(),
      refreshCompaniesSnapshot(),
      ensureMemberSeed(true),
    ]).finally(() => {
      if (!cancelled) setIsReportsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const companyNameById = useMemo(
    () => new Map(companies.map((company) => [company.companyId, company.name])),
    [companies]
  );
  const memberCompanyByKey = useMemo(() => {
    const entries: Array<[string, string]> = [];
    members.forEach((member) => {
      if (member.staffId) entries.push([member.staffId, member.companyId]);
      if (member.memberUuid) entries.push([member.memberUuid, member.companyId]);
      if (member.profileId) entries.push([member.profileId, member.companyId]);
    });
    return new Map(entries);
  }, [members]);
  const activePrimaryMembers = useMemo(() => {
    return members.filter((member) => isPrimaryMember(member) && member.status === "Active");
  }, [members]);

  const availablePeriods = useMemo(() => {
    const months = Array.from(
      new Set(
        adminClaims
          .map((claim) => getClaimMonthKey(claim.submittedAt || claim.createdAt || claim.date))
          .filter(Boolean)
      )
    ).sort((left, right) => right.localeCompare(left));
    return ["all", ...months];
  }, [adminClaims]);

  const effectiveSelectedPeriod =
    selectedPeriod === "all" || availablePeriods.includes(selectedPeriod) ? selectedPeriod : "all";

  const filteredClaims = useMemo(() => {
    return adminClaims.filter((claim) => {
      const companyId =
        claim.companyId ||
        memberCompanyByKey.get(claim.patientId || "") ||
        memberCompanyByKey.get(claim.memberId || "") ||
        "";
      if (selectedCompanyId !== "all" && companyId !== selectedCompanyId) return false;
      if (effectiveSelectedPeriod !== "all") {
        const monthKey = getClaimMonthKey(claim.submittedAt || claim.createdAt || claim.date);
        if (monthKey !== effectiveSelectedPeriod) return false;
      }
      return true;
    });
  }, [adminClaims, effectiveSelectedPeriod, memberCompanyByKey, selectedCompanyId]);

  const reportMetrics = useMemo(() => {
    const approvedClaims = filteredClaims.filter((claim) => claim.status === "Approved");
    const pendingClaims = filteredClaims.filter((claim) => !["Approved", "Rejected"].includes(claim.status));
    const payoutValue = approvedClaims.reduce((sum, claim) => sum + claim.amount, 0);
    const filteredActiveMembers =
      selectedCompanyId === "all"
        ? activePrimaryMembers
        : activePrimaryMembers.filter((member) => member.companyId === selectedCompanyId);

    return {
      totalClaims: filteredClaims.length,
      payoutValue,
      activeMembers: filteredActiveMembers.length,
      pendingClaims: pendingClaims.length,
      approvedClaims: approvedClaims.length,
    };
  }, [activePrimaryMembers, filteredClaims, selectedCompanyId]);

  const diagnosisData = useMemo(() => {
    const diagnosisCount = filteredClaims.reduce<Map<string, number>>((accumulator, claim) => {
      const label = String(claim.diagnosis || "").trim() || "Undisclosed diagnosis";
      accumulator.set(label, (accumulator.get(label) || 0) + 1);
      return accumulator;
    }, new Map());
    return Array.from(diagnosisCount.entries())
      .map(([name, count]) => ({
        name,
        count,
        percentage: filteredClaims.length ? Math.round((count / filteredClaims.length) * 100) : 0,
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6);
  }, [filteredClaims]);

  const categoryData = useMemo(() => {
    const categoryTotals = filteredClaims.reduce<Map<string, number>>((accumulator, claim) => {
      const label = String(claim.limitCategory || claim.serviceType || "Uncategorized").trim();
      accumulator.set(label, (accumulator.get(label) || 0) + claim.amount);
      return accumulator;
    }, new Map());
    const totalAmount = filteredClaims.reduce((sum, claim) => sum + claim.amount, 0);
    return Array.from(categoryTotals.entries())
      .map(([name, amount], index) => ({
        name,
        amount,
        percentage: totalAmount ? Math.round((amount / totalAmount) * 100) : 0,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 6);
  }, [filteredClaims]);

  const topSpenders = useMemo(() => {
    const grouped = filteredClaims.reduce<
      Map<string, { id: string; name: string; companyId: string; company: string; amount: number; claims: number }>
    >((accumulator, claim) => {
      const staffId = claim.patientId || claim.id;
      const companyId =
        claim.companyId ||
        memberCompanyByKey.get(claim.patientId || "") ||
        memberCompanyByKey.get(claim.memberId || "") ||
        "";
      const current = accumulator.get(staffId) || {
        id: staffId,
        name: claim.patient || "Unknown patient",
        companyId,
        company: companyNameById.get(companyId) || (companyId ? companyId : "Unassigned"),
        amount: 0,
        claims: 0,
      };
      current.amount += claim.amount;
      current.claims += 1;
      accumulator.set(staffId, current);
      return accumulator;
    }, new Map());
    return Array.from(grouped.values())
      .sort((left, right) => right.amount - left.amount || right.claims - left.claims)
      .slice(0, 8);
  }, [companyNameById, filteredClaims, memberCompanyByKey]);

  const payoutLog = useMemo(() => {
    return filteredClaims
      .filter((claim) => claim.status === "Approved")
      .map((claim) => {
        const companyId =
          claim.companyId ||
          memberCompanyByKey.get(claim.patientId || "") ||
          memberCompanyByKey.get(claim.memberId || "") ||
          "";
        return {
          reference: claim.id,
          companyId,
          date: getClaimDateStamp(claim.pvUploadedAt || claim.bankSlipUploadedAt || claim.submittedAt || claim.createdAt || claim.date) || "—",
          amount: claim.amount,
          status: claim.status,
        };
      })
      .sort((left, right) => right.date.localeCompare(left.date));
  }, [filteredClaims, memberCompanyByKey]);

  const isReportsLoading = !isReportsLoaded;
  const selectedPeriodLabel =
    effectiveSelectedPeriod === "all" ? "All Periods" : formatMonthLabel(effectiveSelectedPeriod);
  const selectedPayoutValue = categoryData.reduce((sum, item) => sum + item.amount, 0);
  const reportCards = [
    {
      label: "Total Claims",
      value: isReportsLoading ? "Loading..." : reportMetrics.totalClaims.toLocaleString(),
      meta: isReportsLoading ? "Loading claim volume..." : `${reportMetrics.approvedClaims} approved claims`,
      icon: Activity,
      color: "text-sky-600",
      bg: "bg-sky-100",
    },
    {
      label: "Total Payout",
      value: isReportsLoading ? "Loading..." : `RM ${reportMetrics.payoutValue.toLocaleString("en-MY")}`,
      meta: isReportsLoading ? "Loading payout amount..." : `${payoutLog.length} approved payout entries`,
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
    {
      label: "Active Members",
      value: isReportsLoading ? "Loading..." : reportMetrics.activeMembers.toLocaleString(),
      meta: isReportsLoading ? "Loading member coverage..." : selectedCompanyId === "all" ? "Across all companies" : "Within selected company",
      icon: Users,
      color: "text-indigo-600",
      bg: "bg-indigo-100",
    },
    {
      label: "Pending Review",
      value: isReportsLoading ? "Loading..." : reportMetrics.pendingClaims.toLocaleString(),
      meta: isReportsLoading ? "Loading pending workflow..." : "Claims not yet closed",
      icon: AlertCircle,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports & Analytics</h1>
          <p className="text-slate-500">System-wide performance and utilization tracking.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="glass-select px-3 py-2 text-sm min-w-52"
            value={selectedCompanyId}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
          >
            <option value="all">All Companies</option>
            {companies.map((company) => (
              <option key={company.companyId} value={company.companyId}>
                {company.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              className="glass-select min-w-40 pl-9 pr-3 py-2 text-sm"
              value={effectiveSelectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value)}
            >
              {availablePeriods.map((periodKey) => (
                <option key={periodKey} value={periodKey}>
                  {periodKey === "all" ? "All Periods" : formatMonthLabel(periodKey)}
                </option>
              ))}
            </select>
          </div>
          <GlassButton
            className="gap-2"
            disabled={isReportsLoading || payoutLog.length === 0}
            onClick={() => {
              const header = "Reference,Date,Amount,Status";
              const rows = payoutLog.map((item) =>
                [item.reference, item.date, item.amount.toFixed(2), item.status].join(",")
              );
              downloadText(
                `reports-${selectedPeriodLabel.replace(/\s+/g, "-").toLowerCase()}.csv`,
                [header, ...rows].join("\n"),
                "text/csv"
              );
            }}
          >
            <Download className="w-4 h-4" />
            Download Payout Log
          </GlassButton>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {reportCards.map((stat) => (
          <GlassCard key={stat.label} className="p-4 flex items-center gap-4">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-1">{stat.meta}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Epidemiology Report */}
        <GlassCard className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-500" />
              Epidemiology Report
            </h3>
            <GlassButton
              variant="ghost"
              size="sm"
              disabled={isReportsLoading || diagnosisData.length === 0}
              onClick={() =>
                downloadText(
                  "epidemiology-report.txt",
                  diagnosisData
                    .map((item) => `${item.name}: ${item.count} cases (${item.percentage}%)`)
                    .join("\n")
                )
              }
            >
              View Full
            </GlassButton>
          </div>
          <div className="space-y-4">
            {isReportsLoading && <p className="text-sm text-slate-500">Loading diagnosis trends...</p>}
            {!isReportsLoading && diagnosisData.length === 0 && (
              <p className="text-sm text-slate-500">No diagnosis data available for the current filters.</p>
            )}
            {!isReportsLoading && diagnosisData.map((item, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{item.name}</span>
                  <span className="text-slate-500">{item.count} cases ({item.percentage}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-sky-500 rounded-full transition-all duration-1000" 
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Category Utilization */}
        <GlassCard className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-500" />
              Category Utilization
            </h3>
            <GlassButton
              variant="ghost"
              size="sm"
              disabled={isReportsLoading || categoryData.length === 0}
              onClick={() =>
                downloadText(
                  "category-utilization.txt",
                  categoryData
                    .map((item) => `${item.name}: RM ${item.amount.toLocaleString("en-MY")} (${item.percentage}%)`)
                    .join("\n")
                )
              }
            >
              View Full
            </GlassButton>
          </div>
          
          <div className="flex items-center justify-center py-4">
             {/* Simple CSS Donut Chart Representation */}
             <div className="relative w-48 h-48 rounded-full border-[16px] border-slate-100 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-slate-800">
                    {isReportsLoading ? "..." : `RM ${selectedPayoutValue.toLocaleString("en-MY")}`}
                  </p>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Total Spent</p>
                </div>
                {/* Overlay segments would require complex CSS conic-gradients, sticking to legend for now */}
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {isReportsLoading && <p className="col-span-2 text-sm text-slate-500">Loading category utilization...</p>}
            {!isReportsLoading && categoryData.length === 0 && (
              <p className="col-span-2 text-sm text-slate-500">No category utilization data available for the current filters.</p>
            )}
            {!isReportsLoading && categoryData.map((cat, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn("w-3 h-3 rounded-full shrink-0", cat.color)} />
                <div>
                  <p className="text-xs text-slate-500 font-bold">{cat.name}</p>
                  <p className="text-sm font-bold text-slate-800">RM {cat.amount.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Top Spenders (Staff Claim Amount) */}
        <GlassCard className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              Top Staff Utilization
            </h3>
            <GlassButton
              variant="ghost"
              size="sm"
              disabled={isReportsLoading || topSpenders.length === 0}
              onClick={() =>
                downloadText(
                  "top-staff-utilization.txt",
                  topSpenders
                    .map((staff) => `${staff.name} | ${staff.company} | RM ${staff.amount.toLocaleString("en-MY")} | ${staff.claims} claims`)
                    .join("\n")
                )
              }
            >
              View All
            </GlassButton>
          </div>
          <div className="space-y-4">
            {isReportsLoading && <p className="text-sm text-slate-500">Loading staff utilization...</p>}
            {!isReportsLoading && topSpenders.length === 0 && (
              <p className="text-sm text-slate-500">No staff utilization data available for the current filters.</p>
            )}
            {!isReportsLoading && topSpenders.map((staff, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/50 rounded-xl border border-white/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                    {staff.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{staff.name}</p>
                    <p className="text-xs text-slate-500">{staff.company}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-600">RM {staff.amount.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{staff.claims} claims</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Payout Log */}
        <GlassCard className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              Payout Log
            </h3>
            <GlassButton
              variant="ghost"
              size="sm"
              disabled={isReportsLoading || payoutLog.length === 0}
              onClick={() =>
                downloadText(
                  "payout-log.txt",
                  payoutLog
                    .map((item) => `${item.reference} | ${item.date} | RM ${item.amount.toLocaleString("en-MY")} | ${item.status}`)
                    .join("\n")
                )
              }
            >
              View All
            </GlassButton>
          </div>
          <ResponsiveDataView
            desktop={
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg">Reference</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 rounded-r-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isReportsLoading && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">Loading payout log...</td>
                      </tr>
                    )}
                    {!isReportsLoading && payoutLog.map((log, i) => (
                      <tr key={i} className="hover:bg-white/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-700">{log.reference}</td>
                        <td className="px-4 py-3 text-slate-500">{log.date}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800">RM {log.amount.toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                            log.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                            log.status === "Rejected" ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!isReportsLoading && payoutLog.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">No approved payout records are available for the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            }
            mobile={
              <div className="space-y-3">
                {isReportsLoading && (
                  <p className="text-sm text-slate-500 text-center py-6">Loading payout log...</p>
                )}
                {!isReportsLoading && payoutLog.map((log, i) => (
                  <MobileRecordCard
                    key={i}
                    title={<span className="font-mono">{log.reference}</span>}
                    subtitle={log.date}
                    badge={
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                        log.status === "Approved" ? "bg-emerald-100 text-emerald-700" :
                        log.status === "Rejected" ? "bg-rose-100 text-rose-700" :
                        "bg-amber-100 text-amber-700"
                      )}>
                        {log.status}
                      </span>
                    }
                    meta={<span>RM {log.amount.toLocaleString("en-MY")}</span>}
                  />
                ))}
                {!isReportsLoading && payoutLog.length === 0 && (
                  <GlassCard className="p-6 text-center text-sm text-slate-400">No approved payout records are available for the current filters.</GlassCard>
                )}
              </div>
            }
          />
        </GlassCard>

      </div>
    </div>
  );
}
