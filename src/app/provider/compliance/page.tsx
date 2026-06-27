"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { 
  ShieldCheck, 
  AlertTriangle, 
  UploadCloud, 
  FileText, 
  CheckCircle2,
  XCircle
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ensureProviderSeed,
  getProviderById,
  getProviderCredentialsServerSnapshot,
  getProviderCredentialsSnapshot,
  getProviderDirectoryServerSnapshot,
  getProviderDirectorySnapshot,
  getProviderSession,
  getProviderUserById,
  getVendorMembersServerSnapshot,
  getVendorMembersSnapshot,
  getVendorMembersByVendor,
  normalizeProviderUserRole,
  isProviderCompliant,
  insertProviderCredential,
  PROVIDER_CREDENTIAL_DOC_TYPES,
  submitVendorDoctorApc,
  subscribeProviderCredentials,
  subscribeProviderDirectory,
  subscribeVendorMembers,
  type ProviderCredentialDocType,
  type ProviderSession,
} from "@/lib/providerSession";
import { getProviderSubmissionGuard } from "@/lib/providerComplianceGuard";

type CurrentProviderUserRow = {
  id?: string | null;
  role?: string | null;
  full_name?: string | null;
  providers?: {
    id?: string | null;
    vendor_id?: string | null;
    provider_name?: string | null;
  } | null;
};

const formatProviderRole = (role?: string | null) => {
  const normalized = normalizeProviderUserRole(role || "");
  return normalized === "doctor" ? "Doctor" : "Provider Admin";
};

const downloadComplianceDocument = async (
  fileName: string,
  fileDataUrl?: string,
  storagePath?: string
) => {
  if (fileDataUrl) {
    const anchor = document.createElement("a");
    anchor.href = fileDataUrl;
    anchor.download = fileName;
    anchor.click();
    return;
  }

  if (storagePath) {
    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
      window.open(storagePath, "_blank");
      return;
    }

    try {
      const supabase = createSupabaseBrowserClient();
      const parts = storagePath.split("/");
      if (parts.length >= 2) {
        const bucket = parts[0];
        const path = parts.slice(1).join("/");
        const { data, error } = await supabase.storage.from(bucket).download(path);
        if (error) throw error;
        const url = URL.createObjectURL(data);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silently fail
    }
  }
};

export default function CompliancePage() {
  const [isProviderContextResolved, setIsProviderContextResolved] = useState(false);
  const [docUploads, setDocUploads] = useState<Record<string, {
    fileName: string; fileDataUrl: string; fileMimeType: string;
    expiryDate: string; error: string;
  }>>({});
  const [apcUploadError, setApcUploadError] = useState("");
  const [apcUpload, setApcUpload] = useState<{
    providerUserId: string;
    fileName: string;
    fileDataUrl: string;
    fileMimeType: string;
    expiryDate: string;
  }>({
    providerUserId: "",
    fileName: "",
    fileDataUrl: "",
    fileMimeType: "",
    expiryDate: "",
  });
  const [resolvedProviderSession, setResolvedProviderSession] = useState<ProviderSession | null>(null);
  const [resolvedUserName, setResolvedUserName] = useState("");

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Unable to read file"));
      reader.readAsDataURL(file);
    });

  if (typeof window !== "undefined") {
    ensureProviderSeed();
  }

  const providerDirectorySnapshot = useSyncExternalStore(
    subscribeProviderDirectory,
    getProviderDirectorySnapshot,
    getProviderDirectoryServerSnapshot
  );
  const providerCredentialsSnapshot = useSyncExternalStore(
    subscribeProviderCredentials,
    getProviderCredentialsSnapshot,
    getProviderCredentialsServerSnapshot
  );
  const vendorMembersSnapshot = useSyncExternalStore(
    subscribeVendorMembers,
    getVendorMembersSnapshot,
    getVendorMembersServerSnapshot
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    ensureProviderSeed();
    let cancelled = false;

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const profileId = data.session?.user.id;

      if (!profileId) {
        if (!cancelled) {
          setResolvedProviderSession(null);
          setResolvedUserName("");
          setIsProviderContextResolved(true);
        }
        return;
      }

      const { data: providerUserRow, error } = await supabase
        .from("provider_users")
        .select("id, role, full_name, providers(id, vendor_id, provider_name)")
        .eq("profile_id", profileId)
        .maybeSingle();

      if (error || !providerUserRow) {
        if (!cancelled) {
          setResolvedProviderSession(null);
          setResolvedUserName("");
          setIsProviderContextResolved(true);
        }
        return;
      }

      const row = providerUserRow as unknown as CurrentProviderUserRow;
      const vendorId = String(row.providers?.vendor_id || "");
      const providerUuid = String(row.providers?.id || "");
      const providerName = String(row.providers?.provider_name || "");
      const providerUserRole = normalizeProviderUserRole(row.role || "") || "provider_admin";

      if (!cancelled) {
        setResolvedProviderSession({
          vendorId,
          providerUuid,
          providerName,
          providerUserId: String(row.id || ""),
          providerUserRole,
        });
        setResolvedUserName(String(row.full_name || ""));
        setIsProviderContextResolved(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const session = typeof window !== "undefined" ? (resolvedProviderSession || getProviderSession()) : null;
  const providerOrgId = session?.vendorId || "";
  void providerDirectorySnapshot;
  void providerCredentialsSnapshot;
  void vendorMembersSnapshot;
  const provider = providerOrgId ? getProviderById(providerOrgId) : null;
  const currentUser =
    providerOrgId && session?.providerUserId ? getProviderUserById(providerOrgId, session.providerUserId) : null;
  const currentUserRole =
    session?.providerUserRole || normalizeProviderUserRole(currentUser?.role) || "provider_admin";
  const activeDoctors = providerOrgId
    ? getVendorMembersByVendor(providerOrgId).filter(
        (member) => member.status === "Active" && normalizeProviderUserRole(member.role) === "doctor"
      )
    : [];
  const currentDoctor =
    currentUserRole !== "doctor"
      ? null
      : currentUser && normalizeProviderUserRole(currentUser.role) === "doctor"
        ? currentUser
        : activeDoctors.find((member) => member.providerUserUuid === session?.providerUserId) || null;
  const visibleDoctors = currentUserRole === "doctor" ? (currentDoctor ? [currentDoctor] : []) : activeDoctors;
  const currentDoctorOptionId = currentDoctor?.providerUserUuid || currentDoctor?.memberId || "";
  const currentDoctorGuard = getProviderSubmissionGuard({
    role: currentUserRole,
    clinicLicense: provider?.compliance?.clinicLicense,
    doctorApcs: provider?.compliance?.doctorApcs,
    doctors: activeDoctors,
    selectedDoctorId: currentDoctorOptionId,
    doctorIdentifiers: [session?.providerUserId, currentDoctor?.providerUserUuid, currentDoctor?.memberId],
  });
  const visibleApcList =
    currentUserRole !== "doctor" || !currentDoctor
      ? provider?.compliance?.doctorApcs || []
      : (provider?.compliance?.doctorApcs || []).filter(
          (doc) => doc.providerUserId === currentDoctor.memberId || doc.providerUserId === currentDoctor.providerUserUuid
        );
  const canManageClinicLicense = currentUserRole === "provider_admin";
  const canUploadApc = currentUserRole === "provider_admin" || currentUserRole === "doctor";
  const isCompliant =
    currentUserRole === "doctor"
      ? currentDoctorGuard.canSubmit
      : provider
        ? isProviderCompliant(provider.vendorId)
        : false;
  const isResolvingProvider =
    !isProviderContextResolved ||
    (!!providerOrgId && !provider && providerDirectorySnapshot.length === 0);


  const apcList = visibleApcList;
  const selectedApcDoctorId =
    currentUserRole === "doctor"
      ? visibleDoctors[0]?.providerUserUuid || visibleDoctors[0]?.memberId || ""
      : apcUpload.providerUserId || visibleDoctors[0]?.providerUserUuid || visibleDoctors[0]?.memberId || "";

  const statusPill = (status?: string) => {
    if (status === "approved") return "bg-emerald-100 text-emerald-700";
    if (status === "submitted") return "bg-amber-100 text-amber-700";
    if (status === "rejected") return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-600";
  };

  const DOC_TYPE_CONFIGS = [
    { key: "clinic_license", label: "Borang F", icon: Building2Icon, required: true, nonExpiry: true, group: "main" },
    { key: "borang_b", label: "Borang B", icon: FileText, required: false, nonExpiry: true, group: "main" },
    { key: "ssm", label: "SSM Certificate", icon: FileText, required: true, nonExpiry: true, group: "main" },
    { key: "tcm", label: "TCM Certificate (Optional)", icon: FileText, required: false, nonExpiry: false, group: "optional" },
  ] as const;

  const getComplianceDoc = (docKey: string) => {
    if (!provider?.compliance) return undefined;
    if (docKey === "clinic_license") return provider.compliance.clinicLicense;
    return (provider.compliance.documents || []).find(d => d.docType === docKey);
  };
  const getDocUploadState = (docKey: string) => docUploads[docKey] || { fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "", error: "" };
  const setDocUploadField = (docKey: string, field: string, value: string) => {
    setDocUploads(prev => ({ ...prev, [docKey]: { ...(prev[docKey] || { fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "", error: "" }), [field]: value } }));
  };
  const submitDocUpload = async (docType: string) => {
    if (!session?.vendorId) {
      setDocUploadField(docType, "error", "Session expired or not available. Please refresh the page and log in again.");
      return;
    }
    const upload = docUploads[docType];
    const config = DOC_TYPE_CONFIGS.find(c => c.key === docType);
    const needsExpiry = !config?.nonExpiry;
    if (!upload?.fileName || (needsExpiry && !upload?.expiryDate)) {
      setDocUploadField(docType, "error", "Please select a file and enter the expiry date.");
      return;
    }
    setDocUploadField(docType, "error", "");
    try {
      await insertProviderCredential({ vendorId: session.vendorId, docType: docType as ProviderCredentialDocType, providerUserId: null, fileName: upload.fileName, fileDataUrl: upload.fileDataUrl, fileMimeType: upload.fileMimeType, expiryDate: upload.expiryDate, submittedBy: "vendor" });
      setDocUploadField(docType, "fileName", "");
      setDocUploadField(docType, "fileDataUrl", "");
      setDocUploadField(docType, "fileMimeType", "");
      setDocUploadField(docType, "expiryDate", "");
      setDocUploadField(docType, "error", "✓ Submitted successfully — pending admin review.");
    } catch (err) { setDocUploadField(docType, "error", err instanceof Error ? err.message : "Upload failed. Please refresh the page and try again."); }
  };

  if (isResolvingProvider) {
    return (
      <div className="space-y-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-600">Loading provider compliance data...</p>
        </GlassCard>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="space-y-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-600">Provider session not found. Please login again.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">License Management & Compliance</h1>
        <p className="text-slate-500">
          Upload compliance documents for admin review and approval.
          {` Logged in as ${resolvedUserName || currentUser?.fullName || "Provider User"} (${formatProviderRole(currentUserRole)}).`}
        </p>
      </div>

      <GlassCard className={cn(
        "p-6 flex items-start gap-4 border",
        isCompliant ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
      )}>
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
          isCompliant ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
        )}>
          {isCompliant ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
        </div>
        <div>
          <h2 className={cn("text-lg font-bold", isCompliant ? "text-emerald-800" : "text-red-800")}>
            {isCompliant ? "Fully Compliant" : "Compliance Action Required"}
          </h2>
          <p className={cn("text-sm mt-1", isCompliant ? "text-emerald-700" : "text-red-700")}>
            {isCompliant
              ? "All required documents are approved and valid. Claims can be submitted."
              : "Claims are blocked until clinic license and APC documents are approved and not expired."}
          </p>
          {currentUserRole === "doctor" ? (
            <p className="mt-2 text-xs text-slate-600">
              {currentDoctorGuard.blockingReason ||
                "Doctor login can manage only its own APC. Clinic license remains under provider admin."}
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-600">
              Provider admin can manage clinic license and submit APC files for doctor accounts.
            </p>
          )}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {DOC_TYPE_CONFIGS.map((config) => {
          const currentDoc = getComplianceDoc(config.key);
          const docStatus = currentDoc?.status || "missing";
          const uploadState = getDocUploadState(config.key);
          return (
            <GlassCard key={config.key} className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <config.icon className="w-5 h-5 text-sky-500" />
                  {config.label}
                </h3>
                <span className={`px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${statusPill(docStatus)}`}>
                  {docStatus === "approved" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {docStatus.toUpperCase()}
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">
                      {currentDoc?.fileName || "No file uploaded"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {currentDoc?.submittedAt
                        ? `Submitted ${currentDoc.submittedAt}`
                        : "Awaiting submission"}
                    </p>
                  </div>
                  <GlassButton
                    size="sm"
                    variant="secondary"
                    disabled={!currentDoc?.fileName}
                    onClick={() => {
                      if (!currentDoc?.fileName) return;
                      downloadComplianceDocument(currentDoc.fileName, currentDoc.fileDataUrl, currentDoc.storagePath);
                    }}
                  >
                    Open
                  </GlassButton>
                </div>
                {!config.nonExpiry && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry Date</label>
                  <div className="relative">
                    <input 
                      type="date" 
                      className="w-full px-4 py-2 glass-input rounded-lg bg-transparent relative z-10"
                      value={currentDoc?.expiryDate || ""}
                      disabled
                    />
                  </div>
                </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <p className="text-sm text-slate-500 font-medium">
                      {canManageClinicLicense ? `Upload ${config.label} file` : `${config.label} managed by provider admin`}
                    </p>
                    <p className="text-xs text-slate-400">PDF or JPG (Max 5MB)</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,image/jpeg,image/png,application/pdf"
                    disabled={!canManageClinicLicense}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      readFileAsDataUrl(file).then((dataUrl) => {
                        setDocUploadField(config.key, "fileName", file.name);
                        setDocUploadField(config.key, "fileDataUrl", dataUrl);
                        setDocUploadField(config.key, "fileMimeType", file.type);
                      });
                    }}
                  />
                </label>
                <div className={config.nonExpiry ? "mt-3" : "grid grid-cols-1 md:grid-cols-2 gap-3 mt-3"}>
                  <input
                    type="text"
                    className={config.nonExpiry ? "glass-input px-3 py-2 bg-slate-50 w-full" : "glass-input px-3 py-2 bg-slate-50"}
                    placeholder="Selected filename"
                    value={uploadState.fileName}
                    readOnly
                  />
                  {!config.nonExpiry && (
                  <input
                    type="date"
                    className="glass-input px-3 py-2"
                    value={uploadState.expiryDate}
                    onChange={(e) => setDocUploadField(config.key, "expiryDate", e.target.value)}
                  />
                  )}
                </div>
                <div className="mt-3">
                  <GlassButton
                    disabled={!canManageClinicLicense}
                    onClick={() => submitDocUpload(config.key)}
                  >
                    Send Review
                  </GlassButton>
                </div>
                {uploadState.error ? (
                  <p className={uploadState.error.startsWith("✓") ? "mt-3 text-xs text-emerald-600 font-medium" : "mt-3 text-xs text-red-600"}>{uploadState.error}</p>
                ) : null}
                {!canManageClinicLicense ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Switch to a provider admin login if you need to submit or replace the {config.label}.
                  </p>
                ) : null}
              </div>
            </GlassCard>
          );
        })}

        <GlassCard className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <StethoscopeIcon className="w-5 h-5 text-purple-500" />
              Annual Practicing Cert (APC) List
            </h3>
            <span className={`inline-flex w-fit whitespace-nowrap px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 ${statusPill(isCompliant ? "approved" : "submitted")}`}>
              {isCompliant ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {(isCompliant ? "APPROVED" : "SUBMITTED")}
            </span>
          </div>

          <div className="space-y-3">
            {apcList.length > 0 ? (
              apcList.map((doc, index) => (
                <div key={`${doc.providerUserId}-${index}`} className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{doc.doctorName}</p>
                      <p className="text-xs text-slate-500">{doc.fileName || "No file"} • {doc.expiryDate || "No expiry"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${statusPill(doc.status)}`}>
                      {(doc.status || "missing").toUpperCase()}
                    </span>
                    <GlassButton
                      size="sm"
                      variant="secondary"
                      disabled={!doc.fileName}
                      onClick={() => {
                        if (!doc.fileName) return;
                        downloadComplianceDocument(doc.fileName, doc.fileDataUrl, doc.storagePath);
                      }}
                    >
                      Open
                    </GlassButton>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-500">
                No APC submitted yet.
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <select
                className="glass-select px-3 py-2"
                value={selectedApcDoctorId}
                onChange={(e) => setApcUpload((prev) => ({ ...prev, providerUserId: e.target.value }))}
              >
                <option value="">Select doctor</option>
                {visibleDoctors.map((doctor) => (
                  <option
                    key={doctor.providerUserUuid || doctor.memberId}
                    value={doctor.providerUserUuid || doctor.memberId}
                  >
                    {doctor.fullName} ({doctor.memberId})
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="glass-input px-3 py-2 bg-slate-50"
                placeholder="Selected file"
                value={apcUpload.fileName}
                readOnly
              />
              <input
                type="date"
                className="glass-input px-3 py-2"
                value={apcUpload.expiryDate}
                onChange={(e) => setApcUpload((prev) => ({ ...prev, expiryDate: e.target.value }))}
              />
            </div>
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
              <div className="flex flex-col items-center justify-center">
                <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-sm text-slate-500 font-medium">Upload APC file</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,image/jpeg,image/png,application/pdf"
                disabled={!canUploadApc}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  readFileAsDataUrl(file).then((dataUrl) => {
                    setApcUpload((prev) => ({
                      ...prev,
                      fileName: file.name,
                      fileDataUrl: dataUrl,
                      fileMimeType: file.type,
                    }));
                  });
                }}
              />
            </label>
            <div className="mt-3">
              <GlassButton
                disabled={!canUploadApc}
                onClick={async () => {
                  if (!session?.vendorId || !selectedApcDoctorId || !apcUpload.fileName || !apcUpload.expiryDate) {
                    setApcUploadError("Please select a doctor, file, and expiry date.");
                    return;
                  }
                  setApcUploadError("");
                  try {
                    await submitVendorDoctorApc(session.vendorId, {
                      providerUserId: selectedApcDoctorId,
                      fileName: apcUpload.fileName,
                      fileDataUrl: apcUpload.fileDataUrl,
                      fileMimeType: apcUpload.fileMimeType,
                      expiryDate: apcUpload.expiryDate,
                      submittedBy: "vendor",
                    });
                    setApcUpload({
                      providerUserId: "",
                      fileName: "",
                      fileDataUrl: "",
                      fileMimeType: "",
                      expiryDate: "",
                    });
                    setApcUploadError("✓ APC submitted successfully — pending admin review.");
                  } catch {
                    setApcUploadError("Upload failed. Please try again.");
                  }
                }}
              >
                Send APC
              </GlassButton>
            </div>
            {apcUploadError ? (
              <p className={apcUploadError.startsWith("✓") ? "mt-3 text-xs text-emerald-600 font-medium" : "mt-3 text-xs text-red-600"}>{apcUploadError}</p>
            ) : null}
            {currentUserRole === "doctor" ? (
              <p className="mt-3 text-xs text-slate-500">
                Doctor login is limited to your own APC record.
              </p>
            ) : null}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function Building2Icon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
  );
}

function StethoscopeIcon({ className }: { className?: string }) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4.8 2.3A.3.3 0 0 1 5 2h14a.3.3 0 0 1 .2.3v3.3a.3.3 0 0 1-.3.3H5a.3.3 0 0 1-.3-.3V2.3Z"/><path d="M6 5v6a6 6 0 0 0 12 0V5"/><path d="M12 17v5"/><path d="M8 22h8"/></svg>
    );
}
