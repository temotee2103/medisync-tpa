"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { MobileDetailModal } from "@/components/ui/MobileDetailModal";
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Eye,
  Clock3,
  XCircle,
  AlertTriangle,
  Trash2,
  Calendar,
  Building2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { fetchAdminSession, type AdminSession } from "@/lib/adminSession";
import { ensureMemberSeed, getMemberDirectory } from "@/lib/memberSession";
import { ensureCompaniesStore, getCompaniesServerSnapshot, getCompaniesSnapshot, subscribeCompanies } from "@/lib/companyStore";
import {
  formatPlanTypeLabel,
  resolveMemberPlan,
} from "@/lib/memberPlan";
import { notifyClaimStatusEmail } from "@/lib/claimNotifications";
import {
  addAdminClaimRequest,
  deleteMemberClaim as removeMemberClaim,
  getMemberClaimsServerSnapshot,
  getMemberClaimsSnapshot,
  ensureMemberClaimsStore,
  refreshMemberClaimsSnapshot,
  removeAdminClaimRequest,
  subscribeMemberClaims,
  type MemberClaimRecord,
  updateMemberClaimStatus as saveMemberClaimStatus,
} from "@/lib/claimsStore";
import { CLAIM_STATUS } from "@/lib/claimFlow";
import {
  ensureProviderClaimsStore,
  getProviderClaimsServerSnapshot,
  getProviderClaimsSnapshot,
  refreshProviderClaimsSnapshot,
  subscribeProviderClaims,
  type ProviderClaimRecord,
  updateProviderClaimLifecycle,
} from "@/lib/providerClaimsStore";
import {
  formatUnifiedClaimStatus,
  normalizeUnifiedClaimStatus,
  type UnifiedClaimStatus,
  UNIFIED_CLAIM_STATUSES,
} from "@/lib/unifiedClaimLifecycle";
import { canDeleteAdminResource, canOperateAdminPage } from "@/lib/adminPermissions";

const getPrimaryStaffId = (staffId: string) =>
  staffId.includes("-DEP-") ? staffId.split("-DEP-")[0] : staffId;

const getLifecycleBadgeScheme = (status?: string): "success" | "warning" | "danger" | "neutral" | "info" => {
  switch (normalizeUnifiedClaimStatus(status)) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "in_process":
      return "info";
    case "request_additional_information":
      return "warning";
    case "submitted":
    default:
      return "neutral";
  }
};

const PROVIDER_LIFECYCLE_STATUSES = [
  "submitted",
  "request_additional_information",
  "in_process",
  "approved",
  "rejected",
] as const;

const getProviderLifecycleTimestamp = (claim: ProviderClaimRecord) =>
  claim.approvedAt || claim.reviewedAt || claim.submittedAt || claim.createdAt || claim.treatmentDate || "";

type ProviderLifecycleDialogAction = "rejected" | "request_additional_information";

type ClaimTarget = { id: string };
type ClaimsTab = "member" | "vendor";
type LifecycleFilterValue = "all" | UnifiedClaimStatus;
type LifecycleRow = {
  id: string;
  claimNumber: string;
  displayName: string;
  providerLabel: string;
  timestamp: string;
  amount: number;
  status: UnifiedClaimStatus;
  openHref?: string;
  onOpen?: () => void;
  actions: ReactNode;
};

const getClaimSubmittedAmount = (claim: MemberClaimRecord) => Number(claim.amountSubmitted) || 0;

const getMemberLifecycleTimestamp = (claim: MemberClaimRecord) =>
  claim.auditTrail?.[claim.auditTrail.length - 1]?.at || claim.createdAt || claim.visitDate;

const canMarkInProcess = (status?: string) => normalizeUnifiedClaimStatus(status) === "submitted";

const canRequestAdditionalInformation = (status?: string) =>
  ["submitted", "in_process"].includes(normalizeUnifiedClaimStatus(status));

const canReject = (status?: string) =>
  ["submitted", "in_process", "request_additional_information"].includes(normalizeUnifiedClaimStatus(status));

export default function ClaimsListPage() {
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const memberClaims = useSyncExternalStore(
    subscribeMemberClaims,
    getMemberClaimsSnapshot,
    getMemberClaimsServerSnapshot
  );
  const providerClaimsSnapshot = useSyncExternalStore(
    subscribeProviderClaims,
    getProviderClaimsSnapshot,
    getProviderClaimsServerSnapshot
  );
  const [activeTab, setActiveTab] = useState<ClaimsTab>("member");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<LifecycleFilterValue>("all");
  const [providerFilter, setProviderFilter] = useState("All");
  const [requestingClaimTarget, setRequestingClaimTarget] = useState<ClaimTarget | null>(null);
  const [rejectingClaimTarget, setRejectingClaimTarget] = useState<ClaimTarget | null>(null);
  const [selectedMemberClaimId, setSelectedMemberClaimId] = useState<string | null>(null);
  const [requestNote, setRequestNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [lastRequestToken, setLastRequestToken] = useState("");
  const [memberLifecycleError, setMemberLifecycleError] = useState("");
  const [memberLifecycleSubmittingId, setMemberLifecycleSubmittingId] = useState("");
  const [providerSubmissionError, setProviderSubmissionError] = useState("");
  const [providerLifecycleSubmittingId, setProviderLifecycleSubmittingId] = useState("");
  const [providerLifecycleDialog, setProviderLifecycleDialog] = useState<{
    claimId: string;
    action: Exclude<ProviderLifecycleDialogAction, "approved">;
  } | null>(null);
  const [providerLifecycleNote, setProviderLifecycleNote] = useState("");
  const memberDirectory = useMemo(() => {
    ensureMemberSeed();
    return getMemberDirectory();
  }, []);
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const canOperateClaimsPage = adminSession ? canOperateAdminPage(adminSession.role, "/admin/claims") : false;
  const canDeleteClaims = adminSession ? canDeleteAdminResource(adminSession.role) : false;

  useEffect(() => {
    void fetchAdminSession().then((session) => setAdminSession(session));
    ensureCompaniesStore();
    ensureMemberClaimsStore();
    ensureProviderClaimsStore();
    refreshMemberClaimsSnapshot();
    void refreshProviderClaimsSnapshot();
  }, []);

  const filteredMemberClaims = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return memberClaims.filter((claim) => {
      const lifecycleStatus = claim.lifecycleStatus || normalizeUnifiedClaimStatus(claim.status);
      const matchesSearch =
        !normalizedSearch ||
        claim.patient.toLowerCase().includes(normalizedSearch) ||
        claim.id.toLowerCase().includes(normalizedSearch) ||
        claim.providerName.toLowerCase().includes(normalizedSearch) ||
        claim.invoiceReceiptNo.toLowerCase().includes(normalizedSearch) ||
        claim.category.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || lifecycleStatus === statusFilter;
      const matchesProvider = providerFilter === "All" || claim.providerName === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
  }, [memberClaims, providerFilter, searchTerm, statusFilter]);
  const providerSubmissions = useMemo(
    () =>
      providerClaimsSnapshot
        .filter((claim) =>
          PROVIDER_LIFECYCLE_STATUSES.includes(
            normalizeUnifiedClaimStatus(claim.status) as (typeof PROVIDER_LIFECYCLE_STATUSES)[number]
          )
        )
        .sort((left, right) => {
          const leftTime = new Date(getProviderLifecycleTimestamp(left)).getTime();
          const rightTime = new Date(getProviderLifecycleTimestamp(right)).getTime();
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        }),
    [providerClaimsSnapshot]
  );
  const filteredProviderSubmissions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return providerSubmissions.filter((claim) => {
      const lifecycleStatus = normalizeUnifiedClaimStatus(claim.status);
      const claimNumber = claim.claimNumber || claim.id;
      const matchesSearch =
        !normalizedSearch ||
        claimNumber.toLowerCase().includes(normalizedSearch) ||
        (claim.patientName || "").toLowerCase().includes(normalizedSearch) ||
        (claim.providerName || "").toLowerCase().includes(normalizedSearch) ||
        (claim.invoiceNumber || "").toLowerCase().includes(normalizedSearch) ||
        (claim.serviceType || "").toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || lifecycleStatus === statusFilter;
      const matchesProvider = providerFilter === "All" || (claim.providerName || "Unknown provider") === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
  }, [providerFilter, providerSubmissions, searchTerm, statusFilter]);
  const selectedProviderLifecycleClaim = useMemo(
    () =>
      providerLifecycleDialog
        ? providerClaimsSnapshot.find((claim) => claim.id === providerLifecycleDialog.claimId) || null
        : null,
    [providerClaimsSnapshot, providerLifecycleDialog]
  );

  const tabStats = useMemo(
    () => ({
      member: {
        total: memberClaims.length,
        submitted: memberClaims.filter(
          (claim) => (claim.lifecycleStatus || normalizeUnifiedClaimStatus(claim.status)) === "submitted"
        ).length,
      },
      vendor: {
        total: providerClaimsSnapshot.length,
        open: providerClaimsSnapshot.filter((claim) =>
          ["submitted", "request_additional_information", "in_process"].includes(normalizeUnifiedClaimStatus(claim.status))
        ).length,
      },
    }),
    [memberClaims, providerClaimsSnapshot]
  );

  const requestingClaim = useMemo(() => {
    if (!requestingClaimTarget) return null;
    return memberClaims.find((claim) => claim.id === requestingClaimTarget.id) || null;
  }, [memberClaims, requestingClaimTarget]);
  const rejectingClaim = useMemo(() => {
    if (!rejectingClaimTarget) return null;
    return memberClaims.find((claim) => claim.id === rejectingClaimTarget.id) || null;
  }, [memberClaims, rejectingClaimTarget]);
  const selectedMemberClaim = useMemo(
    () => memberClaims.find((claim) => claim.id === selectedMemberClaimId) || null,
    [memberClaims, selectedMemberClaimId]
  );
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
      return [];
    }

    const primaryStaffId = getPrimaryStaffId(selectedMemberRecord.staffId);
    const linkedDependents = memberDirectory.filter(
      (entry) =>
        entry.companyId === selectedMemberRecord.companyId &&
        entry.staffId.startsWith(`${primaryStaffId}-DEP-`)
    );

    if (linkedDependents.length > 0) return linkedDependents;
    if (!selectedMemberClaim) return [];
    return [];
  }, [memberDirectory, selectedMemberClaim, selectedMemberRecord]);
  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setProviderFilter("All");
  };
  const closeProviderLifecycleDialog = () => {
    setProviderLifecycleDialog(null);
    setProviderLifecycleNote("");
    setProviderSubmissionError("");
  };
  const openProviderLifecycleDialog = useCallback((claim: ProviderClaimRecord, action: ProviderLifecycleDialogAction) => {
    if (!canOperateClaimsPage) return;
    setProviderLifecycleDialog({ claimId: claim.id, action });
    setProviderLifecycleNote(claim.reviewNote || "");
    setProviderSubmissionError("");
  }, [canOperateClaimsPage]);
  const markProviderClaimInProcess = useCallback((providerClaimId: string) => {
    void (async () => {
      try {
        if (!canOperateClaimsPage) return;
        if (!adminSession?.profileId) {
          setProviderSubmissionError("Unable to identify the current admin reviewer.");
          return;
        }

        setProviderSubmissionError("");
        setProviderLifecycleSubmittingId(providerClaimId);
        await updateProviderClaimLifecycle(providerClaimId, {
          status: CLAIM_STATUS.IN_PROCESS,
          reviewed_at: new Date().toISOString(),
          reviewed_by_profile_id: adminSession.profileId,
          review_note: null,
          approval_attachment_path: null,
          approval_attachment_name: null,
          approved_at: null,
        });
      } catch (error) {
        setProviderSubmissionError(
          error instanceof Error ? error.message : "Unable to mark this provider claim in process."
        );
      } finally {
        setProviderLifecycleSubmittingId("");
      }
    })();
  }, [adminSession?.profileId, canOperateClaimsPage]);
  const submitProviderLifecycleDialog = () => {
    void (async () => {
      try {
        if (!canOperateClaimsPage) return;
        if (!providerLifecycleDialog) return;
        if (!adminSession?.profileId) {
          setProviderSubmissionError("Unable to identify the current admin reviewer.");
          return;
        }

        const nowIso = new Date().toISOString();
        const note = providerLifecycleNote.trim();
        if (providerLifecycleDialog.action === "rejected" && !note) {
          setProviderSubmissionError("Please provide a rejection reason.");
          return;
        }
        if (providerLifecycleDialog.action === "request_additional_information" && !note) {
          setProviderSubmissionError("Please explain what additional information is needed.");
          return;
        }
        setProviderSubmissionError("");
        setProviderLifecycleSubmittingId(providerLifecycleDialog.claimId);
        if (providerLifecycleDialog.action === "rejected") {
          await updateProviderClaimLifecycle(providerLifecycleDialog.claimId, {
            status: "rejected",
            reviewed_at: nowIso,
            reviewed_by_profile_id: adminSession.profileId,
            review_note: note,
          });
        } else if (providerLifecycleDialog.action === "request_additional_information") {
          await updateProviderClaimLifecycle(providerLifecycleDialog.claimId, {
            status: "request_additional_information",
            reviewed_at: nowIso,
            reviewed_by_profile_id: adminSession.profileId,
            review_note: note,
          });
        }
        closeProviderLifecycleDialog();
      } catch (error) {
        setProviderSubmissionError(
          error instanceof Error ? error.message : "Unable to update this provider claim."
        );
      } finally {
        setProviderLifecycleSubmittingId("");
      }
    })();
  };
  const openRequestModal = useCallback((claimId: string) => {
    if (!canOperateClaimsPage) return;
    setRequestingClaimTarget({ id: claimId });
    setRequestNote("");
  }, [canOperateClaimsPage]);
  const openRejectModal = useCallback((claimId: string, reason?: string) => {
    if (!canOperateClaimsPage) return;
    setRejectingClaimTarget({ id: claimId });
    setRejectionReason(reason || "");
  }, [canOperateClaimsPage]);

  const saveClaimStatus = useCallback(
    async (
      target: ClaimTarget,
      nextStatus: string,
      options?: {
        rejectionReason?: string;
        note?: string;
        bankSlipFileName?: string;
        bankSlipDataUrl?: string;
        bankSlipUploadedAt?: string;
      }
    ) => {
      if (!canOperateClaimsPage) return;
      const previousClaim = memberClaims.find((claim) => claim.id === target.id) || null;
      const previousStatus = previousClaim
        ? formatUnifiedClaimStatus(previousClaim.lifecycleStatus || previousClaim.status)
        : "";

      await saveMemberClaimStatus(target.id, nextStatus, options);

      const nextStatusLabel = formatUnifiedClaimStatus(nextStatus);
      if (!previousClaim || previousStatus === nextStatusLabel) return;

      const to =
        memberDirectory.find((entry) => entry.staffId === previousClaim.patientId)?.email ||
        memberDirectory.find((entry) => entry.fullName === previousClaim.patient)?.email ||
        "";

      if (!to) return;

      const subject = `Claim ${previousClaim.id} status updated: ${previousStatus} → ${nextStatusLabel}`;
      const reasonLine =
        normalizeUnifiedClaimStatus(nextStatus) === "rejected" && options?.rejectionReason?.trim()
          ? `\n\nRejection reason:\n${options.rejectionReason.trim()}`
          : "";
      const text = [
        `Claim ID: ${previousClaim.id}`,
        "Claim type: Member reimbursement",
        `Patient: ${previousClaim.patient}`,
        `Provider: ${previousClaim.providerName}`,
        `Status: ${previousStatus} → ${nextStatusLabel}`,
      ].join("\n") + reasonLine;

      void notifyClaimStatusEmail({ to, subject, text });
    },
    [canOperateClaimsPage, memberClaims, memberDirectory]
  );

  const deleteClaim = useCallback(async (target: ClaimTarget) => {
    if (!canDeleteClaims) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete claim ${target.id}? This action cannot be undone in mock view.`)
    ) {
      return;
    }
    await removeMemberClaim(target.id);
  }, [canDeleteClaims]);

  const markMemberClaimInProcess = useCallback((claimId: string) => {
    void (async () => {
      try {
        if (!canOperateClaimsPage) return;
        setMemberLifecycleError("");
        setMemberLifecycleSubmittingId(claimId);
        await saveClaimStatus({ id: claimId }, CLAIM_STATUS.IN_PROCESS);
      } catch (error) {
        setMemberLifecycleError(error instanceof Error ? error.message : "Unable to mark this member claim in process.");
      } finally {
        setMemberLifecycleSubmittingId("");
      }
    })();
  }, [canOperateClaimsPage, saveClaimStatus]);

  const renderMemberLifecycleActions = useCallback(
    (claim: MemberClaimRecord) => {
      const status = claim.lifecycleStatus || normalizeUnifiedClaimStatus(claim.status);
      return (
        <>
          <GlassButton
            variant="ghost"
            className="h-9 w-9 p-0 inline-flex items-center justify-center text-sky-600 hover:text-sky-700"
            title="Review Claim"
            aria-label="Review Claim"
            onClick={() => setSelectedMemberClaimId(claim.id)}
          >
            <Eye className="w-4 h-4" />
          </GlassButton>
          {canOperateClaimsPage && (
            <>
              <GlassButton
                variant="ghost"
                className="h-9 w-9 p-0 inline-flex items-center justify-center text-sky-700 hover:text-sky-800 disabled:text-slate-300 disabled:hover:text-slate-300"
                title="Mark In Process"
                aria-label="Mark In Process"
                disabled={memberLifecycleSubmittingId === claim.id || !canMarkInProcess(status)}
                onClick={() => markMemberClaimInProcess(claim.id)}
              >
                <Clock3 className="w-4 h-4" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-9 w-9 p-0 inline-flex items-center justify-center text-amber-600 hover:text-amber-700 disabled:text-slate-300 disabled:hover:text-slate-300"
                title="Request Additional Information"
                aria-label="Request Additional Information"
                disabled={memberLifecycleSubmittingId === claim.id || !canRequestAdditionalInformation(status)}
                onClick={() => openRequestModal(claim.id)}
              >
                <AlertTriangle className="w-4 h-4" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-9 w-9 p-0 inline-flex items-center justify-center text-rose-600 hover:text-rose-700 disabled:text-slate-300 disabled:hover:text-slate-300"
                title="Reject Claim"
                aria-label="Reject Claim"
                disabled={memberLifecycleSubmittingId === claim.id || !canReject(status)}
                onClick={() => openRejectModal(claim.id, claim.rejectionReason)}
              >
                <XCircle className="w-4 h-4" />
              </GlassButton>
            </>
          )}
          {canDeleteClaims && (
            <GlassButton
              variant="ghost"
              className="h-9 w-9 p-0 inline-flex items-center justify-center text-slate-500 hover:text-rose-700"
              title="Delete Claim"
              aria-label="Delete Claim"
              onClick={() => {
                void deleteClaim({ id: claim.id });
              }}
            >
              <Trash2 className="w-4 h-4" />
            </GlassButton>
          )}
        </>
      );
    },
    [
      canDeleteClaims,
      canOperateClaimsPage,
      deleteClaim,
      markMemberClaimInProcess,
      memberLifecycleSubmittingId,
      openRejectModal,
      openRequestModal,
    ]
  );

  const renderProviderLifecycleActions = useCallback(
    (claim: ProviderClaimRecord) => {
      const status = normalizeUnifiedClaimStatus(claim.status);
      return (
        <>
          <Link href={`/admin/claims/${claim.id}`}>
            <GlassButton
              variant="ghost"
              className="h-9 w-9 border-transparent bg-transparent px-0 text-sky-700 shadow-none hover:bg-transparent hover:text-sky-800"
              title="Review Claim"
              aria-label="Review Claim"
            >
              <Eye className="h-4 w-4" />
            </GlassButton>
          </Link>
          {canOperateClaimsPage && (
            <>
              <GlassButton
                variant="ghost"
                className="h-9 w-9 border-transparent bg-transparent px-0 text-sky-700 shadow-none hover:bg-transparent hover:text-sky-800"
                title="Mark In Process"
                aria-label="Mark In Process"
                disabled={providerLifecycleSubmittingId === claim.id || !canMarkInProcess(status)}
                onClick={() => markProviderClaimInProcess(claim.id)}
              >
                <Clock3 className="h-4 w-4" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-9 w-9 border-transparent bg-transparent px-0 text-amber-600 shadow-none hover:bg-transparent hover:text-amber-700"
                title="Request Additional Information"
                aria-label="Request Additional Information"
                disabled={providerLifecycleSubmittingId === claim.id || !canRequestAdditionalInformation(status)}
                onClick={() => openProviderLifecycleDialog(claim, "request_additional_information")}
              >
                <AlertTriangle className="h-4 w-4" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-9 w-9 border-transparent bg-transparent px-0 text-rose-700 shadow-none hover:bg-transparent hover:text-rose-800"
                title="Reject Claim"
                aria-label="Reject Claim"
                disabled={providerLifecycleSubmittingId === claim.id || !canReject(status)}
                onClick={() => openProviderLifecycleDialog(claim, "rejected")}
              >
                <XCircle className="h-4 w-4" />
              </GlassButton>
            </>
          )}
        </>
      );
    },
    [canOperateClaimsPage, markProviderClaimInProcess, openProviderLifecycleDialog, providerLifecycleSubmittingId]
  );

  const renderFilterFields = () => (
    <>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Status</label>
        <GlassSelect
          value={statusFilter}
          options={[
            { label: "All", value: "all" },
            ...UNIFIED_CLAIM_STATUSES.map((status) => ({
              label: formatUnifiedClaimStatus(status),
              value: status,
            })),
          ]}
          onChange={(value) => setStatusFilter(value as LifecycleFilterValue)}
          placeholder="Status"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Clinic / Provider</label>
        <GlassSelect
          value={providerFilter}
          options={providerOptions.map((provider) => ({
            label: provider,
            value: provider,
          }))}
          onChange={(value) => setProviderFilter(value)}
          placeholder="Clinic / Provider"
        />
      </div>
    </>
  );

  const providerOptions = useMemo(() => {
    const source = activeTab === "member" ? memberClaims : providerSubmissions;
    const values = source
      .map((claim) => ("providerName" in claim ? claim.providerName : undefined) || "Unknown provider")
      .filter(Boolean);
    return ["All", ...Array.from(new Set(values)).sort()];
  }, [activeTab, memberClaims, providerSubmissions]);

  const memberLifecycleRows = useMemo<LifecycleRow[]>(
    () =>
      filteredMemberClaims.map((claim) => ({
        id: claim.id,
        claimNumber: claim.id,
        displayName: claim.patient,
        providerLabel: claim.providerName,
        timestamp: getMemberLifecycleTimestamp(claim),
        amount: getClaimSubmittedAmount(claim),
        status: claim.lifecycleStatus || normalizeUnifiedClaimStatus(claim.status),
        onOpen: () => setSelectedMemberClaimId(claim.id),
        actions: renderMemberLifecycleActions(claim),
      })),
    [filteredMemberClaims, renderMemberLifecycleActions]
  );

  const vendorLifecycleRows = useMemo<LifecycleRow[]>(
    () =>
      filteredProviderSubmissions.map((claim) => ({
        id: claim.id,
        claimNumber: claim.claimNumber || claim.id.slice(0, 8).toUpperCase(),
        displayName: claim.patientName || "Unlinked member",
        providerLabel: claim.providerName || "Unknown provider",
        timestamp: getProviderLifecycleTimestamp(claim),
        amount: claim.totalAmount,
        status: normalizeUnifiedClaimStatus(claim.status),
        openHref: `/admin/claims/${claim.id}`,
        actions: renderProviderLifecycleActions(claim),
      })),
    [filteredProviderSubmissions, renderProviderLifecycleActions]
  );

  const activeLifecycleRows = activeTab === "member" ? memberLifecycleRows : vendorLifecycleRows;
  const activeLifecycleTitle = activeTab === "member" ? "Member Claims" : "Vendor Claims";
  const activeLifecycleDescription =
    activeTab === "member"
      ? "Unified lifecycle view for member reimbursement submissions."
      : "Unified lifecycle view for provider submissions from `provider_claims`.";
  const activeSearchPlaceholder =
    activeTab === "member"
      ? "Search by claim ID, patient, provider, invoice, or category"
      : "Search by claim no., patient, provider, invoice, or service type";

  const renderLifecycleTable = (rows: LifecycleRow[], emptyMessage: string) => (
    <GlassCard className="overflow-hidden p-0 border-white/40">
      <div className="px-6 py-4 border-b border-white/60 bg-white/40 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{activeLifecycleTitle}</h2>
          <p className="text-sm text-slate-500">{activeLifecycleDescription}</p>
        </div>
        <span className="text-sm font-medium text-slate-500">{rows.length} result(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/40 border-b border-slate-100">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Claim No.</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Patient / Member</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Clinic / Provider</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Latest Activity</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-6 py-4">
                  {row.openHref ? (
                    <Link href={row.openHref} className="font-mono text-sm font-semibold text-slate-700 hover:text-sky-700 transition-colors">
                      {row.claimNumber}
                    </Link>
                  ) : row.onOpen ? (
                    <button
                      type="button"
                      className="font-mono text-sm font-semibold text-slate-700 hover:text-sky-700 transition-colors"
                      onClick={row.onOpen}
                    >
                      {row.claimNumber}
                    </button>
                  ) : (
                    <span className="font-mono text-sm font-semibold text-slate-700">{row.claimNumber}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-800">{row.displayName}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{row.providerLabel}</td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {formatDateDisplay(row.timestamp) || row.timestamp}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-800 text-right">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-6 py-4">
                  <StatusBadge
                    status={formatUnifiedClaimStatus(row.status)}
                    scheme={getLifecycleBadgeScheme(row.status)}
                  />
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1.5">{row.actions}</div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );

  const renderLifecycleCards = (rows: LifecycleRow[], emptyMessage: string) => (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-slate-400">{emptyMessage}</GlassCard>
      ) : (
        rows.map((row) => (
          <MobileRecordCard
            key={row.id}
            title={
              row.openHref ? (
                <Link href={row.openHref} className="font-mono text-slate-800 hover:text-sky-700 transition-colors">
                  {row.claimNumber}
                </Link>
              ) : row.onOpen ? (
                <button type="button" className="font-mono text-slate-800 hover:text-sky-700 transition-colors" onClick={row.onOpen}>
                  {row.claimNumber}
                </button>
              ) : (
                <span className="font-mono">{row.claimNumber}</span>
              )
            }
            subtitle={row.providerLabel}
            badge={
              <StatusBadge
                status={formatUnifiedClaimStatus(row.status)}
                scheme={getLifecycleBadgeScheme(row.status)}
              />
            }
            meta={
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateDisplay(row.timestamp) || row.timestamp}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-1 font-semibold text-slate-700">
                  {formatCurrency(row.amount)}
                </span>
              </>
            }
            footer={<div className="flex flex-wrap justify-end gap-1.5">{row.actions}</div>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient / Member</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{row.displayName}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Clinic / Provider</p>
                <p className="mt-1 text-sm text-slate-700">{row.providerLabel}</p>
              </div>
            </div>
          </MobileRecordCard>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Claims Management</h1>
          <p className="text-slate-500">Manage member reimbursement claims and the unified provider claim lifecycle in one workspace.</p>
        </div>
      </div>
      {adminSession && !canOperateClaimsPage ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You have read-only access on Claims Management. Review is available, but status changes and deletion are disabled.
        </p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <button
          type="button"
          className="text-left"
          onClick={() => setActiveTab("member")}
        >
          <GlassCard
            className={`p-4 transition-all ${
              activeTab === "member"
                ? "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 ring-2 ring-sky-100"
                : "border-slate-100 bg-white/80 hover:border-sky-100"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-sky-600">Member Claims</p>
                <h2 className="text-xl font-bold text-slate-800">Reimbursement submissions from members</h2>
                <p className="text-sm text-slate-500">Use the unified lifecycle list for review, request info, in-process handoff, and approval.</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-3 shadow-sm border border-sky-100">
                <Users className="h-5 w-5 text-sky-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 border border-sky-100">
                {tabStats.member.total} total
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                {tabStats.member.submitted} submitted
              </span>
            </div>
          </GlassCard>
        </button>

        <button
          type="button"
          className="text-left"
          onClick={() => setActiveTab("vendor")}
        >
          <GlassCard
            className={`p-4 transition-all ${
              activeTab === "vendor"
                ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 ring-2 ring-emerald-100"
                : "border-slate-100 bg-white/80 hover:border-emerald-100"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-emerald-600">Vendor Claims</p>
                <h2 className="text-xl font-bold text-slate-800">Provider lifecycle from `provider_claims`</h2>
                <p className="text-sm text-slate-500">Keep vendor claims on the `provider_claims` source of truth while using the same list pattern and action model.</p>
              </div>
              <div className="rounded-2xl bg-white/80 p-3 shadow-sm border border-emerald-100">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-700 border border-emerald-100">
                {tabStats.vendor.total} tracked
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                {tabStats.vendor.open} open
              </span>
            </div>
          </GlassCard>
        </button>
      </div>

      <GlassCard className="hidden lg:block p-5 space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <SlidersHorizontal className="w-4 h-4 text-sky-500" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Filter {activeTab === "member" ? "Member Claims" : "Vendor Claims"}
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <input
                type="text"
                placeholder={activeSearchPlaceholder}
                className="w-full glass-input pl-10 pr-4 py-2.5"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          {renderFilterFields()}
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
          <input
            type="text"
            placeholder={activeSearchPlaceholder}
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
        <p className="text-xs text-slate-500">{activeLifecycleRows.length} result(s)</p>
      </GlassCard>

      {activeTab === "member" && memberLifecycleError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {memberLifecycleError}
        </p>
      ) : null}
      {activeTab === "vendor" && providerSubmissionError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {providerSubmissionError}
        </p>
      ) : null}

      <ResponsiveDataView
        desktop={renderLifecycleTable(
          activeLifecycleRows,
          activeTab === "member"
            ? "No member claims found matching the selected filters."
            : "No vendor claims found matching the selected filters."
        )}
        mobile={renderLifecycleCards(
          activeLifecycleRows,
          activeTab === "member"
            ? "No member claims found matching the selected filters."
            : "No vendor claims found matching the selected filters."
        )}
      />
      {providerLifecycleDialog && selectedProviderLifecycleClaim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeProviderLifecycleDialog} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">
                {providerLifecycleDialog.action === "rejected"
                  ? "Reject Provider Claim"
                  : "Request Additional Information"}
              </h3>
              <p className="text-sm text-slate-500">
                Claim:{" "}
                <span className="font-medium text-slate-700">
                  {selectedProviderLifecycleClaim.claimNumber || selectedProviderLifecycleClaim.id}
                </span>{" "}
                for {selectedProviderLifecycleClaim.patientName || "Unknown patient"}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  {providerLifecycleDialog.action === "rejected"
                    ? "Rejection Reason"
                    : "Information Needed"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full glass-input p-3 text-sm h-32 resize-none"
                  placeholder={
                    providerLifecycleDialog.action === "rejected"
                      ? "State the rejection reason clearly for the provider."
                      : "Explain what additional information is needed."
                  }
                  value={providerLifecycleNote}
                  onChange={(event) => setProviderLifecycleNote(event.target.value)}
                />
              </div>
              {providerSubmissionError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {providerSubmissionError}
                </p>
              ) : null}
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={closeProviderLifecycleDialog}>
                Cancel
              </GlassButton>
              <GlassButton
                disabled={providerLifecycleSubmittingId === selectedProviderLifecycleClaim.id}
                onClick={submitProviderLifecycleDialog}
              >
                {providerLifecycleDialog.action === "rejected" ? "Confirm Reject" : "Send Request"}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      {requestingClaim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
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
                <p className="text-xs text-slate-400">Keep the message short and actionable for the member.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setRequestingClaimTarget(null)}>Cancel</GlassButton>
              <GlassButton
                disabled={!requestNote.trim()}
                onClick={async () => {
                  const token = `${requestingClaim.id}-${Date.now()}`;
                  addAdminClaimRequest({ token, id: requestingClaim.id, note: requestNote.trim(), createdAt: new Date().toISOString() });
                  if (!requestingClaimTarget) return;
                  await saveClaimStatus(requestingClaimTarget, CLAIM_STATUS.MORE_INFORMATION, {
                    note: requestNote.trim(),
                  });
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
      {rejectingClaim && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
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
                onClick={async () => {
                  if (!rejectingClaimTarget) return;
                  await saveClaimStatus(rejectingClaimTarget, CLAIM_STATUS.REJECTED, { rejectionReason });
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
                    <StatusBadge
                      status={formatUnifiedClaimStatus(selectedMemberClaim.lifecycleStatus || selectedMemberClaim.status)}
                      scheme={getLifecycleBadgeScheme(selectedMemberClaim.lifecycleStatus || selectedMemberClaim.status)}
                    />
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
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PV File</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMemberClaim.pvFileName || "Not uploaded"}</p>
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
