"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Hospital,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import {
  getAdminClaimsServerSnapshot,
  getAdminClaimsSnapshot,
  refreshAdminClaimsSnapshot,
  subscribeAdminClaims,
  type AdminClaimRecord,
} from "@/lib/claimsStore";
import {
  getCompaniesServerSnapshot,
  getCompaniesSnapshot,
  refreshCompaniesSnapshot,
  subscribeCompanies,
} from "@/lib/companyStore";
import {
  getProviderDirectoryServerSnapshot,
  getProviderDirectorySnapshot,
  refreshProviderDirectorySnapshot,
  subscribeProviderDirectory,
  getProviderCredentialsServerSnapshot,
  getProviderCredentialsSnapshot,
  subscribeProviderCredentials,
  getProviderDirectory,
} from "@/lib/providerSession";
import {
  ensureMemberSeed,
  getMemberDirectoryServerSnapshot,
  getMemberDirectorySnapshot,
  subscribeMemberDirectory,
} from "@/lib/memberSession";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const getClaimDateValue = (claim: AdminClaimRecord) => {
  const stamp = claim.submittedAt || claim.createdAt || claim.date;
  if (!stamp) return 0;
  const parsed = new Date(stamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getClaimStatusScheme = (status: string) => {
  switch (status) {
    case "Approved":
      return "success";
    case "Rejected":
      return "danger";
    case "In progress":
      return "info";
    default:
      return "warning";
  }
};

type DependentRequestRow = {
  id: string;
  payload?: {
    fullName?: string;
    relationship?: string;
    submittedAt?: string;
  } | null;
  status?: string | null;
  created_at: string;
};

export default function AdminDashboard() {
  const adminClaims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsServerSnapshot
  );
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const providers = useSyncExternalStore(
    subscribeProviderDirectory,
    getProviderDirectorySnapshot,
    getProviderDirectoryServerSnapshot
  );
  const providerCredentials = useSyncExternalStore(
    subscribeProviderCredentials,
    getProviderCredentialsSnapshot,
    getProviderCredentialsServerSnapshot
  );
  const members = useSyncExternalStore(
    subscribeMemberDirectory,
    getMemberDirectorySnapshot,
    getMemberDirectoryServerSnapshot
  );
  const [dependentRequests, setDependentRequests] = useState<
    Array<{
      id: string;
      fullName: string;
      relationship: string;
      status: "pending" | "approved" | "rejected";
      submittedAt: string;
    }>
  >([]);
  const [dependentRequestsLoaded, setDependentRequestsLoaded] = useState(false);
  const [dashboardMetricsLoaded, setDashboardMetricsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      refreshAdminClaimsSnapshot(),
      refreshCompaniesSnapshot(),
      refreshProviderDirectorySnapshot(),
      ensureMemberSeed(true),
    ]).finally(() => {
      if (!cancelled) setDashboardMetricsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dependentRequestsLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("dependent_requests")
          .select("id,payload,status,created_at")
          .order("created_at", { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) throw error;
        setDependentRequests(
          ((data || []) as DependentRequestRow[]).map((row) => {
            const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
            return {
              id: row.id,
              fullName: typeof payload.fullName === "string" ? payload.fullName : "",
              relationship: typeof payload.relationship === "string" ? payload.relationship : "",
              status: (row.status || "pending") as "pending" | "approved" | "rejected",
              submittedAt: typeof payload.submittedAt === "string" ? payload.submittedAt : row.created_at,
            };
          })
        );
      } finally {
        if (!cancelled) setDependentRequestsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dependentRequestsLoaded]);

  const updateDependentRequestStatus = async (requestId: string, status: "approved" | "rejected") => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const actorProfileId = data.session?.user.id || null;
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("dependent_requests")
      .update({ status, reviewed_at: nowIso, reviewed_by_profile_id: actorProfileId, updated_at: nowIso })
      .eq("id", requestId);
    if (error) return;
    setDependentRequests((prev) => prev.map((request) => (request.id === requestId ? { ...request, status } : request)));
  };

  const analytics = useMemo(() => {
    const approvedClaims = adminClaims.filter((claim) => claim.status === "Approved");
    const rejectedClaims = adminClaims.filter((claim) => claim.status === "Rejected");
    const inReviewClaims = adminClaims.filter((claim) => claim.status === "In review");
    const inProgressClaims = adminClaims.filter((claim) => claim.status === "In progress");
    const pendingQueue = inReviewClaims.length + inProgressClaims.length;
    const approvedValue = approvedClaims.reduce((sum, claim) => sum + claim.amount, 0);
    const pendingValue = adminClaims
      .filter((claim) => !["Approved", "Rejected"].includes(claim.status))
      .reduce((sum, claim) => sum + claim.amount, 0);
    const totalClaimValue = adminClaims.reduce((sum, claim) => sum + claim.amount, 0);
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const claimsThisMonth = adminClaims.filter((claim) => {
      const stamp = claim.submittedAt || claim.createdAt || claim.date;
      return stamp?.slice(0, 7) === currentMonthKey;
    });
    const closedThisMonth = adminClaims.filter((claim) => {
      if (!["Approved", "Rejected"].includes(claim.status)) return false;
      const stamp = claim.bankSlipUploadedAt || claim.submittedAt || claim.createdAt || claim.date;
      return stamp?.slice(0, 7) === currentMonthKey;
    });
    const highValueClaims = adminClaims.filter((claim) => claim.amount >= 3000);
    const activeCompanies = companies.filter((company) => company.status === "Active");
    const activeProviders = providers.filter((provider) => provider.status === "Active");
    const activeMembers = members.filter((member) => member.status === "Active");
    const vendorsWithCompliance = getProviderDirectory();
    let compliancePendingCount = 0;
    for (const vendor of vendorsWithCompliance) {
      if (vendor.compliance?.clinicLicense?.status === "submitted") compliancePendingCount++;
      compliancePendingCount += (vendor.compliance?.doctorApcs || []).filter((doc) => doc.status === "submitted").length;
    }
    const providerPerformance = Object.entries(
      adminClaims.reduce<Record<string, { claims: number; amount: number }>>((accumulator, claim) => {
        const current = accumulator[claim.hospital] || { claims: 0, amount: 0 };
        current.claims += 1;
        current.amount += claim.amount;
        accumulator[claim.hospital] = current;
        return accumulator;
      }, {})
    )
      .map(([name, value]) => ({ name, ...value }))
      .sort((left, right) => right.claims - left.claims || right.amount - left.amount);
    const recentClaims = [...adminClaims]
      .sort((left, right) => getClaimDateValue(right) - getClaimDateValue(left))
      .slice(0, 5);

    return {
      totalClaims: adminClaims.length,
      approvedClaims: approvedClaims.length,
      rejectedClaims: rejectedClaims.length,
      inReviewClaims: inReviewClaims.length,
      inProgressClaims: inProgressClaims.length,
      pendingQueue,
      approvedValue,
      pendingValue,
      totalClaimValue,
      averageClaim: adminClaims.length ? totalClaimValue / adminClaims.length : 0,
      approvalRate: adminClaims.length ? (approvedClaims.length / adminClaims.length) * 100 : 0,
      claimsThisMonth: claimsThisMonth.length,
      closedThisMonth: closedThisMonth.length,
      highValueClaims: highValueClaims.length,
      activeCompanies: activeCompanies.length,
      activeProviders: activeProviders.length,
      activeMembers: activeMembers.length,
      compliancePendingCount,
      pendingDependentRequests: dependentRequests.filter((request) => request.status === "pending").length,
      topProvider: providerPerformance[0] || null,
      recentClaims,
      latestClaim: recentClaims[0] || null,
    };
  }, [adminClaims, companies, dependentRequests, members, providers, providerCredentials]);

  const isDashboardLoading = !dashboardMetricsLoaded || !dependentRequestsLoaded;
  const formatDashboardMetric = (value: string | number) => (isDashboardLoading ? "Loading..." : String(value));
  const formatDashboardCurrency = (value: number) =>
    isDashboardLoading ? "Loading..." : formatCurrency(value);

  const dashboardStats = [
    {
      label: "Pending Review",
      value: formatDashboardMetric(analytics.inReviewClaims.toLocaleString()),
      meta: isDashboardLoading ? "Loading latest queue status..." : `${analytics.pendingQueue} claims currently in queue`,
      icon: Clock3,
      iconWrap: "bg-amber-100 text-amber-600",
    },
    {
      label: "Approved Payout",
      value: formatDashboardCurrency(analytics.approvedValue),
      meta: isDashboardLoading ? "Loading payout totals..." : `${analytics.approvedClaims} approved claims`,
      icon: CheckCircle2,
      iconWrap: "bg-emerald-100 text-emerald-600",
    },
    {
      label: "Active Members",
      value: formatDashboardMetric(analytics.activeMembers.toLocaleString()),
      meta: isDashboardLoading ? "Loading member directory..." : `${analytics.activeCompanies} active companies`,
      icon: Users,
      iconWrap: "bg-violet-100 text-violet-600",
    },
    {
      label: "Provider Network",
      value: formatDashboardMetric(analytics.activeProviders.toLocaleString()),
      meta: isDashboardLoading
        ? "Loading provider activity..."
        : analytics.topProvider
          ? `${analytics.topProvider.name} leads with ${analytics.topProvider.claims} claims`
          : "No provider activity yet",
      icon: Hospital,
      iconWrap: "bg-cyan-100 text-cyan-600",
    },
    {
      label: "Pending Compliance",
      value: formatDashboardMetric(analytics.compliancePendingCount.toLocaleString()),
      meta: isDashboardLoading
        ? "Loading compliance reviews..."
        : `${analytics.compliancePendingCount} vendor document(s) awaiting approval`,
      icon: ShieldCheck,
      iconWrap: "bg-amber-100 text-amber-600",
    },
  ];

  const focusStats = [
    {
      label: "In Progress",
      value: formatDashboardMetric(analytics.inProgressClaims.toLocaleString()),
      meta: isDashboardLoading ? "Loading claim workflow..." : `${analytics.closedThisMonth} claims closed this month`,
    },
    {
      label: "Pending Exposure",
      value: formatDashboardCurrency(analytics.pendingValue),
      meta: isDashboardLoading ? "Loading exposure totals..." : `${analytics.highValueClaims} high-value claims flagged`,
    },
    {
      label: "Approval Rate",
      value: formatDashboardMetric(`${analytics.approvalRate.toFixed(1)}%`),
      meta: isDashboardLoading
        ? "Loading approval trend..."
        : `${analytics.approvedClaims} approved / ${analytics.totalClaims} total`,
    },
    {
      label: "Dependents Queue",
      value: formatDashboardMetric(analytics.pendingDependentRequests.toString()),
      meta: isDashboardLoading
        ? "Loading dependent requests..."
        : dependentRequests.length
          ? `${dependentRequests.length} total request records`
          : "No dependent request submitted yet",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Management Dashboard</h1>
        </div>
      </div>

      <GlassCard className="overflow-hidden border-cyan-200/70 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(34,197,94,0.08),rgba(255,255,255,0.82))] p-0 shadow-xl shadow-sky-100/60">
        <div className="relative overflow-hidden rounded-2xl p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(186,230,253,0.16),transparent_32%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin Analytics
              </div>
              <div className="space-y-2">
                <h2 className="max-w-3xl text-3xl font-bold text-slate-900">Operational overview at a glance</h2>
                <p className="max-w-2xl text-sm text-slate-600">
                  Focus on the numbers that matter most for daily admin monitoring.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Claims This Month</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{formatDashboardMetric(analytics.claimsThisMonth)}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {isDashboardLoading
                      ? "Loading current-month activity..."
                      : `${analytics.closedThisMonth} claims already closed this month`}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Latest Claim</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {isDashboardLoading ? "Loading..." : analytics.latestClaim?.id || "No activity"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {isDashboardLoading
                      ? "Fetching latest claim activity."
                      : analytics.latestClaim
                        ? `${analytics.latestClaim.patient} at ${analytics.latestClaim.hospital}`
                        : "New submissions will appear here."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Top Provider</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">
                    {isDashboardLoading ? "Loading..." : analytics.topProvider?.name || "No data"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {isDashboardLoading
                      ? "Fetching provider performance."
                      : analytics.topProvider
                        ? `${analytics.topProvider.claims} claims • ${formatCurrency(analytics.topProvider.amount)}`
                        : "Waiting for provider submissions"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(14,165,233,0.1),rgba(34,197,94,0.07),rgba(255,255,255,0.72))] p-5 shadow-xl shadow-sky-200/25 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-sky-700/80">Total Claim Value</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{formatDashboardCurrency(analytics.totalClaimValue)}</p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/55 p-3 text-sky-700">
                  <Activity className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {focusStats.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/55 px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.meta}</p>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <GlassCard key={stat.label} className="rounded-2xl border-white/70 bg-white/75 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{stat.label}</p>
                  <p className="mt-3 text-3xl font-bold text-slate-900">{stat.value}</p>
                  <p className="mt-2 text-sm text-slate-600">{stat.meta}</p>
                </div>
                <div className={cn("rounded-2xl p-3", stat.iconWrap)}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task Inbox */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Active Claims</h2>
            <Link href="/admin/claims" className="text-sm text-sky-600 font-medium hover:underline">
              View All
            </Link>
          </div>

          <div className="space-y-3">
            {isDashboardLoading && (
              <GlassCard className="p-5">
                <p className="text-sm text-slate-500">Loading claims...</p>
              </GlassCard>
            )}
            {!isDashboardLoading && analytics.recentClaims.length === 0 && (
              <GlassCard className="p-5">
                <p className="text-sm text-slate-500">No claims recorded yet.</p>
              </GlassCard>
            )}
            {!isDashboardLoading && analytics.recentClaims.map((claim) => (
              <GlassCard key={claim.id} className="flex items-center justify-between p-4 hover:bg-white/40 transition-colors group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-xs">
                    {claim.hospital.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{claim.hospital}</p>
                    <p className="text-sm text-slate-500">{claim.patient} • {claim.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className="font-bold text-slate-800">{formatCurrency(claim.amount)}</p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <StatusBadge status={claim.status} scheme={getClaimStatusScheme(claim.status)} />
                      <span className="text-xs text-slate-500">
                        {formatDateDisplay(claim.submittedAt || claim.createdAt || claim.date) || claim.date}
                      </span>
                    </div>
                  </div>
                  <Link href={`/admin/claims/${claim.id}`}>
                    <GlassButton variant="secondary" className="h-8 w-8 p-0 rounded-full">
                      <ArrowRight className="w-4 h-4" />
                    </GlassButton>
                  </Link>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Quick Actions / Notifications */}
        <div className="space-y-4">
          <GlassCard className="space-y-3">
            <h3 className="font-medium text-slate-800">Quick Overview</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                <span className="text-sm text-slate-600">Total Claims</span>
                <span className="font-bold text-slate-900">{formatDashboardMetric(analytics.totalClaims)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                <span className="text-sm text-slate-600">Rejected Claims</span>
                <span className="font-bold text-rose-600">{formatDashboardMetric(analytics.rejectedClaims)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                <span className="text-sm text-slate-600">Average Claim</span>
                <span className="font-bold text-slate-900">{formatDashboardCurrency(analytics.averageClaim)}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-3">
            <h3 className="font-medium text-slate-800">Dependent Requests</h3>
            {!dependentRequestsLoaded && (
              <p className="text-xs text-slate-500">Loading dependent requests...</p>
            )}
            {dependentRequestsLoaded && dependentRequests.length === 0 && (
              <p className="text-xs text-slate-500">No dependent requests submitted.</p>
            )}
            {dependentRequestsLoaded && dependentRequests.slice(0, 4).map((request) => (
              <div key={request.id} className="rounded-xl border border-slate-200 bg-white/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{request.fullName}</p>
                  <StatusBadge
                    status={request.status}
                    scheme={
                      request.status === "approved"
                        ? "success"
                        : request.status === "rejected"
                          ? "danger"
                          : "warning"
                    }
                  />
                </div>
                <p className="text-xs text-slate-500">
                  {request.relationship} • {new Date(request.submittedAt).toLocaleDateString()}
                </p>
                {request.status === "pending" && (
                  <div className="flex gap-2">
                    <GlassButton size="sm" onClick={() => updateDependentRequestStatus(request.id, "approved")}>
                      Approve
                    </GlassButton>
                    <GlassButton size="sm" variant="secondary" onClick={() => updateDependentRequestStatus(request.id, "rejected")}>
                      Reject
                    </GlassButton>
                  </div>
                )}
              </div>
            ))}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
