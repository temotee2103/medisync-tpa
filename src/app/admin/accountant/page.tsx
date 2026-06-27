"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassField } from "@/components/ui/GlassField";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { canOperateAccountantPage } from "@/lib/adminPermissions";
import { type AdminSession, fetchAdminSession } from "@/lib/adminSession";
import { readFileAsDataUrl } from "@/lib/fileData";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import {
  completeMemberClaimPayment,
  ensureMemberClaimsStore,
  getMemberClaimsServerSnapshot,
  getMemberClaimsSnapshot,
  refreshMemberClaimsSnapshot,
  subscribeMemberClaims,
} from "@/lib/claimsStore";
import {
  completeProviderClaimPayment,
  ensureProviderClaimsStore,
  getProviderClaimsServerSnapshot,
  getProviderClaimsSnapshot,
  refreshProviderClaimsSnapshot,
  subscribeProviderClaims,
} from "@/lib/providerClaimsStore";
import { buildAccountantQueue, type AccountantQueueItem } from "@/lib/accountantQueue";
import {
  Building2,
  CreditCard,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { showToast } from "@/components/ui/Toast";

type AccountantTab = "member" | "vendor";
type PayoutFilter = "all" | "complete" | "missing";

const getPayoutBadgeScheme = (status: AccountantQueueItem["payoutStatus"]): "success" | "warning" =>
  status === "complete" ? "success" : "warning";

const getScopeIcon = (scope: AccountantTab) => (scope === "member" ? Users : Building2);

const getPaymentProofLabel = (scope: AccountantQueueItem["scope"]) =>
  scope === "member" ? "Payment Proof / Bank-In Slip" : "Payment Proof / Approval Attachment";

export default function AccountantWorkspacePage() {
  const memberClaimsSnapshot = useSyncExternalStore(
    subscribeMemberClaims,
    getMemberClaimsSnapshot,
    getMemberClaimsServerSnapshot
  );
  const providerClaimsSnapshot = useSyncExternalStore(
    subscribeProviderClaims,
    getProviderClaimsSnapshot,
    getProviderClaimsServerSnapshot
  );

  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [queueItems, setQueueItems] = useState<AccountantQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AccountantTab>("member");
  const [searchTerm, setSearchTerm] = useState("");
  const [payoutFilter, setPayoutFilter] = useState<PayoutFilter>("all");
  const [completionTarget, setCompletionTarget] = useState<AccountantQueueItem | null>(null);
  const [completionFile, setCompletionFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [completionError, setCompletionError] = useState("");
  const [submittingId, setSubmittingId] = useState("");

  useEffect(() => {
    ensureMemberClaimsStore();
    ensureProviderClaimsStore();
    void refreshMemberClaimsSnapshot();
    void refreshProviderClaimsSnapshot();
    void fetchAdminSession().then((session) => setAdminSession(session));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setIsLoading(true);
        const items = await buildAccountantQueue();
        if (!cancelled) setQueueItems(items);
      } catch (buildError) {
        if (!cancelled) {
          setQueueItems([]);
          showToast(buildError instanceof Error ? buildError.message : "Unable to load accountant queue.", "error");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [memberClaimsSnapshot, providerClaimsSnapshot]);

  const stats = useMemo(
    () => ({
      member: {
        total: queueItems.filter((item) => item.scope === "member").length,
        missing: queueItems.filter((item) => item.scope === "member" && item.payoutStatus === "missing").length,
        ready: queueItems.filter((item) => item.scope === "member" && item.payoutStatus === "complete").length,
      },
      vendor: {
        total: queueItems.filter((item) => item.scope === "vendor").length,
        missing: queueItems.filter((item) => item.scope === "vendor" && item.payoutStatus === "missing").length,
        ready: queueItems.filter((item) => item.scope === "vendor" && item.payoutStatus === "complete").length,
      },
    }),
    [queueItems]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return queueItems.filter((item) => {
      const matchesTab = item.scope === activeTab;
      const matchesSearch =
        !normalizedSearch ||
        item.claimNumber.toLowerCase().includes(normalizedSearch) ||
        item.subjectName.toLowerCase().includes(normalizedSearch) ||
        item.providerLabel.toLowerCase().includes(normalizedSearch) ||
        item.payoutSummary.toLowerCase().includes(normalizedSearch);
      const matchesPayoutFilter = payoutFilter === "all" || item.payoutStatus === payoutFilter;
      return matchesTab && matchesSearch && matchesPayoutFilter;
    });
  }, [activeTab, payoutFilter, queueItems, searchTerm]);

  const canOperate = adminSession ? canOperateAccountantPage(adminSession.role) : false;

  const activeDescription =
    activeTab === "member"
      ? "Finalize member reimbursement claims that already passed admin review and reached `in_process`."
      : "Finalize vendor claims from `provider_claims` that already passed admin review and reached `in_process`.";

  const activeEmptyMessage =
    activeTab === "member"
      ? "No member claims in the accountant queue match the selected filters."
      : "No vendor claims in the accountant queue match the selected filters.";

  const openCompletionModal = (item: AccountantQueueItem) => {
    if (!canOperate) return;
    if (item.payoutStatus === "missing") return;
    setCompletionTarget(item);
    setCompletionFile(null);
    setCompletionError("");
  };

  const closeCompletionModal = () => {
    setCompletionTarget(null);
    setCompletionFile(null);
    setCompletionError("");
  };

  const handleCompletionFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canOperate) {
      setCompletionFile(null);
      setCompletionError("Admin role is read-only on Accountant Workspace.");
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      setCompletionFile(null);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCompletionFile({ name: file.name, dataUrl });
      setCompletionError("");
    } catch (selectionError) {
      setCompletionFile(null);
      setCompletionError(
        selectionError instanceof Error ? selectionError.message : "Unable to upload the payment proof."
      );
    } finally {
      event.target.value = "";
    }
  };

  const submitCompletion = () => {
    if (!completionTarget) return;
    if (!canOperate) {
      setCompletionError("Admin role is read-only on Accountant Workspace.");
      return;
    }
    if (completionTarget.payoutStatus === "missing") {
      setCompletionError("Payout-information is missing for this record.");
      return;
    }
    if (!completionFile) {
      setCompletionError("Upload the payment proof before marking this record approved.");
      return;
    }
    if (!adminSession?.profileId) {
      setCompletionError("Unable to identify the current accountant session.");
      return;
    }

    void (async () => {
      try {
        setCompletionError("");
        setSubmittingId(completionTarget.id);
        const approvedAt = new Date().toISOString();
        if (completionTarget.scope === "member") {
          await completeMemberClaimPayment(completionTarget.id, {
            bankSlipFileName: completionFile.name,
            bankSlipDataUrl: completionFile.dataUrl,
            bankSlipUploadedAt: approvedAt,
            actorId: adminSession.profileId,
            actorName: adminSession.fullName,
          });
        } else {
          await completeProviderClaimPayment(completionTarget.id, {
            approval_attachment_name: completionFile.name,
            approval_attachment_path: completionFile.dataUrl,
            approved_at: approvedAt,
            reviewed_by_profile_id: adminSession.profileId,
          });
        }
        closeCompletionModal();
      } catch (submitError) {
        setCompletionError(
          submitError instanceof Error ? submitError.message : "Unable to complete payment for this claim."
        );
      } finally {
        setSubmittingId("");
      }
    })();
  };

  const renderTable = (items: AccountantQueueItem[]) => (
    <GlassCard className="overflow-hidden p-0 border-white/40">
      <div className="px-6 py-4 border-b border-white/60 bg-white/40 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {activeTab === "member" ? "Member Queue" : "Vendor Queue"}
          </h2>
          <p className="text-sm text-slate-500">{activeDescription}</p>
        </div>
        <span className="text-sm font-medium text-slate-500">{items.length} result(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/40 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Claim No.</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Provider</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Payout</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Latest Note</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Activity</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={`${item.scope}-${item.id}`} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-6 py-4">
                  <Link
                    href={item.claimHref}
                    className="font-mono text-sm font-semibold text-slate-700 hover:text-sky-700 transition-colors"
                  >
                    {item.claimNumber}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-800">{item.subjectName}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{item.providerLabel}</td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right">
                  {formatCurrency(item.amount)}
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <StatusBadge
                      status={item.payoutStatus === "complete" ? "Complete" : "Missing"}
                      scheme={getPayoutBadgeScheme(item.payoutStatus)}
                    />
                    <p className="text-xs text-slate-500">{item.payoutSummary}</p>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{item.adminNote || "No admin note"}</td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {formatDateDisplay(item.submittedAt || "") || item.submittedAt || "Not captured"}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={item.claimHref}>
                      <GlassButton variant="secondary" size="sm">
                        Open Claim
                      </GlassButton>
                    </Link>
                    <GlassButton
                      variant={item.payoutStatus === "complete" ? "primary" : "ghost"}
                      size="sm"
                      disabled={!canOperate || item.payoutStatus === "missing" || submittingId === item.id}
                      onClick={() => openCompletionModal(item)}
                    >
                      {!canOperate
                        ? "Read Only"
                        : item.payoutStatus === "missing"
                          ? "Payout Missing"
                          : "Mark Approved"}
                    </GlassButton>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-400">
                  {activeEmptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );

  const renderCards = (items: AccountantQueueItem[]) => (
    <div className="space-y-3">
      {items.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-slate-400">{activeEmptyMessage}</GlassCard>
      ) : (
        items.map((item) => (
          <MobileRecordCard
            key={`${item.scope}-${item.id}`}
            title={
              <Link href={item.claimHref} className="font-mono text-slate-800 hover:text-sky-700 transition-colors">
                {item.claimNumber}
              </Link>
            }
            subtitle={item.providerLabel}
            badge={
              <StatusBadge
                status={item.payoutStatus === "complete" ? "Payout Complete" : "Payout Missing"}
                scheme={getPayoutBadgeScheme(item.payoutStatus)}
              />
            }
            meta={
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1">
                  <CreditCard className="h-3 w-3" />
                  {item.payoutSummary}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 font-semibold text-slate-700">
                  {formatCurrency(item.amount)}
                </span>
              </>
            }
            footer={
              <div className="flex flex-wrap justify-end gap-2">
                <Link href={item.claimHref}>
                  <GlassButton variant="secondary" size="sm">
                    Open Claim
                  </GlassButton>
                </Link>
                <GlassButton
                  size="sm"
                  disabled={!canOperate || item.payoutStatus === "missing" || submittingId === item.id}
                  onClick={() => openCompletionModal(item)}
                >
                  {!canOperate
                    ? "Read Only"
                    : item.payoutStatus === "missing"
                      ? "Payout Missing"
                      : "Mark Approved"}
                </GlassButton>
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subject</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{item.subjectName}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Latest Note</p>
                <p className="mt-1 text-sm text-slate-700">{item.adminNote || "No admin note"}</p>
              </div>
            </div>
          </MobileRecordCard>
        ))
      )}
    </div>
  );

  const resetFilters = () => {
    setSearchTerm("");
    setPayoutFilter("all");
  };

  const MemberIcon = getScopeIcon("member");
  const VendorIcon = getScopeIcon("vendor");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Accountant Workspace</h1>
          <p className="text-sm text-slate-500">
            Complete payouts for claims that are ready. Claims without payout details stay in the queue until payout information is provided.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <button type="button" className="text-left" onClick={() => setActiveTab("member")}>
          <GlassCard
            className={`p-4 transition-all ${
              activeTab === "member"
                ? "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 ring-2 ring-sky-100"
                : "border-slate-100 bg-white/80 hover:border-sky-100"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-600">Member Queue</p>
                <h2 className="text-xl font-bold text-slate-800">Member reimbursement completion</h2>
                <p className="text-sm text-slate-500">Review payout readiness and finalize member reimbursements.</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-3 shadow-sm border border-sky-100">
                <MemberIcon className="h-5 w-5 text-sky-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 border border-sky-100">
                {stats.member.total} queued
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                {stats.member.ready} ready
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                {stats.member.missing} missing payout
              </span>
            </div>
          </GlassCard>
        </button>

        <button type="button" className="text-left" onClick={() => setActiveTab("vendor")}>
          <GlassCard
            className={`p-4 transition-all ${
              activeTab === "vendor"
                ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 ring-2 ring-emerald-100"
                : "border-slate-100 bg-white/80 hover:border-emerald-100"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">Vendor Queue</p>
                <h2 className="text-xl font-bold text-slate-800">Vendor claim completion</h2>
                <p className="text-sm text-slate-500">Finalize provider claims from the `provider_claims` source.</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-3 shadow-sm border border-emerald-100">
                <VendorIcon className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 border border-emerald-100">
                {stats.vendor.total} queued
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                {stats.vendor.ready} ready
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                {stats.vendor.missing} missing payout
              </span>
            </div>
          </GlassCard>
        </button>
      </div>

      <GlassCard className="hidden lg:block p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <SlidersHorizontal className="w-4 h-4 text-sky-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Filter {activeTab === "member" ? "Member Queue" : "Vendor Queue"}
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_1fr_auto] gap-4">
          <GlassField label="Search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <GlassInput
                placeholder="Search by claim no., subject, provider, or payout summary"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </GlassField>
          <GlassField label="Payout Status">
            <GlassSelect
              value={payoutFilter}
              options={[
                { label: "All", value: "all" },
                { label: "Complete", value: "complete" },
                { label: "Missing", value: "missing" },
              ]}
              onChange={(value) => setPayoutFilter(value as PayoutFilter)}
              placeholder="Payout Status"
            />
          </GlassField>
          <div className="flex items-end">
            <GlassButton variant="secondary" className="w-full lg:w-auto gap-2" onClick={resetFilters}>
              <RotateCcw className="w-4 h-4" />
              Reset
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="lg:hidden p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
          <GlassInput
            placeholder="Search accountant queue"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 pt-1">
          <GlassSelect
            value={payoutFilter}
            options={[
              { label: "All payout status", value: "all" },
              { label: "Payout complete", value: "complete" },
              { label: "Payout missing", value: "missing" },
            ]}
            onChange={(value) => setPayoutFilter(value as PayoutFilter)}
            placeholder="Payout Status"
          />
          <GlassButton variant="secondary" className="w-full gap-2" onClick={resetFilters}>
            <RotateCcw className="w-4 h-4" />
            Reset Filters
          </GlassButton>
        </div>
        <p className="text-xs text-slate-500">{filteredItems.length} result(s)</p>
      </GlassCard>

      {isLoading ? (
        <GlassCard className="p-6 text-sm text-slate-500">Loading accountant queue...</GlassCard>
      ) : (
        <ResponsiveDataView desktop={renderTable(filteredItems)} mobile={renderCards(filteredItems)} />
      )}

      {completionTarget ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeCompletionModal} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">
                Mark {completionTarget.scope === "member" ? "Member" : "Vendor"} Claim Approved
              </h3>
              <p className="text-sm text-slate-500">
                Upload the final payment proof before completing this `in_process` record.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Claim No.</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{completionTarget.claimNumber}</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payout Profile</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{completionTarget.payoutSummary}</p>
                </div>
              </div>
              <GlassField label={getPaymentProofLabel(completionTarget.scope)}>
                <GlassInput
                  type="file"
                  accept=".pdf,image/*"
                  className="h-12 bg-white text-sm text-slate-600 file:mr-3 file:h-8 file:rounded-md file:border file:border-slate-200 file:bg-slate-100 file:px-3 file:py-1 file:text-[10px] file:font-semibold file:uppercase file:tracking-wide file:text-slate-600 hover:file:bg-slate-200/80"
                  disabled={!canOperate || submittingId === completionTarget.id}
                  onChange={handleCompletionFileSelection}
                />
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {completionFile?.name || "Upload a payment proof file to complete the final approval."}
                </div>
              </GlassField>
              {completionError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {completionError}
                </p>
              ) : null}
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={closeCompletionModal}>
                Cancel
              </GlassButton>
              <GlassButton
                disabled={!canOperate || !completionFile || submittingId === completionTarget.id}
                onClick={submitCompletion}
              >
                Confirm Approved
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
