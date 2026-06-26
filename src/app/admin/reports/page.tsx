"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
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

const DONUT_COLORS: Record<string, string> = {
  "bg-sky-500": "#0ea5e9",
  "bg-emerald-500": "#10b981",
  "bg-violet-500": "#8b5cf6",
  "bg-amber-500": "#f59e0b",
  "bg-rose-500": "#f43f5e",
  "bg-cyan-500": "#06b6d4",
};

/* ── Lightweight SVG Donut Chart ── */
function DonutChart({
  data,
  totalLabel,
  totalValue,
}: {
  data: Array<{ name: string; amount: number; percentage: number; color: string }>;
  totalLabel: string;
  totalValue: string;
}) {
  const RADIUS = 80;
  const STROKE = 18;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const SIZE = (RADIUS + STROKE) * 2 + 8;

  let cumulativePercent = 0;
  const segments = data.map((item) => {
    const offset = (cumulativePercent / 100) * CIRCUMFERENCE;
    const length = (item.percentage / 100) * CIRCUMFERENCE;
    cumulativePercent += item.percentage;
    return { ...item, offset, length };
  });

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="drop-shadow-sm">
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={STROKE}
      />
      {segments.map((seg, i) => (
        <circle
          key={i}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={DONUT_COLORS[seg.color] || "#94a3b8"}
          strokeWidth={STROKE}
          strokeDasharray={`${seg.length} ${CIRCUMFERENCE - seg.length}`}
          strokeDashoffset={-seg.offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          className="transition-all duration-700"
        />
      ))}
      <text x={SIZE / 2} y={SIZE / 2 - 8} textAnchor="middle" fill="#94a3b8" fontSize="10" fontWeight="600" letterSpacing="0.05em">{totalLabel}</text>
      <text x={SIZE / 2} y={SIZE / 2 + 12} textAnchor="middle" fill="#1e293b" fontSize="14" fontWeight="700">{totalValue}</text>
    </svg>
  );
}

/* ── Lightweight SVG Bar Chart ── */
function BarChart({
  data,
  valueLabel,
}: {
  data: Array<{ name: string; count: number; percentage: number }>;
  valueLabel: string;
}) {
  if (data.length === 0) return <p className="text-sm text-slate-400 py-8 text-center">No data available.</p>;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const BAR_H = 26;
  const LABEL_W = 144;
  const BAR_MAX = 210;
  const GAP = 10;
  const CHART_W = LABEL_W + BAR_MAX + 52; // room for count + % after bar

  const truncate = (text: string, maxChars: number) =>
    text.length > maxChars ? text.slice(0, maxChars - 1) + "…" : text;

  return (
    <svg width="100%" height={data.length * (BAR_H + GAP) + 8} viewBox={`0 0 ${CHART_W} ${data.length * (BAR_H + GAP) + 8}`}>
      {data.map((item, i) => {
        const y = i * (BAR_H + GAP);
        const w = Math.max((item.count / maxCount) * BAR_MAX, 8);
        return (
          <g key={i}>
            <text x={0} y={y + BAR_H / 2 + 5} fill="#475569" fontSize="12" fontWeight="500">
              <title>{item.name}</title>
              {truncate(item.name, 22)}
            </text>
            <rect x={LABEL_W} y={y} width={w} height={BAR_H} rx="5" fill="#0ea5e9" opacity="0.85" />
            <text
              x={w > 40 ? LABEL_W + w - 8 : LABEL_W + w + 6}
              y={y + BAR_H / 2 + 5}
              fill={w > 40 ? "#ffffff" : "#0ea5e9"}
              fontSize="11"
              fontWeight="600"
              textAnchor={w > 40 ? "end" : "start"}
            >
              {item.count}
            </text>
            <text x={LABEL_W + BAR_MAX + 10} y={y + BAR_H / 2 + 5} fill="#94a3b8" fontSize="11">
              {item.percentage}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

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
        <div className="flex flex-wrap gap-2 items-center">
          <GlassSelect
            className="min-w-[180px]"
            value={selectedCompanyId}
            options={[
              { label: "All Companies", value: "all" },
              ...companies.map((company) => ({
                label: company.name,
                value: company.companyId,
              })),
            ]}
            onChange={(value) => setSelectedCompanyId(value)}
            placeholder="Select company"
          />
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 z-10" />
            <GlassSelect
              className="min-w-[172px] pl-9"
              value={effectiveSelectedPeriod}
              options={availablePeriods.map((periodKey) => ({
                label: periodKey === "all" ? "All Periods" : formatMonthLabel(periodKey),
                value: periodKey,
              }))}
              onChange={(value) => setSelectedPeriod(value)}
              placeholder="All Periods"
            />
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
            {!isReportsLoading && diagnosisData.length > 0 && (
              <BarChart data={diagnosisData} valueLabel="cases" />
            )}
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
          
          <div className="flex items-center justify-center py-2">
            {isReportsLoading ? (
              <p className="text-sm text-slate-400">Loading...</p>
            ) : categoryData.length === 0 ? (
              <p className="text-sm text-slate-400">No data for current filters.</p>
            ) : (
              <DonutChart data={categoryData} totalLabel="Total Spent" totalValue={`RM ${selectedPayoutValue.toLocaleString("en-MY")}`} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!isReportsLoading && categoryData.map((cat, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/50 transition-colors">
                <div className={cn("w-3 h-3 rounded-full shrink-0", cat.color)} />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-bold truncate">{cat.name}</p>
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
                          <StatusBadge
                            status={log.status}
                            scheme={
                              log.status === "Approved"
                                ? "success"
                                : log.status === "Rejected"
                                  ? "danger"
                                  : "warning"
                            }
                          />
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
                      <StatusBadge
                        status={log.status}
                        scheme={
                          log.status === "Approved"
                            ? "success"
                            : log.status === "Rejected"
                              ? "danger"
                              : "warning"
                        }
                      />
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
