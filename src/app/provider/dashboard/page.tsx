"use client";

import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Landmark,
  PlusCircle,
  ReceiptText,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { downloadText } from "@/lib/download";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import {
  ensureProviderSeed,
  getProviderById,
  getProviderSession,
  getVendorMembersByVendor,
  isProviderCompliant,
} from "@/lib/providerSession";
import {
  ensureProviderClaimsStore,
  getProviderClaimsServerSnapshot,
  getProviderClaimsSnapshot,
  subscribeProviderClaims,
} from "@/lib/providerClaimsStore";

const getDateValue = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCompactDate = (value?: string) => {
  if (!value) return "No date";
  return formatDateDisplay(value) || value;
};

const getDocumentState = (status?: string, expiryDate?: string) => {
  if (!status || status === "missing") return "Missing";
  if (status === "rejected") return "Rejected";
  if (status === "submitted") return "Submitted";
  if (expiryDate && expiryDate < new Date().toISOString().slice(0, 10)) return "Expired";
  return "Approved";
};

const getStatusClasses = (status: string) => {
  switch (status) {
    case "Approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "In progress":
      return "border-sky-200 bg-sky-50 text-sky-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
};

const normalizeProviderSubmissionStatus = (status?: string) => String(status || "").trim().toLowerCase();

const formatProviderSubmissionStatus = (status?: string) => {
  switch (normalizeProviderSubmissionStatus(status)) {
    case "request_additional_information":
      return "Request Additional Information";
    case "submitted":
      return "Submitted";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status || "Unknown";
  }
};

const getProviderSubmissionStatusClasses = (status?: string) => {
  switch (normalizeProviderSubmissionStatus(status)) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "submitted":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "request_additional_information":
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
};

export default function ProviderDashboardPage() {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (isHydrated) {
    ensureProviderSeed();
    ensureProviderClaimsStore();
  }

  const providerSession = isHydrated ? getProviderSession() : null;
  const provider = providerSession?.vendorId ? getProviderById(providerSession.vendorId) : null;
  const providerName = provider?.providerName || providerSession?.providerName || "Provider";
  const teamMembers = providerSession?.vendorId ? getVendorMembersByVendor(providerSession.vendorId) : [];
  const activeTeamMembers = teamMembers.filter((member) => member.status === "Active");
  const resolvedProviderUuid = providerSession?.providerUuid || "";
  const providerClaimsSnapshot = useSyncExternalStore(
    subscribeProviderClaims,
    getProviderClaimsSnapshot,
    getProviderClaimsServerSnapshot
  );
  const providerClaims = useMemo(
    () => providerClaimsSnapshot.filter((claim) => claim.providerId === resolvedProviderUuid),
    [providerClaimsSnapshot, resolvedProviderUuid]
  );

  const analytics = useMemo(() => {
    const approvedClaims = providerClaims.filter((claim) => normalizeProviderSubmissionStatus(claim.status) === "approved");
    const rejectedClaims = providerClaims.filter((claim) => normalizeProviderSubmissionStatus(claim.status) === "rejected");
    const submittedClaims = providerClaims.filter((claim) => normalizeProviderSubmissionStatus(claim.status) === "submitted");
    const actionRequiredClaims = providerClaims.filter(
      (claim) => normalizeProviderSubmissionStatus(claim.status) === "request_additional_information"
    );
    const pendingClaims = providerClaims.filter((claim) =>
      ["submitted", "request_additional_information"].includes(normalizeProviderSubmissionStatus(claim.status))
    );
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthClaims = providerClaims.filter((claim) => {
      const stamp = claim.submittedAt || claim.createdAt || claim.treatmentDate;
      return stamp?.slice(0, 7) === currentMonth;
    });
    const actionRequiredThisMonth = actionRequiredClaims.filter((claim) => {
      const stamp = claim.reviewedAt || claim.updatedAt || claim.createdAt;
      return stamp?.slice(0, 7) === currentMonth;
    });
    const totalSubmittedValue = providerClaims.reduce((sum, claim) => sum + claim.totalAmount, 0);
    const approvedValue = approvedClaims.reduce((sum, claim) => sum + claim.totalAmount, 0);
    const pendingValue = pendingClaims.reduce((sum, claim) => sum + claim.totalAmount, 0);
    const rejectedValue = rejectedClaims.reduce((sum, claim) => sum + claim.totalAmount, 0);
    const latestSubmission = [...providerClaims].sort(
      (left, right) =>
        getDateValue(right.submittedAt || right.createdAt || right.treatmentDate) -
        getDateValue(left.submittedAt || left.createdAt || left.treatmentDate)
    )[0];
    const latestActionRequired = [...actionRequiredClaims].sort(
      (left, right) =>
        getDateValue(right.reviewedAt || right.updatedAt || right.createdAt) -
        getDateValue(left.reviewedAt || left.updatedAt || left.createdAt)
    )[0];
    const serviceMixMap = providerClaims.reduce<Record<string, number>>((accumulator, claim) => {
      const key = claim.serviceType || "General Medical";
      accumulator[key] = (accumulator[key] || 0) + claim.totalAmount;
      return accumulator;
    }, {});
    const serviceMix = Object.entries(serviceMixMap)
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 4);

    return {
      totalClaims: providerClaims.length,
      approvedClaims: approvedClaims.length,
      rejectedClaims: rejectedClaims.length,
      submittedClaims: submittedClaims.length,
      actionRequiredClaims: actionRequiredClaims.length,
      monthClaims: monthClaims.length,
      totalSubmittedValue,
      approvedValue,
      pendingValue,
      rejectedValue,
      approvalRate: providerClaims.length ? (approvedClaims.length / providerClaims.length) * 100 : 0,
      averageClaim: providerClaims.length ? totalSubmittedValue / providerClaims.length : 0,
      actionRequiredThisMonth: actionRequiredThisMonth.length,
      latestSubmission,
      latestActionRequired,
      serviceMix,
      recentClaims: [...providerClaims]
        .sort(
          (left, right) =>
            getDateValue(right.submittedAt || right.createdAt || right.treatmentDate) -
            getDateValue(left.submittedAt || left.createdAt || left.treatmentDate)
        )
        .slice(0, 5),
    };
  }, [providerClaims]);

  const complianceSummary = useMemo(() => {
    const clinicLicense = provider?.compliance?.clinicLicense;
    const doctorApcs = provider?.compliance?.doctorApcs || [];
    const approvedDoctorCount = doctorApcs.filter(
      (doc) => getDocumentState(doc.status, doc.expiryDate) === "Approved"
    ).length;

    return {
      clinicState: getDocumentState(clinicLicense?.status, clinicLicense?.expiryDate),
      clinicExpiry: clinicLicense?.expiryDate,
      doctorCount: doctorApcs.length,
      approvedDoctorCount,
      isCompliant: provider?.vendorId ? isProviderCompliant(provider.vendorId) : false,
    };
  }, [provider]);

  const statCards = [
    {
      label: "Claims In Queue",
      value: analytics.submittedClaims + analytics.actionRequiredClaims,
      meta: `${analytics.monthClaims} submitted this month`,
      icon: Clock3,
      iconWrap: "bg-amber-100 text-amber-600",
    },
    {
      label: "Approved Value",
      value: formatCurrency(analytics.approvedValue),
      meta: `${analytics.approvedClaims} approved claims`,
      icon: BadgeCheck,
      iconWrap: "bg-emerald-100 text-emerald-600",
    },
    {
      label: "Pending Value",
      value: formatCurrency(analytics.pendingValue),
      meta: `${analytics.actionRequiredClaims} require action`,
      icon: Activity,
      iconWrap: "bg-sky-100 text-sky-600",
    },
    {
      label: "Average Claim",
      value: formatCurrency(analytics.averageClaim),
      meta: `${analytics.approvalRate.toFixed(1)}% approval rate`,
      icon: CircleDollarSign,
      iconWrap: "bg-violet-100 text-violet-600",
    },
  ];

  return (
    <div className="space-y-8">
      <GlassCard className="overflow-hidden border-sky-100 bg-white/75 p-0 shadow-xl shadow-sky-100/50">
        <div className="relative overflow-hidden rounded-2xl p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.28),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(74,222,128,0.2),transparent_24%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                <Building2 className="h-3.5 w-3.5" />
                Provider Analytics
              </div>
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 md:text-3xl">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Landmark className="h-6 w-6" />
                  </span>
                  {providerName}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                  Live overview of claim submissions, settlement progress, and compliance readiness based on the current provider claim records.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-slate-700">
                  <Users className="h-4 w-4 text-sky-600" />
                  {activeTeamMembers.length} active portal users
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-slate-700">
                  <ReceiptText className="h-4 w-4 text-sky-600" />
                  {analytics.totalClaims} claims submitted
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/65 px-3 py-1.5 text-slate-700">
                  <CalendarDays className="h-4 w-4 text-sky-600" />
                  Last submission {formatCompactDate(
                    analytics.latestSubmission?.submittedAt ||
                      analytics.latestSubmission?.createdAt ||
                      analytics.latestSubmission?.treatmentDate
                  )}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
              <div className="rounded-2xl border border-emerald-100 bg-white/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Latest Submission</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(analytics.latestSubmission?.totalAmount || 0)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {analytics.latestSubmission
                    ? `${analytics.latestSubmission.claimNumber} submitted ${formatCompactDate(
                        analytics.latestSubmission.submittedAt ||
                          analytics.latestSubmission.createdAt ||
                          analytics.latestSubmission.treatmentDate
                      )}`
                    : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-white/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Action Required</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.actionRequiredClaims}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {analytics.actionRequiredThisMonth} updated this month
                </p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <GlassCard key={card.label} className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{card.meta}</p>
                </div>
                <div className={`rounded-2xl p-3 ${card.iconWrap}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <GlassCard className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/40">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <Activity className="h-5 w-5 text-sky-600" />
                  Claims Performance
                </h2>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Approval Rate</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{analytics.approvalRate.toFixed(1)}%</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/65 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Submitted Value</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(analytics.totalSubmittedValue)}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/75 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Awaiting Outcome</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{analytics.submittedClaims + analytics.actionRequiredClaims}</p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Rejected Value</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{formatCurrency(analytics.rejectedValue)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-2xl border border-white/80 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Service Mix</p>
                    <p className="text-xs text-slate-500">Contribution by submitted claim value</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                    Top Categories
                  </span>
                </div>
                <div className="mt-4 space-y-4">
                  {analytics.serviceMix.length ? (
                    analytics.serviceMix.map((item) => {
                      const percentage = analytics.totalSubmittedValue
                        ? (item.value / analytics.totalSubmittedValue) * 100
                        : 0;
                      return (
                        <div key={item.label}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-slate-700">{item.label}</p>
                            <p className="text-sm font-semibold text-slate-900">{formatCurrency(item.value)}</p>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400"
                              style={{ width: `${Math.max(percentage, 8)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm text-slate-500">
                      Service mix will appear after provider claims are submitted.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/80 bg-slate-50/80 p-4">
                <p className="text-sm font-semibold text-slate-900">Operational Snapshot</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-white bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">Submitted</span>
                    <span className="text-lg font-bold text-slate-900">{analytics.submittedClaims}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">Action required</span>
                    <span className="text-lg font-bold text-amber-700">{analytics.actionRequiredClaims}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">Approved</span>
                    <span className="text-lg font-bold text-emerald-700">{analytics.approvedClaims}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white bg-white/80 px-4 py-3">
                    <span className="text-sm text-slate-600">Rejected</span>
                    <span className="text-lg font-bold text-rose-700">{analytics.rejectedClaims}</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/40">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <FileText className="h-5 w-5 text-sky-600" />
                  Recent Claim Activity
                </h2>
              </div>
              <Link href="/provider/payments" className="text-sm font-semibold text-sky-700 hover:underline">
                Open payment history
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {analytics.recentClaims.length ? (
                analytics.recentClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/80 bg-slate-50/80 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                        <ReceiptText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{claim.claimNumber || claim.invoiceNumber || claim.id}</p>
                        <p className="text-sm text-slate-500">
                          {claim.serviceType || "General Medical"} • {formatCompactDate(claim.treatmentDate)}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                          Submitted {formatCompactDate(claim.submittedAt || claim.createdAt || claim.treatmentDate)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-left md:text-right">
                        <p className="font-semibold text-slate-900">{formatCurrency(claim.totalAmount)}</p>
                        <p className="text-sm text-slate-500">{claim.invoiceNumber || "Invoice number pending"}</p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getProviderSubmissionStatusClasses(
                          claim.status
                        )}`}
                      >
                        {formatProviderSubmissionStatus(claim.status)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
                  No provider claims have been submitted yet.
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/40">
            <h2 className="text-lg font-bold text-slate-900">Quick Tools</h2>
            <div className="mt-4 space-y-3">
              <Link href="/provider/invoices" className="block">
                <div className="rounded-2xl border border-sky-100 bg-sky-50/65 p-4 transition hover:bg-sky-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">Submit New Invoice</p>
                      <p className="mt-1 text-sm text-slate-500">Create a new provider claim with charge breakdown.</p>
                    </div>
                    <PlusCircle className="h-5 w-5 text-sky-600" />
                  </div>
                </div>
              </Link>
              <Link href="/provider/verification" className="block">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 transition hover:bg-emerald-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">Verify Patient Coverage</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </Link>
              <Link href="/provider/payments" className="block">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4 transition hover:bg-violet-50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">Review Payment History</p>
                      <p className="mt-1 text-sm text-slate-500">See paid batches and downloaded settlement files.</p>
                    </div>
                    <CircleDollarSign className="h-5 w-5 text-violet-600" />
                  </div>
                </div>
              </Link>
            </div>
            <GlassButton
              variant="ghost"
              className="mt-4 w-full justify-center bg-slate-50 text-sky-700 hover:bg-slate-100"
              onClick={() => downloadText("provider-rate-cards.txt", "Provider Rate Cards")}
            >
              Download Rate Cards
            </GlassButton>
          </GlassCard>

          <GlassCard className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <ShieldCheck className="h-5 w-5 text-sky-600" />
                  Compliance Readiness
                </h2>
              </div>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                  complianceSummary.isCompliant
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {complianceSummary.isCompliant ? "Ready" : "Action needed"}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Clinic License</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {complianceSummary.clinicExpiry
                        ? `Expiry ${formatCompactDate(complianceSummary.clinicExpiry)}`
                        : "Expiry date not recorded"}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClasses(complianceSummary.clinicState)}`}>
                    {complianceSummary.clinicState}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Doctor APCs</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{complianceSummary.doctorCount}</p>
                  <p className="mt-1 text-sm text-slate-500">Documents on file</p>
                </div>
                <div className="rounded-2xl border border-white bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Approved APCs</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{complianceSummary.approvedDoctorCount}</p>
                  <p className="mt-1 text-sm text-slate-500">Ready for active use</p>
                </div>
              </div>
              <Link href="/provider/compliance" className="block">
                <GlassButton variant="secondary" className="w-full justify-center">
                  Open Compliance Center
                </GlassButton>
              </Link>
            </div>
          </GlassCard>

          <GlassCard className="border-emerald-100 bg-emerald-50/70 p-5 shadow-lg shadow-emerald-100/40">
            <h2 className="flex items-center gap-2 text-lg font-bold text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              Submission Pulse
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-800">
              {analytics.latestActionRequired
                ? `${analytics.latestActionRequired.claimNumber} currently needs more information before it can proceed.`
                : ""}
            </p>
            <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Action Required Count</p>
              <p className="mt-2 text-2xl font-bold text-emerald-950">{analytics.actionRequiredClaims}</p>
            </div>
          </GlassCard>

          {!complianceSummary.isCompliant && (
            <GlassCard className="border-amber-100 bg-amber-50/75 p-5 shadow-lg shadow-amber-100/40">
              <div className="flex items-start gap-3">
                <TriangleAlert className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">Compliance follow-up required</p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-800">
                    Some provider documents are still missing, submitted, or expired. Update them to keep invoice submission aligned with current compliance records.
                  </p>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
