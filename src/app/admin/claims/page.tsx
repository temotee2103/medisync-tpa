"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { MobileDetailModal } from "@/components/ui/MobileDetailModal";
import {
  Search,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  ShieldCheck,
  Building2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { readFileAsDataUrl } from "@/lib/fileData";
import { formatCurrency, formatDateDisplay, formatPhoneForDisplay } from "@/lib/formats";
import { getAdminSession } from "@/lib/adminSession";
import { ensureMemberSeed, getMemberDirectory } from "@/lib/memberSession";
import { ensureCompanySeed, getCompanies } from "@/lib/companyStore";
import { ensureProviderSeed, getProviderDirectory } from "@/lib/providerSession";
import {
  countConfiguredPlanLimits,
  countSelectedPlanBenefits,
  formatPlanTypeLabel,
  resolveMemberPlan,
} from "@/lib/memberPlan";
import { notifyClaimStatusEmail } from "@/lib/claimNotifications";
import {
  addAdminClaimRequest,
  deleteAdminClaim as removeAdminClaim,
  deleteMemberClaim as removeMemberClaim,
  ensureAdminClaimsSeed,
  getAdminClaimsServerSnapshot,
  getAdminClaimsSnapshot,
  getMemberClaimsServerSnapshot,
  getMemberClaimsSnapshot,
  ensureMemberClaimsStore,
  refreshMemberClaimsSnapshot,
  refreshAdminClaimsSnapshot,
  removeAdminClaimRequest,
  subscribeAdminClaims,
  subscribeMemberClaims,
  type AdminClaimRecord,
  type MemberClaimRecord,
  updateAdminClaimStatus as saveAdminClaimStatus,
  updateMemberClaimStatus as saveMemberClaimStatus,
} from "@/lib/claimsStore";

const getPrimaryStaffId = (staffId: string) =>
  staffId.includes("-DEP-") ? staffId.split("-DEP-")[0] : staffId;

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case "Approved":
      return "bg-emerald-100 text-emerald-700";
    case "Rejected":
      return "bg-rose-100 text-rose-700";
    case "In progress":
      return "bg-sky-100 text-sky-700";
    case "In review":
    default:
      return "bg-amber-100 text-amber-700";
  }
};

const MOCK_MEMBER_DEPENDENTS: Record<
  string,
  Array<{
    name: string;
    relation: string;
    status: string;
    gender: string;
    dob: string;
  }>
> = {
  "John Doe": [
    { name: "Jane Doe", relation: "Spouse", status: "Active", gender: "Female", dob: "1992-01-01" },
    { name: "Baby Doe", relation: "Child", status: "Active", gender: "Male", dob: "2022-10-10" },
  ],
  "Sarah Ng": [{ name: "Daniel Ng", relation: "Child", status: "Active", gender: "Male", dob: "2018-03-14" }],
};

type ClaimScope = "member" | "vendor";
type ClaimTarget = { id: string; scope: ClaimScope };
type AnyClaimRecord = AdminClaimRecord | MemberClaimRecord;

const getClaimSubmittedAt = (claim: AnyClaimRecord) =>
  "amountSubmitted" in claim ? claim.createdAt || claim.visitDate : claim.submittedAt || claim.createdAt || claim.date;

const getClaimSubmittedAmount = (claim: AnyClaimRecord) =>
  "amountSubmitted" in claim ? Number(claim.amountSubmitted) || 0 : claim.amount;

export default function ClaimsListPage() {
  const [adminSession, setAdminSession] = useState<ReturnType<typeof getAdminSession>>(null);
  const [activeTab, setActiveTab] = useState<"member" | "vendor">("member");
  const isSuperAdmin = adminSession?.role === "super_admin";
  const vendorClaims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsServerSnapshot
  );
  const memberClaims = useSyncExternalStore(
    subscribeMemberClaims,
    getMemberClaimsSnapshot,
    getMemberClaimsServerSnapshot
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [providerFilter, setProviderFilter] = useState("All");
  const [requestingClaimTarget, setRequestingClaimTarget] = useState<ClaimTarget | null>(null);
  const [rejectingClaimTarget, setRejectingClaimTarget] = useState<ClaimTarget | null>(null);
  const [approvingClaimTarget, setApprovingClaimTarget] = useState<ClaimTarget | null>(null);
  const [selectedMemberClaimId, setSelectedMemberClaimId] = useState<string | null>(null);
  const [selectedPatientClaimId, setSelectedPatientClaimId] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [bankSlipFile, setBankSlipFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [lastRequestToken, setLastRequestToken] = useState("");
  const memberDirectory = useMemo(() => {
    ensureMemberSeed();
    return getMemberDirectory();
  }, []);
  const providerDirectory = useMemo(() => {
    ensureProviderSeed();
    return getProviderDirectory();
  }, []);
  const companies = useMemo(() => {
    ensureCompanySeed();
    return getCompanies();
  }, []);

  useEffect(() => {
    setAdminSession(getAdminSession());
    ensureAdminClaimsSeed();
    ensureMemberClaimsStore();
    refreshAdminClaimsSnapshot();
    refreshMemberClaimsSnapshot();
  }, []);

  const providerOptions = useMemo(
    () =>
      activeTab === "member"
        ? ["All", ...Array.from(new Set(memberClaims.map((claim) => claim.providerName))).sort()]
        : ["All", ...Array.from(new Set(vendorClaims.map((claim) => claim.hospital))).sort()],
    [activeTab, memberClaims, vendorClaims]
  );

  const filteredVendorClaims = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return vendorClaims.filter((claim) => {
      const matchesSearch =
        !normalizedSearch ||
        claim.patient.toLowerCase().includes(normalizedSearch) ||
        claim.id.toLowerCase().includes(normalizedSearch) ||
        claim.hospital.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "All" || claim.status === statusFilter;
      const matchesProvider = providerFilter === "All" || claim.hospital === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
  }, [providerFilter, searchTerm, statusFilter, vendorClaims]);

  const filteredMemberClaims = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return memberClaims.filter((claim) => {
      const matchesSearch =
        !normalizedSearch ||
        claim.patient.toLowerCase().includes(normalizedSearch) ||
        claim.id.toLowerCase().includes(normalizedSearch) ||
        claim.providerName.toLowerCase().includes(normalizedSearch) ||
        claim.invoiceReceiptNo.toLowerCase().includes(normalizedSearch) ||
        claim.category.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "All" || claim.status === statusFilter;
      const matchesProvider = providerFilter === "All" || claim.providerName === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
  }, [memberClaims, providerFilter, searchTerm, statusFilter]);

  const visibleClaimsCount = activeTab === "member" ? filteredMemberClaims.length : filteredVendorClaims.length;
  const tabStats = useMemo(
    () => ({
      member: {
        total: memberClaims.length,
        inReview: memberClaims.filter((claim) => claim.status === "In review").length,
      },
      vendor: {
        total: vendorClaims.length,
        inReview: vendorClaims.filter((claim) => claim.status === "In review").length,
      },
    }),
    [memberClaims, vendorClaims]
  );

  const requestingClaim = useMemo(() => {
    if (!requestingClaimTarget) return null;
    return requestingClaimTarget.scope === "member"
      ? memberClaims.find((claim) => claim.id === requestingClaimTarget.id) || null
      : vendorClaims.find((claim) => claim.id === requestingClaimTarget.id) || null;
  }, [memberClaims, requestingClaimTarget, vendorClaims]);
  const rejectingClaim = useMemo(() => {
    if (!rejectingClaimTarget) return null;
    return rejectingClaimTarget.scope === "member"
      ? memberClaims.find((claim) => claim.id === rejectingClaimTarget.id) || null
      : vendorClaims.find((claim) => claim.id === rejectingClaimTarget.id) || null;
  }, [memberClaims, rejectingClaimTarget, vendorClaims]);
  const approvingClaim = useMemo(() => {
    if (!approvingClaimTarget) return null;
    return approvingClaimTarget.scope === "member"
      ? memberClaims.find((claim) => claim.id === approvingClaimTarget.id) || null
      : vendorClaims.find((claim) => claim.id === approvingClaimTarget.id) || null;
  }, [approvingClaimTarget, memberClaims, vendorClaims]);
  const selectedPatientClaim = useMemo(
    () => vendorClaims.find((claim) => claim.id === selectedPatientClaimId) || null,
    [selectedPatientClaimId, vendorClaims]
  );
  const selectedMemberClaim = useMemo(
    () => memberClaims.find((claim) => claim.id === selectedMemberClaimId) || null,
    [memberClaims, selectedMemberClaimId]
  );
  const selectedPatientRecord = useMemo(() => {
    if (!selectedPatientClaim) return null;
    return memberDirectory.find((member) => member.fullName === selectedPatientClaim.patient) || null;
  }, [memberDirectory, selectedPatientClaim]);
  const selectedMemberRecord = useMemo(() => {
    if (!selectedMemberClaim) return null;
    return memberDirectory.find((member) => member.fullName === selectedMemberClaim.patient) || null;
  }, [memberDirectory, selectedMemberClaim]);
  const selectedMemberCompany = useMemo(() => {
    if (!selectedMemberRecord) return null;
    return companies.find((company) => company.companyId === selectedMemberRecord.companyId) || null;
  }, [companies, selectedMemberRecord]);
  const selectedMemberPlan = useMemo(() => {
    if (!selectedMemberRecord) return null;
    return resolveMemberPlan(selectedMemberRecord, selectedMemberCompany);
  }, [selectedMemberCompany, selectedMemberRecord]);
  const selectedMemberDependents = useMemo(() => {
    if (!selectedMemberRecord) {
      if (!selectedMemberClaim) return [];
      return MOCK_MEMBER_DEPENDENTS[selectedMemberClaim.patient] || [];
    }

    const primaryStaffId = getPrimaryStaffId(selectedMemberRecord.staffId);
    const linkedDependents = memberDirectory.filter(
      (entry) =>
        entry.companyId === selectedMemberRecord.companyId &&
        entry.staffId.startsWith(`${primaryStaffId}-DEP-`)
    );

    if (linkedDependents.length > 0) return linkedDependents;
    if (!selectedMemberClaim) return [];
    return MOCK_MEMBER_DEPENDENTS[selectedMemberClaim.patient] || [];
  }, [memberDirectory, selectedMemberClaim, selectedMemberRecord]);
  const selectedPatientCompany = useMemo(() => {
    if (!selectedPatientRecord) return null;
    return companies.find((company) => company.companyId === selectedPatientRecord.companyId) || null;
  }, [companies, selectedPatientRecord]);
  const selectedPatientPlan = useMemo(() => {
    if (!selectedPatientRecord) return null;
    return resolveMemberPlan(selectedPatientRecord, selectedPatientCompany);
  }, [selectedPatientCompany, selectedPatientRecord]);
  const selectedPatientDependents = useMemo(() => {
    if (!selectedPatientRecord) {
      if (!selectedPatientClaim) return [];
      return MOCK_MEMBER_DEPENDENTS[selectedPatientClaim.patient] || [];
    }

    const primaryStaffId = getPrimaryStaffId(selectedPatientRecord.staffId);
    const linkedDependents = memberDirectory.filter(
      (entry) =>
        entry.companyId === selectedPatientRecord.companyId &&
        entry.staffId.startsWith(`${primaryStaffId}-DEP-`)
    );

    if (linkedDependents.length > 0) return linkedDependents;
    if (!selectedPatientClaim) return [];
    return MOCK_MEMBER_DEPENDENTS[selectedPatientClaim.patient] || [];
  }, [memberDirectory, selectedPatientClaim, selectedPatientRecord]);
  const canActionClaim = (status: string) => !["Approved", "Rejected"].includes(status);
  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setProviderFilter("All");
  };
  const openRequestModal = (scope: ClaimScope, claimId: string) => {
    setRequestingClaimTarget({ id: claimId, scope });
    setRequestNote("");
  };
  const openRejectModal = (scope: ClaimScope, claimId: string, reason?: string) => {
    setRejectingClaimTarget({ id: claimId, scope });
    setRejectionReason(reason || "");
  };
  const openApprovalModal = (scope: ClaimScope, claimId: string) => {
    setApprovingClaimTarget({ id: claimId, scope });
    setBankSlipFile(null);
    setApprovalError("");
  };
  const closeApprovalModal = () => {
    setApprovingClaimTarget(null);
    setBankSlipFile(null);
    setApprovalError("");
  };
  const handleBankSlipSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setBankSlipFile(null);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setBankSlipFile({ name: file.name, dataUrl });
      setApprovalError("");
    } catch (error) {
      setBankSlipFile(null);
      setApprovalError(error instanceof Error ? error.message : "Unable to upload the bank-in slip.");
    } finally {
      event.target.value = "";
    }
  };

  const saveClaimStatus = (
    target: ClaimTarget,
    nextStatus: string,
    options?: {
      rejectionReason?: string;
      bankSlipFileName?: string;
      bankSlipDataUrl?: string;
      bankSlipUploadedAt?: string;
    }
  ) => {
    const previousClaim =
      target.scope === "member"
        ? memberClaims.find((claim) => claim.id === target.id) || null
        : vendorClaims.find((claim) => claim.id === target.id) || null;
    const previousStatus = previousClaim?.status || "";

    if (target.scope === "member") {
      saveMemberClaimStatus(target.id, nextStatus, options);
    } else {
      saveAdminClaimStatus(target.id, nextStatus, options);
    }

    if (!previousClaim || previousStatus === nextStatus) return;

    const to =
      target.scope === "member"
        ? memberDirectory.find((entry) => entry.staffId === previousClaim.patientId)?.email ||
          memberDirectory.find((entry) => entry.fullName === previousClaim.patient)?.email ||
          ""
        : providerDirectory.find((entry) => entry.providerName === (previousClaim as AdminClaimRecord).hospital)
            ?.contactEmail || "";

    if (!to) return;

    const subject = `Claim ${previousClaim.id} status updated: ${previousStatus} → ${nextStatus}`;
    const reasonLine =
      nextStatus === "Rejected" && options?.rejectionReason?.trim()
        ? `\n\nRejection reason:\n${options.rejectionReason.trim()}`
        : "";
    const text = [
      `Claim ID: ${previousClaim.id}`,
      `Claim type: ${target.scope === "member" ? "Member reimbursement" : "Provider cashless"}`,
      `Patient: ${previousClaim.patient}`,
      target.scope === "member"
        ? `Provider: ${(previousClaim as MemberClaimRecord).providerName}`
        : `Provider: ${(previousClaim as AdminClaimRecord).hospital}`,
      `Status: ${previousStatus} → ${nextStatus}`,
    ].join("\n") + reasonLine;

    void notifyClaimStatusEmail({ to, subject, text });
  };

  const deleteClaim = (target: ClaimTarget) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete claim ${target.id}? This action cannot be undone in mock view.`)
    ) {
      return;
    }
    if (target.scope === "member") {
      removeMemberClaim(target.id);
      return;
    }
    removeAdminClaim(target.id);
  };

  const renderClaimActions = (scope: ClaimScope, claim: AnyClaimRecord) => (
    <>
      {scope === "vendor" ? (
        <Link href={`/admin/claims/${claim.id}`}>
          <GlassButton
            variant="ghost"
            className="h-9 w-9 p-0 inline-flex items-center justify-center text-sky-600 hover:text-sky-700"
            title="Review Claim"
          >
            <ArrowRight className="w-4 h-4" />
          </GlassButton>
        </Link>
      ) : (
        <GlassButton
          variant="ghost"
          className="h-9 w-9 p-0 inline-flex items-center justify-center text-sky-600 hover:text-sky-700"
          title="Review Claim"
          onClick={() => setSelectedMemberClaimId(claim.id)}
        >
          <ArrowRight className="w-4 h-4" />
        </GlassButton>
      )}
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 inline-flex items-center justify-center text-rose-600 hover:text-rose-700 disabled:text-slate-300 disabled:hover:text-slate-300"
        title="Reject Claim"
        disabled={!canActionClaim(claim.status)}
        onClick={() => openRejectModal(scope, claim.id, claim.rejectionReason)}
      >
        <XCircle className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 inline-flex items-center justify-center text-amber-600 hover:text-amber-700"
        title="Request Additional Information"
        onClick={() => openRequestModal(scope, claim.id)}
      >
        <AlertTriangle className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 inline-flex items-center justify-center text-emerald-600 hover:text-emerald-700 disabled:text-slate-300 disabled:hover:text-slate-300"
        title="Approve Claim"
        disabled={!canActionClaim(claim.status)}
        onClick={() => openApprovalModal(scope, claim.id)}
      >
        <CheckCircle2 className="w-4 h-4" />
      </GlassButton>
      {isSuperAdmin && (
        <GlassButton
          variant="ghost"
          className="h-9 w-9 p-0 inline-flex items-center justify-center text-slate-500 hover:text-rose-700"
          title="Delete Claim"
          onClick={() => deleteClaim({ id: claim.id, scope })}
        >
          <Trash2 className="w-4 h-4" />
        </GlassButton>
      )}
    </>
  );

  const renderFilterFields = () => (
    <>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Status</label>
        <select
          className="w-full glass-input px-4 py-2.5 bg-transparent"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All</option>
          <option value="In review">In review</option>
          <option value="In progress">In progress</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
          {activeTab === "member" ? "Clinic / Provider" : "Provider Name"}
        </label>
        <select
          className="w-full glass-input px-4 py-2.5 bg-transparent"
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
        >
          {providerOptions.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  const approveClaim = () => {
    if (!approvingClaim || !approvingClaimTarget) return;
    if (!bankSlipFile) {
      setApprovalError("Upload the bank-in slip before approving this claim.");
      return;
    }

    try {
      saveClaimStatus(approvingClaimTarget, "Approved", {
        bankSlipFileName: bankSlipFile.name,
        bankSlipDataUrl: bankSlipFile.dataUrl,
        bankSlipUploadedAt: new Date().toISOString(),
      });
      closeApprovalModal();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to approve this claim.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Claims Management</h1>
          <p className="text-slate-500">Separate member reimbursement claims from vendor-submitted claims in one workspace.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4">
        <GlassCard className="p-4 border-sky-100 bg-gradient-to-br from-sky-50 via-white to-cyan-50">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-600">Member Claims</p>
              <h2 className="text-xl font-bold text-slate-800">Reimbursement submissions from members</h2>
              <p className="text-sm text-slate-500">Track receipts, visit dates, categories, and review status from the member portal.</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 shadow-sm border border-sky-100">
              <Users className="h-5 w-5 text-sky-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 border border-sky-100">
              {tabStats.member.total} total
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
              {tabStats.member.inReview} in review
            </span>
          </div>
        </GlassCard>

        <GlassCard className="p-4 border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">Vendor Claims</p>
              <h2 className="text-xl font-bold text-slate-800">Provider claims that need admin action</h2>
              <p className="text-sm text-slate-500">Review, request more information, approve with bank-in slip, or reject submitted claims.</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 shadow-sm border border-emerald-100">
              <Building2 className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 border border-emerald-100">
              {tabStats.vendor.total} total
            </span>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
              {tabStats.vendor.inReview} in review
            </span>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-2 border-white/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("member")}
            className={`rounded-2xl px-4 py-3 text-left transition-all ${
              activeTab === "member"
                ? "bg-sky-600 text-white shadow-lg shadow-sky-200"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] opacity-80">Member Claims</p>
                <p className="mt-1 text-sm font-medium opacity-90">Portal reimbursement submissions</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activeTab === "member" ? "bg-white/15 text-white" : "bg-sky-100 text-sky-700"}`}>
                {tabStats.member.total}
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("vendor")}
            className={`rounded-2xl px-4 py-3 text-left transition-all ${
              activeTab === "vendor"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                : "bg-white/70 text-slate-700 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] opacity-80">Vendor Claims</p>
                <p className="mt-1 text-sm font-medium opacity-90">Provider claims with admin actions</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${activeTab === "vendor" ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                {tabStats.vendor.total}
              </span>
            </div>
          </button>
        </div>
      </GlassCard>

      <GlassCard className="hidden lg:block p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <SlidersHorizontal className="w-4 h-4 text-sky-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Filter {activeTab === "member" ? "Member" : "Vendor"} Claims
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <input
                type="text"
                placeholder={
                  activeTab === "member"
                    ? "Search by Claim ID, patient, provider, invoice, or category"
                    : "Search by Claim ID, patient, or provider name"
                }
                className="w-full glass-input pl-10 pr-4 py-2.5"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          {renderFilterFields()}
          <div className="flex items-end">
            <GlassButton
              variant="secondary"
              className="w-full lg:w-auto gap-2"
              onClick={resetFilters}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </GlassButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="lg:hidden p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
          <input
            type="text"
            placeholder={activeTab === "member" ? "Search member claims" : "Search vendor claims"}
            className="w-full glass-input pl-10 pr-4 py-2.5"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 pt-1">
          {renderFilterFields()}
          <GlassButton variant="secondary" className="w-full gap-2" onClick={resetFilters}>
            <RotateCcw className="w-4 h-4" />
            Reset Filters
          </GlassButton>
        </div>
        <p className="text-xs text-slate-500">{visibleClaimsCount} result(s)</p>
      </GlassCard>

      <ResponsiveDataView
        desktop={
          activeTab === "member" ? (
            <GlassCard className="overflow-hidden p-0 border-white/40">
              <div className="px-6 py-4 border-b border-white/60 bg-white/40 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Member Claim List</h2>
                  <p className="text-sm text-slate-500">Review reimbursement submissions coming from the member portal.</p>
                </div>
                <span className="text-sm font-medium text-slate-500">{filteredMemberClaims.length} result(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/40 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Claim ID</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Patient</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date Submitted</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount Submitted</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMemberClaims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            className="font-mono text-sm font-semibold text-slate-700 hover:text-sky-700 transition-colors"
                            onClick={() => setSelectedMemberClaimId(claim.id)}
                          >
                            {claim.id}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-800">{claim.patient}</td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {formatDateDisplay(getClaimSubmittedAt(claim)) || getClaimSubmittedAt(claim)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right">
                          {formatCurrency(getClaimSubmittedAmount(claim))}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusBadgeClass(claim.status)}`}>
                            {claim.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">{renderClaimActions("member", claim)}</div>
                        </td>
                      </tr>
                    ))}
                    {filteredMemberClaims.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                          No member claims found matching the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="overflow-hidden p-0 border-white/40">
              <div className="px-6 py-4 border-b border-white/60 bg-white/40 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Vendor Claim List</h2>
                  <p className="text-sm text-slate-500">Review incoming provider claims in a standard management table.</p>
                </div>
                <span className="text-sm font-medium text-slate-500">{filteredVendorClaims.length} result(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/40 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Claim ID</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Patient</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date Submitted</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount Submitted</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVendorClaims.map((claim) => (
                      <tr key={claim.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-semibold text-slate-700">{claim.id}</span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            className="font-medium text-slate-800 hover:text-sky-700 transition-colors"
                            onClick={() => setSelectedPatientClaimId(claim.id)}
                          >
                            {claim.patient}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {formatDateDisplay(getClaimSubmittedAt(claim)) || getClaimSubmittedAt(claim)}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right">
                          {formatCurrency(getClaimSubmittedAmount(claim))}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${getStatusBadgeClass(claim.status)}`}>
                            {claim.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">{renderClaimActions("vendor", claim)}</div>
                        </td>
                      </tr>
                    ))}
                    {filteredVendorClaims.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                          No vendor claims found matching the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )
        }
        mobile={
          activeTab === "member" ? (
            <div className="space-y-3">
              {filteredMemberClaims.map((claim) => (
                <MobileRecordCard
                  key={claim.id}
                  title={<span className="font-mono">{claim.id}</span>}
                  subtitle={claim.providerName}
                  badge={
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeClass(claim.status)}`}>
                      {claim.status}
                    </span>
                  }
                  meta={
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateDisplay(claim.visitDate) || claim.visitDate}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 font-semibold text-slate-700">
                        {formatCurrency(Number(claim.amountSubmitted) || 0)}
                      </span>
                    </>
                  }
                  footer={<div className="flex flex-wrap justify-end gap-1.5">{renderClaimActions("member", claim)}</div>}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient</p>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{claim.patient}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</p>
                      <p className="mt-1 text-sm text-slate-700">{claim.category}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice / Receipt</p>
                      <p className="mt-1 text-sm text-slate-700">{claim.invoiceReceiptNo}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attachments</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {claim.receiptFiles.length + Number(Boolean(claim.referralFileName)) + Number(Boolean(claim.mcFileName)) + Number(Boolean(claim.rlFileName))} file(s)
                      </p>
                    </div>
                  </div>
                </MobileRecordCard>
              ))}
              {filteredMemberClaims.length === 0 && (
                <GlassCard className="p-6 text-center text-sm text-slate-400">
                  No member claims found matching the selected filters.
                </GlassCard>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVendorClaims.map((claim) => (
                <MobileRecordCard
                  key={claim.id}
                  title={<span className="font-mono">{claim.id}</span>}
                  subtitle={claim.hospital}
                  badge={
                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeClass(claim.status)}`}>
                      {claim.status}
                    </span>
                  }
                  meta={
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateDisplay(claim.date) || claim.date}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 font-semibold text-slate-700">
                        {formatCurrency(claim.amount)}
                      </span>
                    </>
                  }
                  footer={<div className="flex flex-wrap justify-end gap-1.5">{renderClaimActions("vendor", claim)}</div>}
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient</p>
                    <button
                      type="button"
                      className="mt-1 text-sm font-semibold text-slate-800 hover:text-sky-700 transition-colors"
                      onClick={() => setSelectedPatientClaimId(claim.id)}
                    >
                      {claim.patient}
                    </button>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider Name</p>
                    <p className="mt-1 text-sm text-slate-700">{claim.hospital}</p>
                  </div>
                </MobileRecordCard>
              ))}
              {filteredVendorClaims.length === 0 && (
                <GlassCard className="p-6 text-center text-sm text-slate-400">
                  No vendor claims found matching the selected filters.
                </GlassCard>
              )}
            </div>
          )
        }
      />
      {requestingClaim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setRequestingClaimTarget(null)} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Request Additional Information</h3>
              <p className="text-sm text-slate-500">
                Claim: <span className="font-medium text-slate-700">{requestingClaim.id}</span> for {requestingClaim.patient}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Request Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full glass-input p-3 text-sm h-32 resize-none"
                  placeholder="Specify required documents or clarifications..."
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                />
                <p className="text-xs text-slate-400">
                  Keep the message short and actionable for the {requestingClaimTarget?.scope === "member" ? "member" : "provider"}.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setRequestingClaimTarget(null)}>Cancel</GlassButton>
              <GlassButton
                disabled={!requestNote.trim()}
                onClick={() => {
                  const token = `${requestingClaim.id}-${Date.now()}`;
                  addAdminClaimRequest({ token, id: requestingClaim.id, note: requestNote.trim(), createdAt: new Date().toISOString() });
                  if (!requestingClaimTarget) return;
                  saveClaimStatus(requestingClaimTarget, "In progress");
                  setLastRequestToken(token);
                  setRequestNote("");
                  setRequestingClaimTarget(null);
                }}
              >
                Send Request
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      {approvingClaim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeApprovalModal} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Approve Claim</h3>
              <p className="text-sm text-slate-500">
                Claim: <span className="font-medium text-slate-700">{approvingClaim.id}</span> for {approvingClaim.patient}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm font-medium text-emerald-900">Bank-in slip is required before approval.</p>
                <p className="mt-1 text-xs text-emerald-700">The uploaded slip will be visible in the member portal for download.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Bank-In Slip <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="w-full glass-input px-2.5 py-1.5 bg-white text-[11px] text-slate-600 file:mr-2.5 file:rounded-md file:border file:border-slate-200 file:bg-slate-100 file:px-3 file:py-1 file:text-[10px] file:font-semibold file:uppercase file:tracking-wide file:text-slate-600 hover:file:bg-slate-200/80"
                  onChange={handleBankSlipSelection}
                />
                {bankSlipFile?.name && (
                  <p className="text-[11px] text-slate-500">{bankSlipFile.name}</p>
                )}
              </div>
              {approvalError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {approvalError}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={closeApprovalModal}>Cancel</GlassButton>
              <GlassButton disabled={!bankSlipFile} onClick={approveClaim}>
                Confirm Approval
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      {rejectingClaim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setRejectingClaimTarget(null)} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Reject Claim</h3>
              <p className="text-sm text-slate-500">
                Claim: <span className="font-medium text-slate-700">{rejectingClaim.id}</span> for {rejectingClaim.patient}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full glass-input p-3 text-sm h-32 resize-none"
                  placeholder="State the rejection reason clearly for the claim owner."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
                <p className="text-xs text-slate-400">This message should be visible and understandable to the claim owner.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setRejectingClaimTarget(null)}>Cancel</GlassButton>
              <GlassButton
                disabled={!rejectionReason.trim()}
                onClick={() => {
                  if (!rejectingClaimTarget) return;
                  saveClaimStatus(rejectingClaimTarget, "Rejected", { rejectionReason });
                  setRejectingClaimTarget(null);
                  setRejectionReason("");
                }}
              >
                Confirm Reject
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      <MobileDetailModal
        open={!!selectedMemberClaim}
        onClose={() => setSelectedMemberClaimId(null)}
        title="Member Claim Review"
        contentClassName="sm:max-w-4xl"
        subtitle={
          selectedMemberClaim ? (
            <>
              Claim: <span className="font-medium text-slate-700">{selectedMemberClaim.id}</span>
            </>
          ) : undefined
        }
      >
        {selectedMemberClaim && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-xl font-bold text-slate-800">{selectedMemberClaim.patient}</h4>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeClass(selectedMemberClaim.status)}`}>
                      {selectedMemberClaim.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{selectedMemberClaim.providerName}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:min-w-[320px]">
                  <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {formatDateDisplay(selectedMemberClaim.createdAt) || selectedMemberClaim.createdAt}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {formatCurrency(Number(selectedMemberClaim.amountSubmitted) || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Submitted Claim Details</h4>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Claim Category</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.category}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Visit Date</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {formatDateDisplay(selectedMemberClaim.visitDate) || selectedMemberClaim.visitDate}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider Name</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.providerName}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice / Receipt No</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.invoiceReceiptNo}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 md:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Diagnosis</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {selectedMemberClaim.diagnosis || "No diagnosis submitted"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Submitted Documents</h4>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 md:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Receipt Files</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedMemberClaim.receiptFiles.length > 0 ? (
                          selectedMemberClaim.receiptFiles.map((file) => (
                            <span
                              key={file}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                            >
                              {file}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">No receipt uploaded</span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Referral Letter</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.referralFileName || "Not uploaded"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">MC Document</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.mcFileName || "Not uploaded"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lab Result</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.rlFileName || "Not uploaded"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bank-In Slip</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.bankSlipFileName || "Not uploaded"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Member Information</h4>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Staff ID</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberRecord?.staffId || "Not linked"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {selectedMemberCompany?.name || selectedMemberRecord?.companyId || "Not linked"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Relationship</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberRecord?.relationship || "Employee"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plan</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">
                        {selectedMemberPlan ? formatPlanTypeLabel(selectedMemberPlan.type) : "Not configured"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Review Notes</h4>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rejection Reason</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.rejectionReason || "None"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked Dependents</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberDependents.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </MobileDetailModal>
      <MobileDetailModal
        open={!!selectedPatientClaim}
        onClose={() => setSelectedPatientClaimId(null)}
        title="Member Information"
        contentClassName="sm:max-w-4xl"
        subtitle={
          selectedPatientClaim ? (
            <>
              Claim: <span className="font-medium text-slate-700">{selectedPatientClaim.id}</span>
            </>
          ) : undefined
        }
      >
        {selectedPatientClaim && (
          <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4">
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-sky-200/30 blur-2xl" />
                <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-emerald-200/30 blur-2xl" />
                <div className="relative flex flex-col gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm border border-sky-100">
                        <span className="text-lg font-bold">
                        {selectedPatientClaim.patient
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                    </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-xl font-bold text-slate-800 truncate">{selectedPatientClaim.patient}</h4>
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200">
                            {selectedPatientRecord?.relationship || "Employee"}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                            {selectedPatientRecord?.status || "Unknown"}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 truncate">
                          {selectedPatientRecord?.email || "Not linked in mock directory yet"}
                        </p>
                      </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                      <CreditCard className="h-3.5 w-3.5" />
                      {selectedPatientRecord?.staffId || "Member ID Pending"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                      <Building2 className="h-3.5 w-3.5" />
                      {selectedPatientCompany?.name || selectedPatientRecord?.companyId || "Company Pending"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {selectedPatientRecord?.nationality || "Nationality Pending"}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
                      <Calendar className="h-3.5 w-3.5" />
                      DOB {formatDateDisplay(selectedPatientRecord?.dob || "") || "Not Available"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-4">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Member Profile</h4>
                      <span className="text-[11px] font-medium text-slate-400">Read-only</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Email</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 break-words">
                          {selectedPatientRecord?.email || "Not linked in mock directory yet"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Contact Number</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">
                          {formatPhoneForDisplay(selectedPatientRecord?.phone) || "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Date of Birth</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">
                          {formatDateDisplay(selectedPatientRecord?.dob || "") || "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Gender</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">{selectedPatientRecord?.gender || "—"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <CreditCard className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">NRIC / Passport</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">
                          {selectedPatientRecord?.nricPassport || selectedPatientRecord?.passportNo || "—"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Passport Expiry</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">
                          {formatDateDisplay(selectedPatientRecord?.passportExpiry || "") || "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-sky-500" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Dependent Details</h4>
                    </div>
                    {selectedPatientDependents.length > 0 ? (
                      <div className="space-y-3">
                        {selectedPatientDependents.map((dependent) => {
                          const dependentName = "fullName" in dependent ? dependent.fullName : dependent.name;
                          const dependentRelation = "staffId" in dependent ? dependent.relationship || "Dependent" : dependent.relation;
                          const dependentStatus = dependent.status || "Unknown";
                          const dependentGender = dependent.gender || "—";
                          const dependentDob = formatDateDisplay(dependent.dob || "") || dependent.dob || "—";
                          const dependentKey = "staffId" in dependent ? dependent.staffId : `${dependent.name}-${dependent.relation}`;

                          return (
                            <div
                              key={dependentKey}
                              className="rounded-xl bg-slate-50/80 border border-slate-100 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{dependentName}</p>
                                  <p className="text-xs text-slate-500">{dependentRelation}</p>
                                </div>
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  {dependentStatus}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gender</p>
                                  <p className="mt-0.5">{dependentGender}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Birth</p>
                                  <p className="mt-0.5">{dependentDob}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-4">
                        <p className="text-sm font-medium text-slate-700">No dependent records linked.</p>
                        <p className="mt-1 text-xs text-slate-500">No dependent details are available for this member in the current data.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Membership Summary</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Status</p>
                        <p className="mt-1 text-xs font-bold text-emerald-700">{selectedPatientRecord?.status || "Unknown"}</p>
                      </div>
                      <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-500">Relationship</p>
                        <p className="mt-1 text-xs font-bold text-sky-700">{selectedPatientRecord?.relationship || "Employee"}</p>
                      </div>
                      <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">Selected Benefits</p>
                        <p className="mt-1 text-xs font-bold text-violet-700">
                          {selectedPatientPlan ? countSelectedPlanBenefits(selectedPatientPlan).toString() : "0"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Configured Limits</p>
                        <p className="mt-1 text-xs font-bold text-amber-700">
                          {selectedPatientPlan ? countConfiguredPlanLimits(selectedPatientPlan).toString() : "0"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedPatientPlan && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-sky-500" />
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Plan Configuration</h4>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 border border-sky-100">
                          {formatPlanTypeLabel(selectedPatientPlan.type)}
                        </span>
                      </div>
                      {selectedPatientPlan.type === "lump_sum" ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Configured Limit</p>
                          <p className="mt-1 text-lg font-bold text-slate-800">
                            {formatCurrency(selectedPatientPlan.lumpSumLimit)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            All eligible claims draw down from one shared annual member balance.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedPatientPlan.categories
                            .filter((category) => category.selected)
                            .map((category) => (
                              <div key={category.key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{category.label}</p>
                                  <p className="text-[11px] text-slate-500">
                                    Company default {formatCurrency(category.companyLimit)}
                                  </p>
                                </div>
                                <p className="text-sm font-bold text-slate-800">{formatCurrency(category.limit)}</p>
                              </div>
                            ))}
                          {selectedPatientPlan.categories.every((category) => !category.selected) && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                              <p className="text-sm font-medium text-slate-700">No category limits selected for this member.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedPatientCompany && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-amber-500" />
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Coverage Rules</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Foreigner Policy</p>
                          <p className="mt-1 text-xs font-bold text-amber-700">
                            {selectedPatientCompany.planConfig.autoDisablePassport
                              ? "Auto-disable on passport expiry"
                              : "Manual passport review"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-purple-50 border border-purple-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Dependent Coverage</p>
                          <p className="mt-1 text-xs font-bold text-purple-700">
                            {selectedPatientCompany.planConfig.dependents.sharedLimit
                              ? "Share primary member limit"
                              : "Separate dependent allocation"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
        )}
      </MobileDetailModal>
      {lastRequestToken && (
        <div className="fixed bottom-4 right-4 z-[110]">
          <GlassCard className="px-4 py-3 flex items-center gap-3">
            <p className="text-sm text-slate-700">Request Update sent.</p>
            <GlassButton
              variant="secondary"
              onClick={() => {
                removeAdminClaimRequest(lastRequestToken);
                setLastRequestToken("");
              }}
            >
              Undo
            </GlassButton>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
