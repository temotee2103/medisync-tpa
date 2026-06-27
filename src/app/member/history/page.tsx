"use client";

import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { MobileDetailModal } from "@/components/ui/MobileDetailModal";
import { 
  FileText, 
  Search, 
  ChevronRight,
  Calendar,
  DollarSign,
  Download,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { downloadDataUrlFile, openDataUrlInNewTab } from "@/lib/fileData";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import {
  ensureMemberSeed,
  getMemberDirectoryServerSnapshot,
  getMemberDirectorySnapshot,
  getMemberSeedLoading,
  getMemberSession,
  subscribeMemberDirectory,
  subscribeMemberSession,
} from "@/lib/memberSession";
import { ensureCompaniesStore, getCompaniesServerSnapshot, getCompaniesSnapshot, subscribeCompanies } from "@/lib/companyStore";
import {
  getAdminClaimsServerSnapshot,
  getAdminClaimsSnapshot,
  getMemberClaimsServerSnapshot,
  getMemberClaimsSnapshot,
  refreshClaimsSnapshot,
  subscribeAdminClaims,
  subscribeMemberClaims,
} from "@/lib/claimsStore";
import { getMemberLimitOwnerStaffId } from "@/lib/memberPlan";
import { ensureProviderSeed, getProviderById } from "@/lib/providerSession";
import {
  ensurePanelVisitTransactionsStore,
  getPanelVisitTransactionsServerSnapshot,
  getPanelVisitTransactionsSnapshot,
  subscribePanelVisitTransactions,
} from "@/lib/panelVisitStore";
import { formatUnifiedClaimStatus, normalizeUnifiedClaimStatus } from "@/lib/unifiedClaimLifecycle";

type ClaimHistoryRecord = {
  key: string;
  id: string;
  hospital: string;
  amount: string;
  lifecycleStatus: string;
  status: string;
  date: string;
  year: string;
  type: string;
  diagnosis: string;
  source: "member_reimbursement" | "provider_cashless" | "panel_visit";
  referenceId?: string;
  bankSlipFileName?: string;
  bankSlipDataUrl?: string;
  bankSlipUploadedAt?: string;
};

const parseDependentIdFromStaffId = (staffId: string) => {
  const parts = staffId.split("-DEP-");
  if (parts.length < 2) return "";
  return (parts[1] || "").trim();
};

export default function MemberHistoryPage() {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterYear, setFilterYear] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClaimKey, setSelectedClaimKey] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    ensureMemberSeed();
    ensureCompaniesStore();
    ensureProviderSeed();
    ensurePanelVisitTransactionsStore();
    void refreshClaimsSnapshot().catch((error) => {
      setHistoryError(error instanceof Error ? error.message : "Unable to load claim history.");
    });
  }, []);

  const memberSession = useSyncExternalStore(subscribeMemberSession, getMemberSession, () => null);
  const memberSeedLoading = useSyncExternalStore(
    subscribeMemberSession,
    getMemberSeedLoading,
    () => false
  );
  const memberDirectory = useSyncExternalStore(
    subscribeMemberDirectory,
    getMemberDirectorySnapshot,
    getMemberDirectoryServerSnapshot
  );

  const memberStaffId = memberSession?.staffId ?? "";
  const memberCompanyId = memberSession?.companyId ?? "";
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const memberHistoryScope = useMemo(() => {
    const memberEntry =
      memberCompanyId && memberStaffId
        ? memberDirectory.find((entry) => entry.companyId === memberCompanyId && entry.staffId === memberStaffId) || null
        : null;
    const company = memberCompanyId ? companies.find((c) => c.companyId === memberCompanyId) || null : null;
    return {
      companyId: memberCompanyId,
      staffId: memberStaffId,
      memberId: memberEntry?.memberUuid || memberSession?.memberId || "",
      dependentId: parseDependentIdFromStaffId(memberStaffId),
      memberKey: getMemberLimitOwnerStaffId(memberEntry, company) || memberStaffId,
    };
  }, [companies, memberCompanyId, memberDirectory, memberSession?.memberId, memberStaffId]);

  const allSubmittedClaims = useSyncExternalStore(
    subscribeMemberClaims,
    getMemberClaimsSnapshot,
    getMemberClaimsServerSnapshot
  );
  const allAdminClaims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsServerSnapshot
  );
  const panelVisitTransactions = useSyncExternalStore(
    subscribePanelVisitTransactions,
    getPanelVisitTransactionsSnapshot,
    getPanelVisitTransactionsServerSnapshot
  );

  const submittedClaims = useMemo(
    () =>
      allSubmittedClaims.filter((claim) => {
        if (memberHistoryScope.companyId && claim.companyId && claim.companyId !== memberHistoryScope.companyId) {
          return false;
        }
        if (memberHistoryScope.dependentId) {
          return claim.dependentId === memberHistoryScope.dependentId;
        }
        if (memberHistoryScope.memberId && claim.memberId === memberHistoryScope.memberId) {
          return true;
        }
        if (memberHistoryScope.staffId && claim.patientId === memberHistoryScope.staffId) {
          return true;
        }
        return Boolean(
          memberHistoryScope.memberKey &&
            memberHistoryScope.staffId &&
            claim.memberKey === memberHistoryScope.memberKey &&
            claim.patientId === memberHistoryScope.staffId
        );
      }),
    [allSubmittedClaims, memberHistoryScope]
  );
  const adminClaims = useMemo(
    () =>
      allAdminClaims.filter((claim) => {
        if (memberHistoryScope.companyId && claim.companyId && claim.companyId !== memberHistoryScope.companyId) {
          return false;
        }
        if (memberHistoryScope.dependentId) {
          return claim.dependentId === memberHistoryScope.dependentId;
        }
        if (memberHistoryScope.memberId && claim.memberId === memberHistoryScope.memberId) {
          return true;
        }
        if (memberHistoryScope.staffId && claim.patientId === memberHistoryScope.staffId) {
          return true;
        }
        return Boolean(
          memberHistoryScope.memberKey &&
            memberHistoryScope.staffId &&
            claim.memberKey === memberHistoryScope.memberKey &&
            claim.patientId === memberHistoryScope.staffId
        );
      }),
    [allAdminClaims, memberHistoryScope]
  );

  const claimsHistory = useMemo(() => {
    const normalizedSubmitted: ClaimHistoryRecord[] = submittedClaims.map((claim: {
      id: string;
      providerName?: string;
      category?: string;
      visitDate?: string;
      status?: string;
      diagnosis?: string;
      amountSubmitted?: string;
    }) => ({
      key: `reimb:${claim.id}`,
      id: claim.id,
      hospital: claim.providerName || "Submitted Provider",
      amount: formatCurrency(claim.amountSubmitted),
      lifecycleStatus: normalizeUnifiedClaimStatus(claim.status || "submitted"),
      status: formatUnifiedClaimStatus(claim.status || "submitted"),
      date: claim.visitDate || new Date().toISOString().slice(0, 10),
      year: (claim.visitDate || new Date().toISOString().slice(0, 10)).slice(0, 4),
      type: `Reimbursement • ${claim.category || "Others"}`,
      diagnosis: claim.diagnosis || "Submitted from Member Portal",
      source: "member_reimbursement",
    }));
    const normalizedAdmin: ClaimHistoryRecord[] = adminClaims.map((claim) => ({
        key: `cashless:${claim.id}`,
        id: claim.id,
        hospital: claim.hospital,
        amount: formatCurrency(claim.amount),
        lifecycleStatus: normalizeUnifiedClaimStatus(claim.lifecycleStatus || claim.status),
        status: formatUnifiedClaimStatus(claim.lifecycleStatus || claim.status),
        date: claim.date,
        year: claim.date.slice(0, 4),
        type: `Cashless • ${claim.serviceType || "Medical"}`,
        diagnosis: claim.diagnosis || claim.rejectionReason || "Processed from provider cashless submission",
        source: "provider_cashless",
        bankSlipFileName: claim.bankSlipFileName,
        bankSlipDataUrl: claim.bankSlipDataUrl,
        bankSlipUploadedAt: claim.bankSlipUploadedAt,
      }));

    const normalizedPanelVisits: ClaimHistoryRecord[] = panelVisitTransactions
      .filter((txn) => {
        if (!memberHistoryScope.staffId) return false;
        if (txn.patientId && txn.patientId === memberHistoryScope.staffId) return true;
        if (
          txn.memberKey &&
          txn.memberKey === memberHistoryScope.memberKey &&
          memberHistoryScope.staffId === memberHistoryScope.memberKey
        ) {
          return true;
        }
        return false;
      })
      .map((txn) => {
        const providerName = getProviderById(txn.providerId)?.providerName || txn.providerId;
        const visitDate = (txn.visitDateTime || txn.createdAt || new Date().toISOString()).slice(0, 10);
        const panelVisitKey = txn.claimId || txn.id;
        return {
          key: `panel:${panelVisitKey}`,
          id: txn.claimId,
          referenceId: txn.id,
          hospital: providerName,
          amount: formatCurrency(txn.amount),
          lifecycleStatus: "submitted",
          status: formatUnifiedClaimStatus("submitted"),
          date: visitDate,
          year: visitDate.slice(0, 4),
          type: `Panel Visit • ${txn.serviceType || "Visit"}`,
          diagnosis: txn.patientName ? `Patient: ${txn.patientName}` : "Panel visit transaction",
          source: "panel_visit",
        };
      });

    const mergedClaims = new Map<string, ClaimHistoryRecord>();
    [...normalizedSubmitted, ...normalizedAdmin, ...normalizedPanelVisits].forEach((claim) => {
      mergedClaims.set(claim.key, claim);
    });

    return Array.from(mergedClaims.values()).sort((left, right) => right.date.localeCompare(left.date));
  }, [adminClaims, memberHistoryScope.memberKey, memberHistoryScope.staffId, panelVisitTransactions, submittedClaims]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(claimsHistory.map((claim) => claim.year))).filter(Boolean);
    return years.sort((a, b) => b.localeCompare(a));
  }, [claimsHistory]);

  const filteredClaims = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const byStatus = filterStatus === "all" 
      ? claimsHistory 
      : claimsHistory.filter((claim) => claim.lifecycleStatus === filterStatus);
    const byYear =
      filterYear === "All" ? byStatus : byStatus.filter((claim) => claim.year === filterYear);
    if (!normalized) return byYear;
    return byYear.filter((claim) => {
      return (
        claim.id.toLowerCase().includes(normalized) ||
        claim.hospital.toLowerCase().includes(normalized) ||
        claim.diagnosis.toLowerCase().includes(normalized) ||
        claim.type.toLowerCase().includes(normalized) ||
        (claim.referenceId ? claim.referenceId.toLowerCase().includes(normalized) : false)
      );
    });
  }, [claimsHistory, filterStatus, filterYear, searchTerm]);

  const getStatusColor = (status: string) => {
    switch (normalizeUnifiedClaimStatus(status)) {
      case "approved": return "text-emerald-600 bg-emerald-100/50 border-emerald-200";
      case "in_process": return "text-sky-600 bg-sky-100/50 border-sky-200";
      case "request_additional_information": return "text-amber-700 bg-amber-100/50 border-amber-200";
      case "rejected": return "text-rose-600 bg-rose-100/50 border-rose-200";
      case "submitted": return "text-slate-600 bg-slate-100/50 border-slate-200";
      default: return "text-slate-600 bg-slate-100/50 border-slate-200";
    }
  };
  const selectedClaim = useMemo(
    () => filteredClaims.find((claim) => claim.key === selectedClaimKey) || null,
    [filteredClaims, selectedClaimKey]
  );

  if (!isHydrated || memberSeedLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 px-6 py-5 text-sm text-slate-600 shadow-sm">
        正在读取理赔历史，请稍候...
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Claim History</h1>
        </div>
        <GlassCard className="p-6">
          <p className="text-sm text-rose-600">{historyError}</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Claim History</h1>
        </div>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
            <input 
              type="text" 
              placeholder="Search by ID, Provider, Diagnosis or Type..." 
              className="w-full glass-input pl-9 pr-4 py-2"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="w-full md:w-auto glass-select px-3 py-2 text-sm"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          >
            <option value="All">All Years</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            {[
              { value: "all", label: "All" },
              { value: "submitted", label: formatUnifiedClaimStatus("submitted") },
              { value: "request_additional_information", label: formatUnifiedClaimStatus("request_additional_information") },
              { value: "in_process", label: formatUnifiedClaimStatus("in_process") },
              { value: "approved", label: formatUnifiedClaimStatus("approved") },
              { value: "rejected", label: formatUnifiedClaimStatus("rejected") },
            ].map((status) => (
              <button
                key={status.value}
                onClick={() => setFilterStatus(status.value)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                  filterStatus === status.value
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" 
                    : "bg-white/50 text-slate-600 hover:bg-white"
                )}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Claims List */}
      <div className="space-y-4">
        {filteredClaims.map((claim) => (
          <GlassCard
            key={claim.key}
            className="group hover:border-sky-300 transition-all cursor-pointer"
            onClick={() => setSelectedClaimKey(claim.key)}
          >
            <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-50 flex items-center justify-center text-sky-600 shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{claim.hospital}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide", getStatusColor(claim.status))}>
                      {claim.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{claim.diagnosis} • {claim.type}</p>
                  <div className="flex items-center gap-4 text-xs text-slate-400 md:hidden">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDateDisplay(claim.date) || claim.date}</span>
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {claim.amount}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6 pl-16 md:pl-0">
                <div className="hidden md:block text-right space-y-1">
                  <p className="font-bold text-slate-800">{claim.amount}</p>
                  <p className="text-xs text-slate-500">{formatDateDisplay(claim.date) || claim.date}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">
                    {claim.bankSlipDataUrl ? "Payment proof ready" : "No payment proof"}
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <MobileDetailModal
        open={!!selectedClaim}
        onClose={() => setSelectedClaimKey(null)}
        title="Claim Details"
        subtitle={selectedClaim ? `${selectedClaim.id} • ${selectedClaim.hospital}` : undefined}
      >
        {selectedClaim && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <GlassCard className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider Name</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedClaim.hospital}</p>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
                <span className={cn("mt-2 inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide", getStatusColor(selectedClaim.status))}>
                  {selectedClaim.status}
                </span>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date Submitted</p>
                <p className="mt-1 text-sm text-slate-700">{formatDateDisplay(selectedClaim.date) || selectedClaim.date}</p>
              </GlassCard>
              <GlassCard className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount Submitted</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selectedClaim.amount}</p>
              </GlassCard>
            </div>
            <GlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Benefit Type</p>
              <p className="mt-1 text-sm text-slate-700">{selectedClaim.type}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Diagnosis</p>
              <p className="mt-1 text-sm text-slate-700">{selectedClaim.diagnosis}</p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Proof</p>
              {selectedClaim.bankSlipDataUrl && selectedClaim.bankSlipFileName ? (
                <div className="mt-2 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{selectedClaim.bankSlipFileName}</p>
                    <p className="text-xs text-slate-500">
                      Uploaded {formatDateDisplay(selectedClaim.bankSlipUploadedAt || "") || selectedClaim.bankSlipUploadedAt || "with approval"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GlassButton
                      variant="secondary"
                      className="gap-2"
                      onClick={() => openDataUrlInNewTab(selectedClaim.bankSlipDataUrl!)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Payment Proof
                    </GlassButton>
                    <GlassButton
                      className="gap-2"
                      onClick={() => downloadDataUrlFile(selectedClaim.bankSlipDataUrl!, selectedClaim.bankSlipFileName!)}
                    >
                      <Download className="h-4 w-4" />
                      Download Payment Proof
                    </GlassButton>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Payment proof becomes available after the claim reaches the final `approved` step in Accountant Workspace.
                </p>
              )}
            </GlassCard>
          </div>
        )}
      </MobileDetailModal>
    </div>
  );
}
