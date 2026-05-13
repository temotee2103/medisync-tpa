"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Maximize2
} from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, useMemo, useState, useSyncExternalStore } from "react";
import { downloadText } from "@/lib/download";
import { readFileAsDataUrl } from "@/lib/fileData";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { canTransition, CLAIM_STATUS, type ClaimStatus } from "@/lib/claimFlow";
import { notifyClaimStatusEmail } from "@/lib/claimNotifications";
import { ensureProviderSeed, getProviderDirectory } from "@/lib/providerSession";
import {
  addAdminClaimRequest,
  ensureAdminClaimsSeed,
  getAdminClaimsSnapshot,
  removeAdminClaimRequest,
  subscribeAdminClaims,
  normalizeClaimStatus,
  updateAdminClaimStatus,
} from "@/lib/claimsStore";

type ClaimDetailClientProps = {
  claimId: string;
};

const chargeSections = [
  { key: "medication", label: "Medication" },
  { key: "injection", label: "Injection" },
  { key: "investigation", label: "Investigation" },
  { key: "procedure", label: "Procedure" },
  { key: "immunization", label: "Immunization" },
] as const;

export default function ClaimDetailClient({ claimId }: ClaimDetailClientProps) {
  ensureAdminClaimsSeed();
  const claims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsSnapshot
  );
  const claim = useMemo(() => claims.find((entry) => entry.id === claimId) || null, [claimId, claims]);
  const diagnosisList = claim?.diagnosisCodes?.length ? claim.diagnosisCodes : claim?.diagnosis ? [claim.diagnosis] : [];
  const selectedChargeItems = claim?.selectedChargeItems || {};
  const claimStatus = useMemo<ClaimStatus>(
    () => normalizeClaimStatus(claim?.status || CLAIM_STATUS.IN_REVIEW) as ClaimStatus,
    [claim?.status]
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
        { key: "investigation", label: "Investigation", amount: Number(claim?.investigationFee || 0) },
        { key: "procedure", label: "Procedure", amount: Number(claim?.procedureFee || 0) },
        { key: "immunization", label: "Immunization", amount: Number(claim?.immunizationFee || 0) },
      ].filter((entry) => entry.amount > 0 || (selectedChargeItems[entry.key] || []).length > 0),
    [claim, selectedChargeItems]
  );
  const canReject = !!claim && canTransition(claimStatus, CLAIM_STATUS.REJECTED);
  const canApprove = !!claim && canTransition(claimStatus, CLAIM_STATUS.APPROVED);
  const canRequestInfo = !!claim && (claimStatus === CLAIM_STATUS.IN_REVIEW || claimStatus === CLAIM_STATUS.IN_PROGRESS);
  const canGenerateListing = !!claim && canTransition(claimStatus, CLAIM_STATUS.LISTED);
  const canMarkPaid = !!claim && canTransition(claimStatus, CLAIM_STATUS.PAID);
  const canUploadPv = !!claim && canTransition(claimStatus, CLAIM_STATUS.PV_UPLOADED);
  const [activeTab, setActiveTab] = useState<"details" | "coverage">("details");
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [isPvOpen, setIsPvOpen] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [bankSlipFile, setBankSlipFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [pvFile, setPvFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [pvError, setPvError] = useState("");
  const [approvalError, setApprovalError] = useState("");
  const [lastRequestToken, setLastRequestToken] = useState("");
  const [flowError, setFlowError] = useState("");

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
  const closeApprovalModal = () => {
    setIsApproveOpen(false);
    setApprovalError("");
  };
  const closePvModal = () => {
    setIsPvOpen(false);
    setPvFile(null);
    setPvError("");
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
  const handlePvSelection = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPvFile(null);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPvFile({ name: file.name, dataUrl });
      setPvError("");
    } catch (error) {
      setPvFile(null);
      setPvError(error instanceof Error ? error.message : "Unable to upload the PV file.");
    } finally {
      event.target.value = "";
    }
  };
  const approveClaim = () => {
    if (!bankSlipFile) {
      setApprovalError("Upload the bank-in slip before approving this claim.");
      return;
    }

    try {
      setFlowError("");
      const fromStatus = claim?.status || "";
      updateAdminClaimStatus(claimId, "Approved", {
        bankSlipFileName: bankSlipFile.name,
        bankSlipDataUrl: bankSlipFile.dataUrl,
        bankSlipUploadedAt: new Date().toISOString(),
      });
      notifyProviderStatus(fromStatus, "Approved");
      closeApprovalModal();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "Unable to approve this claim.");
    }
  };
  const generateListing = () => {
    try {
      setFlowError("");
      const fromStatus = claim?.status || "";
      updateAdminClaimStatus(claimId, CLAIM_STATUS.LISTED);
      notifyProviderStatus(fromStatus, CLAIM_STATUS.LISTED);
      downloadText(`claim-listing-${claimId}.txt`, `Claim ${claimId} listed on ${new Date().toISOString()}`);
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "Unable to generate listing for this claim.");
    }
  };
  const markPaid = () => {
    try {
      setFlowError("");
      const fromStatus = claim?.status || "";
      updateAdminClaimStatus(claimId, CLAIM_STATUS.PAID);
      notifyProviderStatus(fromStatus, CLAIM_STATUS.PAID);
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "Unable to mark this claim as paid.");
    }
  };
  const confirmPvUpload = () => {
    if (!pvFile) {
      setPvError("Select the PV file before uploading.");
      return;
    }

    try {
      setPvError("");
      setFlowError("");
      const fromStatus = claim?.status || "";
      updateAdminClaimStatus(claimId, CLAIM_STATUS.PV_UPLOADED, {
        pvFileName: pvFile.name,
        pvDataUrl: pvFile.dataUrl,
        pvUploadedAt: new Date().toISOString(),
      });
      notifyProviderStatus(fromStatus, CLAIM_STATUS.PV_UPLOADED);
      closePvModal();
    } catch (error) {
      setPvError(error instanceof Error ? error.message : "Unable to upload the PV for this claim.");
    }
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
              <span className="text-sm font-medium px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{claim?.status || "In review"}</span>
            </h1>
            <p className="text-sm text-slate-500">
              Submitted on {formatDateDisplay(claim?.submittedAt || claim?.createdAt || claim?.date || "") || "Unknown"}{" "}
              {claim?.doctorName ? `• Doctor: ${claim.doctorName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <GlassButton
            variant="ghost"
            className="h-10 w-10 p-0 inline-flex items-center justify-center text-red-600 hover:text-red-700 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent"
            title="Reject Claim"
            disabled={!canReject}
            onClick={() => {
              try {
                setFlowError("");
                const fromStatus = claim?.status || "";
                updateAdminClaimStatus(claimId, "Rejected");
                notifyProviderStatus(fromStatus, "Rejected");
              } catch (error) {
                setFlowError(error instanceof Error ? error.message : "Unable to reject this claim.");
              }
            }}
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
          <GlassButton
            variant="ghost"
            className="h-10 w-10 p-0 inline-flex items-center justify-center text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300 disabled:hover:bg-transparent"
            title="Approve Claim"
            disabled={!canApprove}
            onClick={() => setIsApproveOpen(true)}
          >
            <CheckCircle className="w-4 h-4" />
          </GlassButton>
          {canGenerateListing && (
            <GlassButton className="ml-2" onClick={generateListing}>
              Generate Listing
            </GlassButton>
          )}
          {canMarkPaid && (
            <GlassButton className="ml-2" onClick={markPaid}>
              Mark Paid
            </GlassButton>
          )}
          {canUploadPv && (
            <GlassButton className="ml-2" onClick={() => setIsPvOpen(true)}>
              Upload PV
            </GlassButton>
          )}
        </div>
      </div>
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
                      Payment Status
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">Bank-in Date</label>
                        <input
                          type="date"
                          className="h-12 w-full glass-input px-3 py-2 text-sm"
                          defaultValue={claim?.bankSlipUploadedAt?.slice(0, 10) || ""}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500">Uploaded Bank Slip</label>
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          className="h-12 w-full glass-input px-3 py-2 bg-white text-sm text-slate-600 file:mr-3 file:h-8 file:rounded-md file:border file:border-slate-200 file:bg-slate-100 file:px-3 file:py-1 file:text-[10px] file:font-semibold file:uppercase file:tracking-wide file:text-slate-600 hover:file:bg-slate-200/80"
                          onChange={handleBankSlipSelection}
                        />
                        {(bankSlipFile?.name || claim?.bankSlipFileName) && (
                          <p className="text-[11px] text-slate-500">
                            {bankSlipFile?.name || claim?.bankSlipFileName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 bg-violet-50/50 p-4 rounded-xl border border-violet-100">
                    <h4 className="text-xs font-bold text-violet-800 uppercase tracking-wider flex items-center gap-2">
                      <FileText className="w-3 h-3" />
                      PV Upload
                    </h4>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-violet-100 bg-white/80 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PV File</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{claim?.pvFileName || "Not uploaded"}</p>
                      </div>
                      <div className="rounded-xl border border-violet-100 bg-white/80 p-3">
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

                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Internal Notes</label>
                    <textarea className="w-full glass-input p-3 text-sm h-24 resize-none" placeholder="Add notes for the finance team..." />
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsRequestOpen(false)} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Request Additional Information</h3>
              <p className="text-sm text-slate-500">Send a note to the provider for missing details.</p>
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
                <p className="text-xs text-slate-400">Keep the message short and actionable for the provider.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setIsRequestOpen(false)}>Cancel</GlassButton>
              <GlassButton
                disabled={!requestNote.trim()}
                onClick={() => {
                  const token = `${claimId}-${Date.now()}`;
                  addAdminClaimRequest({ token, id: claimId, note: requestNote.trim(), createdAt: new Date().toISOString() });
                  try {
                    setFlowError("");
                    const fromStatus = claim?.status || "";
                    updateAdminClaimStatus(claimId, "In progress");
                    notifyProviderStatus(fromStatus, "In progress", requestNote);
                  } catch (error) {
                    setFlowError(error instanceof Error ? error.message : "Unable to update this claim.");
                  }
                  setLastRequestToken(token);
                  setRequestNote("");
                  setIsRequestOpen(false);
                }}
              >
                Send Request
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      {isApproveOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeApprovalModal} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Approve Claim</h3>
              <p className="text-sm text-slate-500">Confirm approval using the bank-in slip selected in Payment Status.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm font-medium text-emerald-900">Member portal download will be enabled from this uploaded file.</p>
                <p className="mt-1 text-xs text-emerald-700">Claim: {claimId}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Bank-In Slip <span className="text-red-500">*</span>
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {bankSlipFile?.name || "Upload the bank-in slip in Payment Status before approval."}
                </div>
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
      {isPvOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closePvModal} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Upload PV</h3>
              <p className="text-sm text-slate-500">Upload the payment voucher to complete the claim flow.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  PV File <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="h-12 w-full glass-input px-3 py-2 bg-white text-sm text-slate-600 file:mr-3 file:h-8 file:rounded-md file:border file:border-slate-200 file:bg-slate-100 file:px-3 file:py-1 file:text-[10px] file:font-semibold file:uppercase file:tracking-wide file:text-slate-600 hover:file:bg-slate-200/80"
                  onChange={handlePvSelection}
                />
                {(pvFile?.name || claim?.pvFileName) && (
                  <p className="text-[11px] text-slate-500">{pvFile?.name || claim?.pvFileName}</p>
                )}
              </div>
              {pvError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {pvError}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={closePvModal}>
                Cancel
              </GlassButton>
              <GlassButton disabled={!pvFile} onClick={confirmPvUpload}>
                Confirm Upload
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
