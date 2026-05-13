"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleDollarSign,
  Clock,
  FilePlus,
  ReceiptText,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { ensureCompanySeed, getCompanies } from "@/lib/companyStore";
import { ensureMemberSeed, getMemberDirectory, getMemberSession } from "@/lib/memberSession";
import {
  ensureMemberClaimsStore,
  getMemberClaimsServerSnapshot,
  getMemberClaimsSnapshot,
  subscribeMemberClaims,
} from "@/lib/claimsStore";
import { getCategoryBalanceBreakdown } from "@/lib/categoryBalance";
import { getMemberLimitOwnerStaffId } from "@/lib/memberPlan";
import { useMemo, useSyncExternalStore } from "react";

export default function CustomerDashboard() {
  ensureMemberSeed();
  ensureCompanySeed();
  ensureMemberClaimsStore();

  const memberName = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => getMemberSession()?.fullName ?? "Member",
    () => "Member"
  );
  const submittedClaims = useSyncExternalStore(
    subscribeMemberClaims,
    getMemberClaimsSnapshot,
    getMemberClaimsServerSnapshot
  );
  const memberSession = getMemberSession();
  const company = memberSession ? getCompanies().find((c) => c.companyId === memberSession.companyId) ?? null : null;
  const currentMember = getMemberDirectory().find(
    (entry) =>
      entry.companyId === memberSession?.companyId &&
      entry.staffId === memberSession?.staffId
  );
  const coverageYear = new Date().getFullYear();
  const validUntil = `31 Dec ${coverageYear}`;
  const dependents = [
    { name: "Jane Doe", relation: "Spouse", status: "Active" },
    { name: "Jimmy Doe", relation: "Child", status: "Active" },
  ];

  const analytics = useMemo(() => {
    const annualLimit = currentMember?.familyLumpSumLimit || currentMember?.lumpSumLimit || 50000;
    const approvedClaims = submittedClaims.filter((claim) => claim.status === "Approved");
    const pendingClaims = submittedClaims.filter((claim) => claim.status === "In review" || claim.status === "In progress");
    const rejectedClaims = submittedClaims.filter((claim) => claim.status === "Rejected");
    const totalSubmittedAmount = submittedClaims.reduce((sum, claim) => sum + Number(claim.amountSubmitted || 0), 0);
    const approvedAmount = approvedClaims.reduce((sum, claim) => sum + Number(claim.amountSubmitted || 0), 0);
    const pendingAmount = pendingClaims.reduce((sum, claim) => sum + Number(claim.amountSubmitted || 0), 0);
    const availableBalance = Math.max(annualLimit - approvedAmount, 0);
    const utilizationPercentage = annualLimit > 0 ? Math.min((approvedAmount / annualLimit) * 100, 100) : 0;
    const averageClaim = submittedClaims.length > 0 ? totalSubmittedAmount / submittedClaims.length : 0;
    const latestClaim = [...submittedClaims].sort((a, b) => {
      const left = new Date(b.createdAt || b.visitDate).getTime();
      const right = new Date(a.createdAt || a.visitDate).getTime();
      return left - right;
    })[0];

    return {
      annualLimit,
      approvedAmount,
      averageClaim,
      availableBalance,
      latestClaim,
      pendingAmount,
      rejectedClaims: rejectedClaims.length,
      totalClaims: submittedClaims.length,
      approvedClaims: approvedClaims.length,
      pendingClaims: pendingClaims.length,
      totalSubmittedAmount,
      utilizationPercentage,
      activeDependents: dependents.filter((dependent) => dependent.status === "Active").length,
    };
  }, [currentMember?.familyLumpSumLimit, currentMember?.lumpSumLimit, submittedClaims]);

  const categoryBalanceRows = useMemo(() => {
    if (!currentMember) return [];
    return getCategoryBalanceBreakdown(currentMember, company);
  }, [company, currentMember]);

  const memberLimitOwnerKey = useMemo(() => {
    if (!currentMember) return "";
    return getMemberLimitOwnerStaffId(currentMember, company) || currentMember.staffId;
  }, [company, currentMember]);

  const recentClaims = useMemo(
    () =>
      [...submittedClaims]
        .sort((a, b) => {
          const left = new Date(b.createdAt || b.visitDate).getTime();
          const right = new Date(a.createdAt || a.visitDate).getTime();
          return left - right;
        })
        .slice(0, 4)
        .map((claim) => ({
          id: claim.id,
          hospital: claim.providerName,
          amount: formatCurrency(Number(claim.amountSubmitted || 0)),
          status: claim.status,
          date: formatDateDisplay(claim.createdAt || claim.visitDate),
        })),
    [submittedClaims]
  );

  const overviewStats = [
    { label: "Claims Submitted", value: analytics.totalClaims.toString(), icon: ReceiptText, tone: "text-sky-700 bg-sky-100" },
    { label: "Approved Claims", value: analytics.approvedClaims.toString(), icon: BadgeCheck, tone: "text-emerald-700 bg-emerald-100" },
    { label: "Pending Review", value: analytics.pendingClaims.toString(), icon: ShieldAlert, tone: "text-amber-700 bg-amber-100" },
    { label: "Rejected Claims", value: analytics.rejectedClaims.toString(), icon: Activity, tone: "text-rose-700 bg-rose-100" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hello, {memberName}</h1>
          <p className="text-slate-500">Welcome to your health dashboard.</p>
        </div>
        <Link href="/member/claims">
          <GlassButton className="gap-2">
            <FilePlus className="w-4 h-4" />
            Submit New Claim
          </GlassButton>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard className="lg:col-span-2 overflow-hidden border-cyan-200/70 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(34,197,94,0.08),rgba(255,255,255,0.82))]">
          <div className="relative space-y-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700">
                  <Activity className="h-3.5 w-3.5" />
                  Dashboard Analytics
                </div>
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-slate-900">Claims and benefit utilization overview</h3>
                  <p className="max-w-2xl text-sm text-slate-600">Track your submitted claims, reimbursement movement, and remaining medical balance in one operational dashboard.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Coverage Year</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{coverageYear}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Active Dependents</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{analytics.activeDependents}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {overviewStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                      <p className="mt-3 text-2xl font-bold text-slate-900">{stat.value}</p>
                    </div>
                    <div className={cn("rounded-2xl p-3", stat.tone)}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-3xl border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(14,165,233,0.1),rgba(34,197,94,0.07),rgba(255,255,255,0.72))] p-5 text-slate-900 shadow-xl shadow-sky-200/30 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700/80">Available Balance</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(analytics.availableBalance)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/50 bg-white/55 p-3 text-sky-700">
                    <CircleDollarSign className="h-10 w-10" />
                  </div>
                </div>

                <div className="mt-4 flex items-end gap-2">
                  <span className="text-sm text-slate-600">of {formatCurrency(analytics.annualLimit)} annual limit</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {analytics.utilizationPercentage.toFixed(1)}% utilized
                  </span>
                </div>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/55">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-700"
                    style={{ width: `${Math.max(analytics.utilizationPercentage, 4)}%` }}
                  />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/50 bg-white/50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Approved Amount</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(analytics.approvedAmount)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/50 bg-white/50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Average Claim</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(analytics.averageClaim)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/50 bg-white/50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Submitted Value</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(analytics.totalSubmittedAmount)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Latest Activity</p>
                  <p className="mt-3 text-lg font-bold text-slate-900">
                    {analytics.latestClaim?.providerName || "No claims submitted yet"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {analytics.latestClaim
                      ? `${formatDateDisplay(analytics.latestClaim.createdAt || analytics.latestClaim.visitDate)} • ${analytics.latestClaim.status}`
                      : "Your latest claim submission will appear here."}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Reimbursement Outlook</p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-600">Pending review amount</span>
                      <span className="font-bold text-amber-600">{formatCurrency(analytics.pendingAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-600">Coverage valid until</span>
                      <span className="font-bold text-slate-800">{validUntil}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                      <span className="text-sm text-slate-600">Member status</span>
                      <span className="font-bold text-emerald-600">{currentMember?.status || "Active"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" />
            Coverage Analytics
          </h3>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/70 bg-white/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Dependents Covered</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{dependents.length}</p>
              <p className="mt-1 text-sm text-slate-500">{analytics.activeDependents} active under the current medical coverage.</p>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Claim Conversion</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {analytics.totalClaims > 0 ? `${Math.round((analytics.approvedClaims / analytics.totalClaims) * 100)}%` : "0%"}
              </p>
              <p className="mt-1 text-sm text-slate-500">Percentage of submitted claims that have been approved.</p>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Next Action</p>
              <p className="mt-2 text-lg font-bold text-slate-900">
                {analytics.pendingClaims > 0 ? "Monitor pending claims" : "Submit when needed"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {analytics.pendingClaims > 0
                  ? `${analytics.pendingClaims} claim(s) are still under review or in progress.`
                  : "No active claim is waiting for review right now."}
              </p>
            </div>
          </div>

          <Link href="/member/history">
            <GlassButton variant="secondary" className="w-full text-sm">
              Review Claim Performance
            </GlassButton>
          </Link>
        </GlassCard>
      </div>

      <GlassCard className="overflow-hidden">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Category balance breakdown</h2>
            <p className="text-sm text-slate-500">Limit, reserved, utilized, and available balances (includes shared limit where applicable).</p>
          </div>
          <div className="text-xs text-slate-500">
            Limit owner key: <span className="font-semibold text-slate-700">{memberLimitOwnerKey || "-"}</span>
          </div>
        </div>

        {categoryBalanceRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200/70 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Limit</th>
                  <th className="px-3 py-2 text-right">Reserved</th>
                  <th className="px-3 py-2 text-right">Utilized</th>
                  <th className="px-3 py-2 text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {categoryBalanceRows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-3 py-3 font-semibold text-slate-800">{row.label}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800">{formatCurrency(row.limit)}</td>
                    <td className="px-3 py-3 text-right text-amber-700">{formatCurrency(row.reserved)}</td>
                    <td className="px-3 py-3 text-right text-rose-700">{formatCurrency(row.utilized)}</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-700">{formatCurrency(row.available)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/70 p-4 text-sm text-slate-600">
            Balance breakdown is not available for this member yet.
          </div>
        )}
      </GlassCard>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Recent Claims</h2>
          <Link href="/member/history" className="text-sm text-sky-600 font-bold hover:underline flex items-center gap-1">
            View All History
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {recentClaims.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentClaims.map((claim) => (
              <GlassCard key={claim.id} className="flex items-center justify-between p-4 group cursor-pointer hover:bg-white/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">{claim.hospital}</p>
                    <p className="text-xs text-slate-500">{claim.date} • {claim.id}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-4">
                  <div>
                    <p className="font-bold text-slate-800">{claim.amount}</p>
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-wider",
                      claim.status === "Approved"
                        ? "text-emerald-600"
                        : claim.status === "Rejected"
                        ? "text-rose-600"
                        : "text-amber-600"
                    )}>{claim.status}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-sky-500 transition-colors" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard className="p-8 text-center">
            <p className="text-lg font-bold text-slate-800">No recent claims yet</p>
            <p className="mt-2 text-sm text-slate-500">Once you submit claims, your latest activity and analytics will appear here.</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
