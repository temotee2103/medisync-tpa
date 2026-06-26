"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchAdminSession, type AdminSession } from "@/lib/adminSession";
import { ArrowLeft, FileText, CheckCircle, XCircle, AlertTriangle, Download, Maximize2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { downloadText } from "@/lib/download";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { CLAIM_STATUS } from "@/lib/claimFlow";
import { notifyClaimStatusEmail } from "@/lib/claimNotifications";
import { getProviderClaimSignedUrl } from "@/lib/providerClaimStorage";
import { canDeleteAdminResource, canOperateAdminPage } from "@/lib/adminPermissions";
import {
  ensureProviderClaimsStore,
  getProviderClaimByClaimNumber,
  getProviderClaimById,
  getProviderClaimDocuments,
  getProviderClaimsSnapshot,
  refreshProviderClaimsSnapshot,
  subscribeProviderClaims,
  updateProviderClaimLifecycle,
} from "@/lib/providerClaimsStore";
import { ensureProviderSeed, getProviderDirectory } from "@/lib/providerSession";
import {
  addAdminClaimRequest,
  deleteMemberClaim as removeMemberClaim,
  getAdminClaimsSnapshot,
  refreshAdminClaimsSnapshot,
  removeAdminClaimRequest,
  subscribeAdminClaims,
  updateAdminClaimStatus,
} from "@/lib/claimsStore";
import { formatUnifiedClaimStatus, normalizeUnifiedClaimStatus } from "@/lib/unifiedClaimLifecycle";

type ClaimDetailClientProps = {
  claimId: string;
};

const chargeSections = [
  { key: "medication", label: "Medication" },
  { key: "injection", label: "Injection" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "procedure", label: "Procedure" },
  { key: "immunization", label: "Immunization" },
] as const;

const normalizeProviderClaimStatus = (status?: string) => String(status || "").trim().toLowerCase();

const formatProviderClaimStatusLabel = (status?: string) => {
  switch (normalizeProviderClaimStatus(status)) {
    case "in_process":
      return "In Process";
    case "request_additional_information":
      return "Request Additional Information";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return "Submitted";
  }
};

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

const getProviderBadgeScheme = (status?: string): "success" | "warning" | "danger" | "neutral" | "info" => {
  switch (normalizeProviderClaimStatus(status)) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "in_process":
      return "info";
    case "request_additional_information":
      return "warning";
    default:
      return "neutral";
  }
};

export default function ClaimDetailClient({ claimId }: ClaimDetailClientProps) {
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const router = useRouter();
  const claims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsSnapshot
  );
  useSyncExternalStore(
    subscribeProviderClaims,
    getProviderClaimsSnapshot,
    getProviderClaimsSnapshot
  );
  const claim = useMemo(() => claims.find((entry) => entry.id === claimId) || null, [claimId, claims]);
  const providerClaim = getProviderClaimById(claimId) || getProviderClaimByClaimNumber(claimId);
  const providerClaimDocuments = providerClaim ? getProviderClaimDocuments(providerClaim.id) : [];
  const diagnosisList = claim?.diagnosisCodes?.length ? claim.diagnosisCodes : claim?.diagnosis ? [claim.diagnosis] : [];
  const selectedChargeItems = useMemo(() => claim?.selectedChargeItems || {}, [claim?.selectedChargeItems]);
  const memberUnifiedStatus = useMemo(
    () => normalizeUnifiedClaimStatus(claim?.lifecycleStatus || claim?.status),
    [claim?.lifecycleStatus, claim?.status]
  );
  const providerDirectory = useMemo(() => {
    ensureProviderSeed();
    return getProviderDirectory();
  }, []);
  const providerContactEmail = useMemo(() => {
    if (!claim?.hospital) return "";
    return providerDirectory.find((entry) => entry.providerName === claim.hospital)?.contactEmail || "";
  }, [claim?.hospital, providerDirectory]);
  const chargeBreakdown = useMemo(
    () =>
      [
        { key: "medication", label: "Medication", amount: Number(claim?.medicationFee || 0) },
        { key: "injection", label: "Injection", amount: Number(claim?.injectionFee || 0) },
        { key: "diagnosis", label: "Diagnosis", amount: Number(claim?.diagnosisFee || 0) },
        { key: "procedure", label: "Procedure", amount: Number(claim?.procedureFee || 0) },
        { key: "immunization", label: "Immunization", amount: Number(claim?.immunizationFee || 0) },
      ].filter((entry) => entry.amount > 0 || (selectedChargeItems[entry.key] || []).length > 0),
    [claim, selectedChargeItems]
  );
  const canOperateClaimsPage = adminSession ? canOperateAdminPage(adminSession.role, "/admin/claims") : false;
  const canDeleteClaims = adminSession ? canDeleteAdminResource(adminSession.role) : false;
  const canMarkInProcess = !!claim && memberUnifiedStatus === CLAIM_STATUS.SUBMITTED;
  const canRequestInfo =
    !!claim &&
    (memberUnifiedStatus === CLAIM_STATUS.SUBMITTED || memberUnifiedStatus === CLAIM_STATUS.IN_PROCESS);
  const canReject =
    !!claim &&
    (memberUnifiedStatus === CLAIM_STATUS.SUBMITTED ||
      memberUnifiedStatus === CLAIM_STATUS.IN_PROCESS ||
      memberUnifiedStatus === CLAIM_STATUS.MORE_INFORMATION);
  const [activeTab, setActiveTab] = useState<"details" | "coverage">("details");
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [lastRequestToken, setLastRequestToken] = useState("");
  const [flowError, setFlowError] = useState("");
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [providerReviewNote, setProviderReviewNote] = useState("");
  const [providerActionPending, setProviderActionPending] = useState(false);

  useEffect(() => {
    void fetchAdminSession().then((session) => setAdminSession(session));
    void refreshAdminClaimsSnapshot();
    ensureProviderClaimsStore();
    void refreshProviderClaimsSnapshot();
  }, []);

  useEffect(() => {
    if (!providerClaim) {
      setProviderReviewNote("");
      return;
    }

    setProviderReviewNote(providerClaim.reviewNote || "");
  }, [providerClaim]);

  const notifyProviderStatus = (fromStatus: string, toStatus: string, note?: string) => {
    if (!providerContactEmail) return;
    if (fromStatus === toStatus) return;

    const subject = `Claim ${claimId} status updated: ${fromStatus} → ${toStatus}`;
    const noteLine = note?.trim() ? `\n\nNote:\n${note.trim()}` : "";
    const text =
      [
        `Claim ID: ${claimId}`,
        `Claim type: Provider cashless`,
        `Patient: ${claim?.patient || ""}`,
        `Provider: ${claim?.hospital || ""}`,
        `Status: ${fromStatus} → ${toStatus}`,
      ].join("\n") + noteLine;

    void notifyClaimStatusEmail({ to: providerContactEmail, subject, text });
  };
  const closeRejectModal = () => {
    setIsRejectOpen(false);
    setRejectionReason("");
  };
  const markInProcess = () => {
    void (async () => {
      try {
        if (!canOperateClaimsPage) {
          setFlowError("You have read-only access on Claims Management.");
          return;
        }
        setFlowError("");
        const fromStatus = claim?.status || "";
        await updateAdminClaimStatus(claimId, CLAIM_STATUS.IN_PROCESS);
        notifyProviderStatus(fromStatus, formatUnifiedClaimStatus(CLAIM_STATUS.IN_PROCESS));
      } catch (error) {
        setFlowError(error instanceof Error ? error.message : "Unable to mark this claim in process.");
      }
    })();
  };
  const rejectClaim = () => {
    if (!canOperateClaimsPage) {
      setFlowError("You have read-only access on Claims Management.");
      return;
    }
    if (!rejectionReason.trim()) {
      setFlowError("Please provide a rejection reason.");
      return;
    }
    void (async () => {
      try {
        setFlowError("");
        const fromStatus = claim?.status || "";
        await updateAdminClaimStatus(claimId, CLAIM_STATUS.REJECTED, {
          rejectionReason: rejectionReason.trim(),
        });
        notifyProviderStatus(fromStatus, formatUnifiedClaimStatus(CLAIM_STATUS.REJECTED), rejectionReason);
        closeRejectModal();
      } catch (error) {
        setFlowError(error instanceof Error ? error.message : "Unable to reject this claim.");
      }
    })();
  };
  const deleteClaim = () => {
    void (async () => {
      try {
        if (!canDeleteClaims) {
          setFlowError("Only super admin can delete claims.");
          return;
        }
        if (
          typeof window !== "undefined" &&
          !window.confirm(`Delete claim ${claimId}? This action cannot be undone in mock view.`)
        ) {
          return;
        }
        setFlowError("");
        await removeMemberClaim(claimId);
        router.push("/admin/claims");
      } catch (error) {
        setFlowError(error instanceof Error ? error.message : "Unable to delete this claim.");
      }
    })();
  };
  const openPreviewTab = () => {
    if (typeof window === "undefined") return;
    if (!claim) return;
    const html = `
      <html>
        <head><title>Document Preview - ${claimId}</title></head>
        <body style="font-family:Arial,sans-serif;padding:24px;">
          <h2>Document Preview · Page 1</h2>
          <p><strong>File:</strong> ${claim.finalBillFileName || claim.mcFileName || claim.referralFileName || "No uploaded file"}</p>
          <p><strong>Provider:</strong> ${claim.hospital}</p>
          <p><strong>Patient:</strong> ${claim.patient}</p>
          <p><strong>Date Submitted:</strong> ${claim.submittedAt || claim.createdAt || claim.date}</p>
          <p><strong>Treatment Date:</strong> ${claim.date}</p>
          <p><strong>Total Claimed:</strong> ${formatCurrency(claim.amount)}</p>
          <p><strong>Service Type:</strong> ${claim.serviceType || "Not specified"}</p>
          <p><strong>Diagnosis:</strong> ${claim.diagnosis || "Not specified"}</p>
        </body>
      </html>
    `;
    const blob = new Blob([html], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  };
  const openProviderClaimDocument = (storagePath: string) => {
    void (async () => {
      try {
        setFlowError("");
        const signedUrl = await getProviderClaimSignedUrl(storagePath);
        if (typeof window !== "undefined") {
          window.open(signedUrl, "_blank", "noopener,noreferrer");
        }
      } catch (error) {
        setFlowError(error instanceof Error ? error.message : "Unable to open the provider claim document.");
      }
    })();
  };
  const openProviderApprovalAttachment = (attachmentPath: string) => {
    if (typeof window === "undefined") return;
    window.open(attachmentPath, "_blank", "noopener,noreferrer");
  };
  const runProviderClaimAction = (action: "in_process" | "rejected" | "request_additional_information") => {
    void (async () => {
      try {
        if (!canOperateClaimsPage) {
          setFlowError("You have read-only access on Claims Management.");
          return;
        }
        if (!providerClaim) return;
        if (!adminSession?.profileId) {
          setFlowError("Unable to identify the current admin reviewer.");
          return;
        }

        const nowIso = new Date().toISOString();
        const note = providerReviewNote.trim();
        if (action === "rejected" && !note) {
          setFlowError("Please provide a rejection reason.");
          return;
        }
        if (action === "request_additional_information" && !note) {
          setFlowError("Please explain what additional information is needed.");
          return;
        }
        setFlowError("");
        setProviderActionPending(true);
        if (action === "in_process") {
          await updateProviderClaimLifecycle(providerClaim.id, {
            status: "in_process",
            reviewed_at: nowIso,
            reviewed_by_profile_id: adminSession.profileId,
            review_note: null,
          });
          setProviderReviewNote("");
          return;
        }

        if (action === "rejected") {
          await updateProviderClaimLifecycle(providerClaim.id, {
            status: "rejected",
            reviewed_at: nowIso,
            reviewed_by_profile_id: adminSession.profileId,
            review_note: note,
          });
          return;
        }

        if (action === "request_additional_information") {
          await updateProviderClaimLifecycle(providerClaim.id, {
            status: "request_additional_information",
            reviewed_at: nowIso,
            reviewed_by_profile_id: adminSession.profileId,
            review_note: note,
          });
          return;
        }
      } catch (error) {
        setFlowError(error instanceof Error ? error.message : "Unable to update this provider claim.");
      } finally {
        setProviderActionPending(false);
      }
    })();
  };

  if (providerClaim && !claim) {
    const providerClaimStatus = normalizeProviderClaimStatus(providerClaim.status);
    const canMarkProviderInProcess = providerClaimStatus === "submitted";
    const canRequestProviderInfo = ["submitted", "in_process"].includes(providerClaimStatus);
    const canRejectProviderClaim = ["submitted", "in_process", "request_additional_information"].includes(
      providerClaimStatus
    );

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/claims">
              <GlassButton variant="ghost" size="icon" className="h-10 w-10 p-0 rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </GlassButton>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                Provider Claim {providerClaim.claimNumber || providerClaim.id.slice(0, 8).toUpperCase()}
              </h1>
              <p className="text-sm text-slate-500">
                Submitted on{" "}
                {formatDateDisplay(
                  providerClaim.submittedAt || providerClaim.createdAt || providerClaim.treatmentDate
                ) ||
                  providerClaim.submittedAt ||
                  providerClaim.createdAt ||
                  providerClaim.treatmentDate}
              </p>
            </div>
          </div>
          {canOperateClaimsPage ? (
            <div className="flex flex-wrap items-center gap-2">
              <GlassButton
                variant="ghost"
                className="h-9 px-4 text-sm text-sky-700 border border-sky-200 bg-sky-50/70 hover:bg-sky-100 disabled:opacity-60"
                disabled={!canMarkProviderInProcess || providerActionPending}
                onClick={() => runProviderClaimAction("in_process")}
              >
                Mark In Process
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-9 px-4 text-sm text-rose-700 border border-rose-200 bg-rose-50/70 hover:bg-rose-100 disabled:opacity-60"
                disabled={!canRejectProviderClaim || providerActionPending}
                onClick={() => runProviderClaimAction("rejected")}
              >
                Reject
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-9 px-4 text-sm text-amber-700 border border-amber-200 bg-amber-50/70 hover:bg-amber-100 disabled:opacity-60"
                disabled={!canRequestProviderInfo || providerActionPending}
                onClick={() => runProviderClaimAction("request_additional_information")}
              >
                Request Additional Information
              </GlassButton>
            </div>
          ) : null}
        </div>
        {adminSession && !canOperateClaimsPage ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            You have read-only access on Claims Management. Review is available, but status changes are disabled.
          </div>
        ) : null}

        {flowError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {flowError}
          </div>
        )}

        <GlassCard className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Admin Review Controls</h2>
            <p className="text-sm text-slate-500">
              Admin review can queue a claim for payout processing. Payout completion and proof upload are handled in the Accountant Workspace.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Review Note</label>
              <textarea
                className={`w-full glass-input p-3 text-sm h-32 resize-none ${!canOperateClaimsPage ? "bg-slate-50/50" : ""}`}
                placeholder={
                  canOperateClaimsPage
                    ? "Required for rejection and request additional information."
                    : "Read-only review note."
                }
                value={providerReviewNote}
                readOnly={!canOperateClaimsPage}
                onChange={(event) => setProviderReviewNote(event.target.value)}
              />
              <p className="text-xs text-slate-400">
                {canOperateClaimsPage
                  ? "Reject and Request Additional Information require a note. Mark In Process clears it."
                  : "Read-only users can review the latest note but cannot edit it here."}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Historical Payment Proof</p>
              <p className="mt-1 text-sm text-slate-700">
                {providerClaim.approvalAttachmentName || "No payment proof uploaded yet."}
              </p>
              {providerClaim.approvalAttachmentPath && providerClaim.approvalAttachmentName ? (
                <GlassButton
                  variant="secondary"
                  className="mt-3 h-9 px-4 text-sm"
                  onClick={() => openProviderApprovalAttachment(providerClaim.approvalAttachmentPath!)}
                >
                  View Current Attachment
                </GlassButton>
              ) : null}
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <GlassCard className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-slate-800">{providerClaim.patientName || "Unlinked member"}</h2>
              <StatusBadge
                status={formatProviderClaimStatusLabel(providerClaim.status)}
                scheme={getProviderBadgeScheme(providerClaim.status)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Patient ID</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {providerClaim.patientStaffId || providerClaim.memberRecordId || providerClaim.dependentId || "Not linked"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {providerClaim.providerName || providerClaim.providerId || "Unknown provider"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Number</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {providerClaim.invoiceNumber || providerClaim.claimNumber || "Not submitted"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Treatment Date</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {formatDateDisplay(providerClaim.treatmentDate) || providerClaim.treatmentDate || "Not submitted"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Service Type</p>
                <p className="mt-1 text-sm font-medium text-slate-800">{providerClaim.serviceType || "Not submitted"}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Amount</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {formatCurrency(providerClaim.totalAmount)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 md:col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Diagnosis Summary</p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {providerClaim.diagnosisSummary || providerClaim.diagnosisCode || "Not submitted"}
                </p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Submitted Documents</h2>
              <p className="text-sm text-slate-500">Storage-backed files attached to this provider submission.</p>
            </div>
            {providerClaimDocuments.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-6 text-sm text-slate-500">
                No provider claim documents were found for this submission.
              </div>
            ) : (
              <div className="space-y-3">
                {providerClaimDocuments.map((document) => (
                  <div
                    key={document.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {document.fileName || document.docType}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{document.docType}</p>
                    </div>
                    <GlassButton
                      variant="secondary"
                      className="h-9 px-4 text-sm"
                      onClick={() => openProviderClaimDocument(document.storagePath)}
                    >
                      Open Document
                    </GlassButton>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/admin/claims">
            <GlassButton variant="ghost" size="icon" className="h-10 w-10 p-0 rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </GlassButton>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Claim #{claimId}
              <StatusBadge
                status={formatUnifiedClaimStatus(claim?.lifecycleStatus || claim?.status)}
                scheme={getLifecycleBadgeScheme(claim?.lifecycleStatus || claim?.status)}
              />
            </h1>
            <p className="text-sm text-slate-500">
              Submitted on {formatDateDisplay(claim?.submittedAt || claim?.createdAt || claim?.date || "") || "Unknown"}{" "}
              {claim?.doctorName ? `• Doctor: ${claim.doctorName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canOperateClaimsPage ? (
            <>
              <GlassButton
                variant="ghost"
                className="h-10 px-3 inline-flex items-center justify-center text-sky-700 hover:text-sky-800 hover:bg-sky-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                title="Mark In Process"
                disabled={!canMarkInProcess}
                onClick={markInProcess}
              >
                In Process
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-10 w-10 p-0 inline-flex items-center justify-center text-red-600 hover:text-red-700 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
                title="Reject Claim"
                disabled={!canReject}
                onClick={() => setIsRejectOpen(true)}
              >
                <XCircle className="w-4 h-4" />
              </GlassButton>
              <GlassButton
                variant="ghost"
                className="h-10 w-10 p-0 inline-flex items-center justify-center text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                title="Request Additional Information"
                disabled={!canRequestInfo}
                onClick={() => setIsRequestOpen(true)}
              >
                <AlertTriangle className="w-4 h-4" />
              </GlassButton>
            </>
          ) : null}
          {canDeleteClaims ? (
            <GlassButton
              variant="ghost"
              className="h-10 w-10 p-0 inline-flex items-center justify-center text-slate-500 hover:text-rose-700 hover:bg-rose-50"
              title="Delete Claim"
              aria-label="Delete Claim"
              onClick={deleteClaim}
            >
              <Trash2 className="w-4 h-4" />
            </GlassButton>
          ) : null}
        </div>
      </div>
      {adminSession && !canOperateClaimsPage ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          You have read-only access on Claims Management. Review is available, but status changes and deletion are disabled.
        </div>
      ) : null}
      {flowError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {flowError}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        <GlassCard className="flex flex-col h-full p-0 overflow-hidden bg-slate-900/5 backdrop-blur-sm border-slate-200/50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/50 bg-white/40">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Medical Documents
            </h3>
            <div className="flex items-center gap-2">
              <button
                className="p-1.5 hover:bg-white/50 rounded-lg text-slate-600"
                onClick={() => downloadText("claim-documents.txt", `Claim ${claimId} Documents`)}
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 hover:bg-white/50 rounded-lg text-slate-600"
                onClick={openPreviewTab}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 bg-slate-100 flex items-center justify-center relative overflow-auto p-6">
            <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Document Preview · Page 1</p>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-2 text-sm text-slate-700">
                <p className="font-semibold">{claim?.finalBillFileName || claim?.mcFileName || claim?.referralFileName || "No uploaded document"}</p>
                <p>Provider: {claim?.hospital || "Unknown provider"}</p>
                <p>Patient: {claim?.patient || "Unknown patient"}</p>
                <p>Treatment Date: {formatDateDisplay(claim?.date || "") || claim?.date || "Not submitted"}</p>
                <p>Total Claimed: {formatCurrency(claim?.amount || 0)}</p>
              </div>
              <p className="text-xs text-slate-400">Preview reflects the files and values submitted from the provider claim form.</p>
              <div className="text-center">
              <GlassButton
                variant="secondary"
                className="mt-2"
                onClick={openPreviewTab}
              >
                Open in New Tab
              </GlassButton>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col h-full overflow-hidden p-0">
          <div className="flex border-b border-slate-200/50">
            <button
              onClick={() => setActiveTab("details")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === "details" ? "bg-sky-50 text-sky-600 border-b-2 border-sky-500" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Claim Details
            </button>
            <button
              onClick={() => setActiveTab("coverage")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === "coverage" ? "bg-sky-50 text-sky-600 border-b-2 border-sky-500" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Policy & Coverage
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === "details" ? (
              <>
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Claim Summary</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500">Patient</label>
                      <p className="font-medium text-slate-800">{claim?.patient || "Unknown patient"}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Patient ID</label>
                      <p className="font-medium text-slate-800">{claim?.patientId || "Not submitted"}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Provider</label>
                      <p className="font-medium text-slate-800">{claim?.hospital || "Unknown provider"}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Service Type</label>
                      <p className="font-medium text-slate-800">{claim?.serviceType || "Not submitted"}</p>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-200/50" />

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Submitted Treatment Details</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Treatment Date</label>
                      <input
                        type="text"
                        value={formatDateDisplay(claim?.date || "") || claim?.date || "Not submitted"}
                        readOnly
                        className="w-full glass-input px-3 py-2 text-sm bg-slate-50/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Doctor Name</label>
                      <input type="text" value={claim?.doctorName || "Not submitted"} readOnly className="w-full glass-input px-3 py-2 text-sm bg-slate-50/50" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Diagnosis</label>
                      <textarea
                        value={claim?.diagnosis || "Not submitted"}
                        readOnly
                        className="w-full glass-input px-3 py-2 text-sm bg-slate-50/50 min-h-[88px] resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Diagnosis Codes</label>
                      <div className="flex min-h-[44px] flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2">
                        {diagnosisList.length > 0 ? (
                          diagnosisList.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                            >
                              {code}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">No diagnosis codes submitted</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Medication Description</label>
                      <textarea
                        value={claim?.medicationDescription || "Not submitted"}
                        readOnly
                        className="w-full glass-input px-3 py-2 text-sm bg-slate-50/50 min-h-[88px] resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-200/50" />

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Submitted Charges</h3>
                  <div className="space-y-3 bg-sky-50/50 p-4 rounded-xl border border-sky-100">
                    {chargeBreakdown.length > 0 ? (
                      chargeBreakdown.map((entry) => (
                        <div key={entry.key} className="rounded-xl border border-sky-100 bg-white/80 p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-700">{entry.label}</span>
                            <span className="font-semibold text-slate-800">{formatCurrency(entry.amount)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(selectedChargeItems[entry.key] || []).length > 0 ? (
                              (selectedChargeItems[entry.key] || []).map((item) => (
                                <span
                                  key={`${entry.key}-${item}`}
                                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                                >
                                  {item}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500">No item breakdown submitted</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No charge breakdown submitted.</p>
                    )}
                    <div className="h-px bg-sky-200" />
                    <div className="flex justify-between items-center text-lg">
                      <span className="font-bold text-sky-900">Total Submitted</span>
                      <span className="font-bold text-sky-600">{formatCurrency(claim?.amount || 0)}</span>
                    </div>
                  </div>

                  <div className="space-y-3 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle className="w-3 h-3" />
                      Historical Payment Attachments
                    </h4>
                    <p className="text-sm text-slate-500">
                      These files remain visible for already-completed historical claims, but admin review no longer manages paid or PV steps here.
                    </p>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Proof</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{claim?.bankSlipFileName || "Not uploaded"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Proof Uploaded At</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {claim?.bankSlipUploadedAt ? formatDateDisplay(claim.bankSlipUploadedAt) : "Not uploaded"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PV File</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{claim?.pvFileName || "Not uploaded"}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PV Uploaded At</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">
                          {claim?.pvUploadedAt ? formatDateDisplay(claim.pvUploadedAt) : "Not uploaded"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Medical Certificate</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{claim?.mcFileName || "Not uploaded"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Referral Letter</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{claim?.referralFileName || "Not uploaded"}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 md:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Final Bill</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{claim?.finalBillFileName || "Not uploaded"}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Review Status</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {formatUnifiedClaimStatus(claim?.lifecycleStatus || claim?.status)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Submission Timeline</h3>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Claim ID</span>
                      <span className="font-semibold text-slate-800">{claim?.id || claimId}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Submitted At</span>
                      <span className="font-semibold text-slate-800">
                        {formatDateDisplay(claim?.submittedAt || claim?.createdAt || "") || claim?.submittedAt || claim?.createdAt || "Not captured"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Operator</span>
                      <span className="font-semibold text-slate-800">{claim?.operatorName || "Not submitted"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Operator Member ID</span>
                      <span className="font-semibold text-slate-800">{claim?.operatorMemberId || "Not submitted"}</span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-slate-200/50" />

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Submitted Support Files</h3>
                  <div className="grid gap-3">
                    {chargeSections.map((section) => (
                      <div key={section.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                        <p className="text-sm font-semibold text-slate-800">{section.label}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {(selectedChargeItems[section.key] || []).length > 0
                            ? (selectedChargeItems[section.key] || []).join(", ")
                            : "No itemized selection submitted."}
                        </p>
                      </div>
                    ))}
                    {claim?.rejectionReason && (
                      <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
                        <p className="text-sm font-semibold text-rose-900">Rejection Reason</p>
                        <p className="mt-1 text-sm text-rose-800">{claim.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </GlassCard>
      </div>

      {isRequestOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsRequestOpen(false)} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Request Additional Information</h3>
              <p className="text-sm text-slate-500">Send a note for the claimant to provide the missing details.</p>
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
                <p className="text-xs text-slate-400">Keep the message short and actionable for the claimant.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setIsRequestOpen(false)}>Cancel</GlassButton>
              <GlassButton
                disabled={!requestNote.trim()}
                onClick={() => {
                  if (!canOperateClaimsPage) {
                    setFlowError("You have read-only access on Claims Management.");
                    return;
                  }
                  const token = `${claimId}-${Date.now()}`;
                  addAdminClaimRequest({ token, id: claimId, note: requestNote.trim(), createdAt: new Date().toISOString() });
                  void (async () => {
                    try {
                      setFlowError("");
                      const fromStatus = claim?.status || "";
                      await updateAdminClaimStatus(claimId, CLAIM_STATUS.MORE_INFORMATION);
                      notifyProviderStatus(
                        fromStatus,
                        formatUnifiedClaimStatus(CLAIM_STATUS.MORE_INFORMATION),
                        requestNote
                      );
                      setLastRequestToken(token);
                      setRequestNote("");
                      setIsRequestOpen(false);
                    } catch (error) {
                      setFlowError(error instanceof Error ? error.message : "Unable to update this claim.");
                    }
                  })();
                }}
              >
                Send Request
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      {isRejectOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeRejectModal} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Reject Claim</h3>
              <p className="text-sm text-slate-500">Provide a reason before rejecting this member claim.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full glass-input p-3 text-sm h-32 resize-none"
                  placeholder="Explain why this claim cannot proceed."
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </div>
              {flowError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {flowError}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={closeRejectModal}>
                Cancel
              </GlassButton>
              <GlassButton disabled={!rejectionReason.trim() || !canOperateClaimsPage} onClick={rejectClaim}>
                Confirm Rejection
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
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
