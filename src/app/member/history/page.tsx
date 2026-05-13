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
import { useMemo, useState, useSyncExternalStore } from "react";
import { downloadDataUrlFile, openDataUrlInNewTab } from "@/lib/fileData";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { ensureMemberSeed, getMemberDirectory, getMemberSession } from "@/lib/memberSession";
import { ensureCompanySeed, getCompanies } from "@/lib/companyStore";
import {
  ensureAdminClaimsSeed,
  ensureMemberClaimsStore,
  getAdminClaimsServerSnapshot,
  getAdminClaimsSnapshot,
  getMemberClaimsServerSnapshot,
  getMemberClaimsSnapshot,
  normalizeClaimStatus,
  subscribeAdminClaims,
  subscribeMemberClaims,
} from "@/lib/claimsStore";
import { getMemberLimitOwnerStaffId } from "@/lib/memberPlan";
import { ensureProviderSeed, getProviderById } from "@/lib/providerSession";
import { getPanelVisitTransactions } from "@/lib/panelVisitStore";

type ClaimHistoryRecord = {
  key: string;
  id: string;
  hospital: string;
  amount: string;
  status: string;
  date: string;
  year: string;
  type: string;
  diagnosis: string;
  source: "seeded" | "member_reimbursement" | "provider_cashless" | "panel_visit";
  referenceId?: string;
  bankSlipFileName?: string;
  bankSlipDataUrl?: string;
  bankSlipUploadedAt?: string;
};

export default function MemberHistoryPage() {
  ensureMemberSeed();
  ensureCompanySeed();
  ensureProviderSeed();
  ensureAdminClaimsSeed();
  ensureMemberClaimsStore();
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterYear, setFilterYear] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClaimKey, setSelectedClaimKey] = useState<string | null>(null);
  const memberSession = useSyncExternalStore(
    () => () => {},
    () => getMemberSession(),
    () => null
  );
  const memberStaffId = memberSession?.staffId ?? "";
  const memberCompanyId = memberSession?.companyId ?? "";
  const submittedClaims = useSyncExternalStore(
    subscribeMemberClaims,
    getMemberClaimsSnapshot,
    getMemberClaimsServerSnapshot
  );
  const adminClaims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsServerSnapshot
  );
  const panelVisitTransactions = useSyncExternalStore(
    () => () => {},
    () => getPanelVisitTransactions(),
    () => []
  );

  const claimsHistory = useMemo(() => {
    const seeded: ClaimHistoryRecord[] = [
      { 
        key: "seeded:CLM-9901",
        id: "CLM-9901", 
        hospital: "City General Hospital", 
        amount: "RM 1,250.00", 
        status: "In review", 
        date: "2024-01-28",
        year: "2024",
        type: "Rehabilitation",
        diagnosis: "Acute Gastritis",
        source: "seeded",
      },
      { 
        key: "seeded:CLM-8842",
        id: "CLM-8842", 
        hospital: "St. Mary's Clinic", 
        amount: "RM 450.00", 
        status: "Approved", 
        date: "2024-01-15",
        year: "2024",
        type: "Outpatient",
        diagnosis: "Viral Fever",
        source: "seeded",
      },
      { 
        key: "seeded:CLM-8721",
        id: "CLM-8721", 
        hospital: "Dental Care Plus", 
        amount: "RM 250.00", 
        status: "Approved", 
        date: "2023-12-22",
        year: "2023",
        type: "Dental",
        diagnosis: "Scaling & Polishing",
        source: "seeded",
      },
      { 
        key: "seeded:CLM-8550",
        id: "CLM-8550", 
        hospital: "City General Hospital", 
        amount: "RM 3,500.00", 
        status: "Approved", 
        date: "2023-11-10",
        year: "2023",
        type: "Rehabilitation",
        diagnosis: "Appendicitis",
        source: "seeded",
      },
      { 
        key: "seeded:CLM-8100",
        id: "CLM-8100", 
        hospital: "Vision Eye Specialist", 
        amount: "RM 180.00", 
        status: "Rejected", 
        date: "2023-10-05",
        year: "2023",
        type: "Optical",
        diagnosis: "Routine Checkup",
        source: "seeded",
      },
    ];

    const memberDirectory = getMemberDirectory();
    const companies = getCompanies();
    const memberEntry =
      memberCompanyId && memberStaffId
        ? memberDirectory.find((entry) => entry.companyId === memberCompanyId && entry.staffId === memberStaffId) || null
        : null;
    const company = memberCompanyId ? companies.find((c) => c.companyId === memberCompanyId) || null : null;
    const memberLimitOwnerStaffId =
      getMemberLimitOwnerStaffId(memberEntry, company) || memberStaffId;

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
      status: normalizeClaimStatus(claim.status || "In review"),
      date: claim.visitDate || new Date().toISOString().slice(0, 10),
      year: (claim.visitDate || new Date().toISOString().slice(0, 10)).slice(0, 4),
      type: `Reimbursement • ${claim.category || "Others"}`,
      diagnosis: claim.diagnosis || "Submitted from Member Portal",
      source: "member_reimbursement",
    }));
    const normalizedAdmin: ClaimHistoryRecord[] = adminClaims
      .filter((claim) => {
        if (!memberStaffId) return false;
        if (claim.patientId && claim.patientId === memberStaffId) return true;
        if (claim.memberKey && claim.memberKey === memberLimitOwnerStaffId) return true;
        return false;
      })
      .map((claim) => ({
        key: `cashless:${claim.id}`,
        id: claim.id,
        hospital: claim.hospital,
        amount: formatCurrency(claim.amount),
        status: normalizeClaimStatus(claim.status),
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
        if (!memberStaffId) return false;
        if (txn.patientId && txn.patientId === memberStaffId) return true;
        if (txn.memberKey && txn.memberKey === memberLimitOwnerStaffId) return true;
        return false;
      })
      .map((txn) => {
        const providerName = getProviderById(txn.providerId)?.providerName || txn.providerId;
        const visitDate = (txn.visitDateTime || txn.createdAt || new Date().toISOString()).slice(0, 10);
        return {
          key: `panel:${txn.id}`,
          id: txn.claimId,
          referenceId: txn.id,
          hospital: providerName,
          amount: formatCurrency(txn.amount),
          status: "In review",
          date: visitDate,
          year: visitDate.slice(0, 4),
          type: `Panel Visit • ${txn.serviceType || "Visit"}`,
          diagnosis: txn.patientName ? `Patient: ${txn.patientName}` : "Panel visit transaction",
          source: "panel_visit",
        };
      });

    const mergedClaims = new Map<string, ClaimHistoryRecord>();
    [...seeded, ...normalizedSubmitted, ...normalizedAdmin, ...normalizedPanelVisits].forEach((claim) => {
      mergedClaims.set(claim.key, claim);
    });

    return Array.from(mergedClaims.values()).sort((left, right) => right.date.localeCompare(left.date));
  }, [adminClaims, memberCompanyId, memberStaffId, panelVisitTransactions, submittedClaims]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(claimsHistory.map((claim) => claim.year))).filter(Boolean);
    return years.sort((a, b) => b.localeCompare(a));
  }, [claimsHistory]);

  const filteredClaims = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    const byStatus = filterStatus === "All" 
      ? claimsHistory 
      : claimsHistory.filter(claim => claim.status === filterStatus);
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
    switch (status) {
      case "Approved": return "text-emerald-600 bg-emerald-100/50 border-emerald-200";
      case "In progress": return "text-sky-600 bg-sky-100/50 border-sky-200";
      case "In review": return "text-amber-600 bg-amber-100/50 border-amber-200";
      case "Rejected": return "text-rose-600 bg-rose-100/50 border-rose-200";
      default: return "text-slate-600 bg-slate-100/50 border-slate-200";
    }
  };
  const selectedClaim = useMemo(
    () => filteredClaims.find((claim) => claim.key === selectedClaimKey) || null,
    [filteredClaims, selectedClaimKey]
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Claim History</h1>
          <p className="text-slate-500">View and track all your medical claims.</p>
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
            {["All", "In review", "In progress", "Approved", "Rejected"].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap",
                  filterStatus === status 
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/30" 
                    : "bg-white/50 text-slate-600 hover:bg-white"
                )}
              >
                {status}
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
                      {claim.bankSlipDataUrl ? "Slip ready" : "No slip"}
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bank-In Slip</p>
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
                      View Slip
                    </GlassButton>
                    <GlassButton
                      className="gap-2"
                      onClick={() => downloadDataUrlFile(selectedClaim.bankSlipDataUrl!, selectedClaim.bankSlipFileName!)}
                    >
                      <Download className="h-4 w-4" />
                      Download Slip
                    </GlassButton>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">Slip is available after the claim is approved and finance uploads the bank-in slip.</p>
              )}
            </GlassCard>
          </div>
        )}
      </MobileDetailModal>
    </div>
  );
}
