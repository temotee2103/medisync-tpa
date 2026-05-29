"use client";

import Link from "next/link";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { ChevronDown, ChevronUp, CreditCard, ExternalLink, Landmark, ReceiptText, Search, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ensureProviderSeed,
  getProviderById,
  getProviderSession,
  normalizeProviderUserRole,
  type ProviderSession,
} from "@/lib/providerSession";
import {
  ensureProviderClaimsStore,
  getProviderClaimsServerSnapshot,
  getProviderClaimsSnapshot,
  refreshProviderClaimsSnapshot,
  subscribeProviderClaims,
} from "@/lib/providerClaimsStore";

type ProviderLifecycleStatus =
  | "submitted"
  | "request_additional_information"
  | "rejected"
  | "in_process"
  | "approved";

const PROVIDER_LIFECYCLE_STATUSES: ProviderLifecycleStatus[] = [
  "submitted",
  "request_additional_information",
  "rejected",
  "in_process",
  "approved",
];

const getDateValue = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeProviderSubmissionStatus = (status?: string) => String(status || "").trim().toLowerCase();

const formatProviderSubmissionStatus = (status?: string) => {
  switch (normalizeProviderSubmissionStatus(status)) {
    case "request_additional_information":
      return "Request Additional Information";
    case "submitted":
      return "Submitted";
    case "rejected":
      return "Rejected";
    case "in_process":
      return "In Process";
    case "approved":
      return "Approved";
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
    case "request_additional_information":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "in_process":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "submitted":
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
};

const getClaimTimelineDate = (claim: {
  approvedAt?: string;
  reviewedAt?: string;
  submittedAt?: string;
  createdAt?: string;
  treatmentDate?: string;
}) => claim.approvedAt || claim.reviewedAt || claim.submittedAt || claim.createdAt || claim.treatmentDate || "";

type CurrentProviderUserRow = {
  id?: string | null;
  role?: string | null;
  providers?: {
    id?: string | null;
    vendor_id?: string | null;
    provider_name?: string | null;
  } | null;
};

const getClaimYear = (claim: {
  approvedAt?: string;
  reviewedAt?: string;
  submittedAt?: string;
  createdAt?: string;
  treatmentDate?: string;
}) => getClaimTimelineDate(claim).slice(0, 4);

const formatStatusDetail = (claim: {
  status?: string;
  submittedAt?: string;
  reviewedAt?: string;
  approvedAt?: string;
  createdAt?: string;
  treatmentDate?: string;
  reviewNote?: string;
  approvalAttachmentName?: string;
}) => {
  const normalizedStatus = normalizeProviderSubmissionStatus(claim.status);

  switch (normalizedStatus) {
    case "request_additional_information":
      return claim.reviewNote
        ? `Admin requested more information on ${formatDateDisplay(claim.reviewedAt || claim.submittedAt || "")}. ${claim.reviewNote}`
        : `Admin requested more information on ${formatDateDisplay(claim.reviewedAt || claim.submittedAt || "")}. Update the submission to continue the lifecycle.`;
    case "rejected":
      return claim.reviewNote
        ? `Rejected on ${formatDateDisplay(claim.reviewedAt || claim.submittedAt || "")}. ${claim.reviewNote}`
        : `Rejected on ${formatDateDisplay(claim.reviewedAt || claim.submittedAt || "")}. Review the admin note for the reason.`;
    case "in_process":
      return `Reviewed on ${formatDateDisplay(claim.reviewedAt || claim.submittedAt || "")}. The claim passed review and is waiting for finance/payment completion.`;
    case "approved":
      return claim.approvalAttachmentName
        ? `Completed on ${formatDateDisplay(claim.approvedAt || claim.reviewedAt || claim.submittedAt || "")}. Payment has been finalized and an approval attachment is available.`
        : `Completed on ${formatDateDisplay(claim.approvedAt || claim.reviewedAt || claim.submittedAt || "")}. Payment has been finalized.`;
    case "submitted":
    default:
      return `Submitted on ${formatDateDisplay(claim.submittedAt || claim.createdAt || claim.treatmentDate || "")}. Awaiting admin review before payment processing can begin.`;
  }
};

const openApprovalAttachment = (attachmentPath: string) => {
  if (typeof window === "undefined") return;
  window.open(attachmentPath, "_blank", "noopener,noreferrer");
};

const canDownloadPvForClaim = (status?: string, approvalAttachmentPath?: string) =>
  normalizeProviderSubmissionStatus(status) === "approved" && Boolean(approvalAttachmentPath);

const isApprovedWithoutPv = (status?: string, approvalAttachmentPath?: string) =>
  normalizeProviderSubmissionStatus(status) === "approved" && !approvalAttachmentPath;

export default function PaymentHistoryPage() {
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterYear, setFilterYear] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [resolvedProviderSession, setResolvedProviderSession] = useState<ProviderSession | null>(null);
  const [resolvedProviderUuid, setResolvedProviderUuid] = useState("");

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (isHydrated) {
    ensureProviderSeed();
    ensureProviderClaimsStore();
  }

  useEffect(() => {
    if (!isHydrated) return;
    ensureProviderSeed();
    let cancelled = false;

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const profileId = data.session?.user.id;

      if (!profileId) {
        if (!cancelled) {
          setResolvedProviderSession(null);
          setResolvedProviderUuid("");
        }
        return;
      }

      const { data: providerUserRow, error } = await supabase
        .from("provider_users")
        .select("id, role, providers(id, vendor_id, provider_name)")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error || !providerUserRow) {
        if (!cancelled) {
          setResolvedProviderSession(null);
          setResolvedProviderUuid("");
        }
        return;
      }

      const row = providerUserRow as unknown as CurrentProviderUserRow;
      const vendorId = String(row.providers?.vendor_id || "");
      const providerName = String(row.providers?.provider_name || "");
      const providerUuid = String(row.providers?.id || "");
      const providerUserRole = normalizeProviderUserRole(row.role || "") || "provider_admin";

      if (!cancelled) {
        setResolvedProviderSession({
          vendorId,
          providerUuid,
          providerName,
          providerUserId: String(row.id || ""),
          providerUserRole,
        });
        setResolvedProviderUuid(providerUuid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isHydrated]);

  const providerSession = isHydrated ? (resolvedProviderSession || getProviderSession()) : null;
  const provider = providerSession?.vendorId ? getProviderById(providerSession.vendorId) : null;
  const providerName = provider?.providerName || providerSession?.providerName || "Provider";
  const providerScopeUuid = providerSession?.providerUuid || resolvedProviderUuid || "";
  const providerClaimsSnapshot = useSyncExternalStore(
    subscribeProviderClaims,
    getProviderClaimsSnapshot,
    getProviderClaimsServerSnapshot
  );

  useEffect(() => {
    if (!isHydrated || !providerScopeUuid) return;
    void refreshProviderClaimsSnapshot();
  }, [isHydrated, providerScopeUuid]);

  const paymentHistoryClaims = useMemo(
    () =>
      providerClaimsSnapshot
        .filter(
          (claim) =>
            claim.providerId === providerScopeUuid &&
            PROVIDER_LIFECYCLE_STATUSES.includes(
              normalizeProviderSubmissionStatus(claim.status) as ProviderLifecycleStatus
            )
        )
        .sort((left, right) => getDateValue(getClaimTimelineDate(right)) - getDateValue(getClaimTimelineDate(left))),
    [providerClaimsSnapshot, providerScopeUuid]
  );

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(paymentHistoryClaims.map((claim) => getClaimYear(claim)).filter(Boolean)));
    return years.sort((left, right) => right.localeCompare(left));
  }, [paymentHistoryClaims]);

  const filteredClaims = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return paymentHistoryClaims.filter((claim) => {
      const normalizedStatus = normalizeProviderSubmissionStatus(claim.status);
      const matchesYear = filterYear === "All" || getClaimYear(claim) === filterYear;
      const matchesStatus = filterStatus === "All" || normalizedStatus === filterStatus;

      if (!matchesYear || !matchesStatus) return false;
      if (!normalizedSearch) return true;

      return [
        claim.claimNumber,
        claim.invoiceNumber,
        claim.patientName,
        claim.patientStaffId,
        claim.serviceType,
        claim.diagnosisSummary,
        claim.reviewNote,
        formatProviderSubmissionStatus(claim.status),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [filterStatus, filterYear, paymentHistoryClaims, searchTerm]);

  const summary = useMemo(() => {
    const totalAmount = paymentHistoryClaims.reduce((sum, claim) => sum + claim.totalAmount, 0);
    const statusCounts = paymentHistoryClaims.reduce<Record<string, number>>((counts, claim) => {
      const normalizedStatus = normalizeProviderSubmissionStatus(claim.status);
      counts[normalizedStatus] = (counts[normalizedStatus] || 0) + 1;
      return counts;
    }, {});

    return {
      totalAmount,
      totalClaims: paymentHistoryClaims.length,
      actionRequiredCount: statusCounts.request_additional_information || 0,
      inProcessCount: statusCounts.in_process || 0,
      approvedCount: statusCounts.approved || 0,
      latestActivity: paymentHistoryClaims[0] || null,
    };
  }, [paymentHistoryClaims]);

  const toggleExpand = (claimId: string) => {
    setExpandedClaimId((current) => (current === claimId ? null : claimId));
  };

  return (
    <div className="space-y-6">
      <GlassCard className="overflow-hidden border-sky-100 bg-white/78 p-0 shadow-xl shadow-sky-100/40">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.14),transparent_24%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                <Landmark className="h-3.5 w-3.5" />
                Payment History
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Provider invoice lifecycle for {providerName}</h1>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Latest Activity</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {summary.latestActivity ? formatCurrency(summary.latestActivity.totalAmount) : formatCurrency(0)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {summary.latestActivity
                    ? `${formatProviderSubmissionStatus(summary.latestActivity.status)} on ${formatDateDisplay(getClaimTimelineDate(summary.latestActivity))}`
                    : "No provider invoices found yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Tracked Amount</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.totalAmount)}</p>
                <p className="mt-1 text-sm text-slate-600">Across all unified lifecycle records</p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="flex items-center gap-4 border-sky-100 bg-sky-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-sky-800">All Invoices</p>
            <p className="text-2xl font-bold text-sky-700">{summary.totalClaims}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-4 border-amber-100 bg-amber-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <TimerReset className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">Action Required</p>
            <p className="text-2xl font-bold text-amber-700">{summary.actionRequiredCount}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-4 border-violet-100 bg-violet-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-violet-800">In Process</p>
            <p className="text-2xl font-bold text-violet-700">{summary.inProcessCount}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-4 border-emerald-100 bg-emerald-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">Approved</p>
            <p className="text-2xl font-bold text-emerald-700">{summary.approvedCount}</p>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Unified Payment History</h2>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <div className="relative min-w-[280px]">
              <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search invoice, claim, patient, service, note..."
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-2 pl-9 pr-4 text-sm text-slate-700 outline-none ring-0 placeholder:text-slate-400"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <select
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none"
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
            >
              <option value="All">All Statuses</option>
              {PROVIDER_LIFECYCLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatProviderSubmissionStatus(status)}
                </option>
              ))}
            </select>
            <select
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none"
              value={filterYear}
              onChange={(event) => setFilterYear(event.target.value)}
            >
              <option value="All">All Years</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ResponsiveDataView
          desktop={
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/80 bg-white/65">
              <div className="divide-y divide-slate-100">
                {filteredClaims.length ? (
                  filteredClaims.map((claim) => {
                    const normalizedStatus = normalizeProviderSubmissionStatus(claim.status);
                    const canDownloadPv = canDownloadPvForClaim(claim.status, claim.approvalAttachmentPath);
                    const missingPv = isApprovedWithoutPv(claim.status, claim.approvalAttachmentPath);
                    const isExpanded = expandedClaimId === claim.id;
                    return (
                      <div key={claim.id}>
                        <div
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors",
                            isExpanded ? "bg-sky-50/70" : "hover:bg-slate-50/80"
                          )}
                          onClick={() => toggleExpand(claim.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="font-semibold text-slate-900">{claim.claimNumber || claim.invoiceNumber || claim.id}</p>
                              <span
                                className={cn(
                                  "rounded-full border px-3 py-1 text-xs font-semibold",
                                  getProviderSubmissionStatusClasses(claim.status)
                                )}
                              >
                                {formatProviderSubmissionStatus(claim.status)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {claim.patientName || "Unknown patient"} | {claim.serviceType || "General Medical"} |
                              Invoice {claim.invoiceNumber || "Pending"}
                            </p>
                            <p className="mt-2 text-sm text-slate-600">{formatStatusDetail(claim)}</p>
                          </div>

                          <div className="flex items-center gap-5">
                            <div className="text-right">
                              <p className="font-semibold text-slate-900">{formatCurrency(claim.totalAmount)}</p>
                              <p className="text-xs text-slate-500">Treatment {formatDateDisplay(claim.treatmentDate)}</p>
                            </div>
                            <div className="text-slate-400">
                              {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Claim Number</p>
                                  <p className="mt-1 text-sm font-medium text-slate-800">{claim.claimNumber || claim.id}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Number</p>
                                  <p className="mt-1 text-sm font-medium text-slate-800">{claim.invoiceNumber || "Not submitted"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Treatment Date</p>
                                  <p className="mt-1 text-sm font-medium text-slate-800">{formatDateDisplay(claim.treatmentDate)}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                                  <p className="mt-1 text-sm font-medium text-slate-800">
                                    {claim.submittedAt ? formatDateDisplay(claim.submittedAt) : "Not recorded"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reviewed</p>
                                  <p className="mt-1 text-sm font-medium text-slate-800">
                                    {claim.reviewedAt ? formatDateDisplay(claim.reviewedAt) : "Pending review"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Completed</p>
                                  <p className="mt-1 text-sm font-medium text-slate-800">
                                    {claim.approvedAt ? formatDateDisplay(claim.approvedAt) : "Not completed"}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white/75 p-3 md:col-span-2 xl:col-span-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status Detail</p>
                                  <p className="mt-1 text-sm text-slate-700">{formatStatusDetail(claim)}</p>
                                  {claim.reviewNote && normalizedStatus !== "submitted" && normalizedStatus !== "in_process" ? (
                                    <p className="mt-2 text-xs text-slate-500">Admin note: {claim.reviewNote}</p>
                                  ) : null}
                                  {normalizedStatus === "in_process" && claim.reviewNote ? (
                                    <p className="mt-2 text-xs text-slate-500">Admin note: {claim.reviewNote}</p>
                                  ) : null}
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 lg:min-w-[220px]">
                                {normalizedStatus === "request_additional_information" ? (
                                  <Link href={`/provider/invoices?editProviderClaimId=${claim.id}`}>
                                    <GlassButton variant="secondary" className="h-9 w-full px-4 text-sm">
                                      Update Submission
                                    </GlassButton>
                                  </Link>
                                ) : null}
                                {canDownloadPv ? (
                                  <GlassButton
                                    variant="secondary"
                                    className="h-9 w-full gap-2 px-4 text-sm"
                                    onClick={() => openApprovalAttachment(claim.approvalAttachmentPath!)}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Download PV
                                  </GlassButton>
                                ) : null}
                                {missingPv ? (
                                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    PV not uploaded for this approved record.
                                  </div>
                                ) : null}
                                <div className="rounded-xl border border-white/80 bg-white/70 p-3">
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lifecycle State</p>
                                  <p className="mt-1 text-sm font-semibold text-slate-800">
                                    {formatProviderSubmissionStatus(claim.status)}
                                  </p>
                                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                    {normalizedStatus === "approved"
                                      ? "This record represents completed payment in the unified history."
                                      : normalizedStatus === "in_process"
                                        ? "Finance or payment handling is still underway."
                                        : normalizedStatus === "request_additional_information"
                                          ? "Provider action is needed before the claim can continue."
                                          : normalizedStatus === "rejected"
                                            ? "The lifecycle has ended without payment completion."
                                            : "The invoice is still waiting for admin review."}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-5 py-10 text-center text-sm text-slate-500">
                    No provider invoices match the current search or filter.
                  </div>
                )}
              </div>
            </div>
          }
          mobile={
            <div className="mt-5 space-y-3">
              {filteredClaims.length ? (
                filteredClaims.map((claim) => {
                  const normalizedStatus = normalizeProviderSubmissionStatus(claim.status);
                  const canDownloadPv = canDownloadPvForClaim(claim.status, claim.approvalAttachmentPath);
                  const missingPv = isApprovedWithoutPv(claim.status, claim.approvalAttachmentPath);
                  const isExpanded = expandedClaimId === claim.id;
                  return (
                    <MobileRecordCard
                      key={claim.id}
                      title={claim.claimNumber || claim.invoiceNumber || claim.id}
                      subtitle={`${claim.patientName || "Unknown patient"} | ${formatDateDisplay(claim.treatmentDate)}`}
                      badge={
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            getProviderSubmissionStatusClasses(claim.status)
                          )}
                        >
                          {formatProviderSubmissionStatus(claim.status)}
                        </span>
                      }
                      footer={
                        <div className="flex items-center justify-between gap-3">
                          <GlassButton variant="ghost" className="h-8 px-3 text-sky-600" onClick={() => toggleExpand(claim.id)}>
                            {isExpanded ? "Hide Details" : "View Details"}
                          </GlassButton>
                          <span className="text-sm font-bold text-slate-800">{formatCurrency(claim.totalAmount)}</span>
                        </div>
                      }
                    >
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status Detail</p>
                        <p className="mt-1 text-sm text-slate-700">{formatStatusDetail(claim)}</p>
                      </div>

                      {isExpanded ? (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Number</p>
                            <p className="mt-1 text-sm text-slate-700">{claim.invoiceNumber || "Not submitted"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {claim.submittedAt ? formatDateDisplay(claim.submittedAt) : "Not recorded"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reviewed</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {claim.reviewedAt ? formatDateDisplay(claim.reviewedAt) : "Pending review"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Completed</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {claim.approvedAt ? formatDateDisplay(claim.approvedAt) : "Not completed"}
                            </p>
                          </div>
                          {claim.reviewNote ? (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Admin Note</p>
                              <p className="mt-1 text-sm text-slate-700">{claim.reviewNote}</p>
                            </div>
                          ) : null}
                          {normalizedStatus === "request_additional_information" ? (
                            <Link href={`/provider/invoices?editProviderClaimId=${claim.id}`}>
                              <GlassButton variant="secondary" className="h-9 w-full px-4 text-sm">
                                Update Submission
                              </GlassButton>
                            </Link>
                          ) : null}
                          {canDownloadPv ? (
                            <GlassButton
                              variant="secondary"
                              className="h-9 w-full gap-2 px-4 text-sm"
                              onClick={() => openApprovalAttachment(claim.approvalAttachmentPath!)}
                            >
                              <ExternalLink className="h-4 w-4" />
                              Download PV
                            </GlassButton>
                          ) : null}
                          {missingPv ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              PV not uploaded for this approved record.
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Service Type</p>
                            <p className="mt-1 text-sm text-slate-700">{claim.serviceType || "General Medical"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lifecycle State</p>
                            <p className="mt-1 text-sm text-slate-700">{formatProviderSubmissionStatus(claim.status)}</p>
                          </div>
                        </>
                      )}
                    </MobileRecordCard>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                  No provider invoices match the current search or filter.
                </div>
              )}
            </div>
          }
        />
      </GlassCard>
    </div>
  );
}
