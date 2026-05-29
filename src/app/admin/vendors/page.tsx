"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { 
  Search,
  Plus,
  Stethoscope,
  Users,
  Mail,
  Phone,
  User,
  Briefcase,
  MapPin,
  XCircle,
  ShieldCheck,
  Power,
  Pencil,
  UserPlus,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { downloadText } from "@/lib/download";
import * as providerSession from "@/lib/providerSession";
import { fetchAdminSession, type AdminRole } from "@/lib/adminSession";
import { canDeleteAdminResource, isAdminReadOnly } from "@/lib/adminPermissions";
import {
  buildAddressLine,
  DIAL_CODES,
  formatPhoneForDisplay,
  joinPhoneNumber,
  normalizeName,
  normalizePhone,
  splitPhoneNumber,
} from "@/lib/formats";

const {
  deleteProviderDirectoryEntry,
  ensureProviderSeed,
  deleteProviderCredential,
  refreshProviderCredentialsSnapshot,
  refreshProviderDirectorySnapshot,
  refreshVendorMembersSnapshot,
  normalizeProviderUserRole,
  reviewProviderCredential,
  saveProviderDirectoryEntry,
  subscribeProviderDirectory,
  subscribeProviderCredentials,
  getProviderDirectorySnapshot,
  getProviderDirectoryServerSnapshot,
  getProviderCredentialsSnapshot,
  getProviderCredentialsServerSnapshot,
  getVendorMembersByVendor,
  submitVendorClinicLicense,
  submitVendorDoctorApc,
} = providerSession;

const TODAY_KEY = new Date().toISOString().slice(0, 10);
const EXPIRING_KEY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const getExpiryStatus = (expiryDate?: string) => {
  if (!expiryDate) return "Missing";
  if (expiryDate < TODAY_KEY) return "Expired";
  if (expiryDate <= EXPIRING_KEY) return "Expiring";
  return "Valid";
};

const getStatusStyles = (status: string) => {
  if (status === "Expired" || status === "Missing" || status === "Rejected" || status === "Blocked") {
    return "bg-rose-100 text-rose-700";
  }
  if (status === "Expiring" || status === "Review") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
};

const getDocumentState = (doc?: providerSession.VendorComplianceDocument | providerSession.VendorDoctorApc) => {
  if (!doc || doc.status === "missing" || !doc.fileName) return "Missing";
  if (doc.status === "rejected") return "Rejected";
  const expiry = getExpiryStatus(doc.expiryDate);
  if (expiry === "Expired") return "Expired";
  if (doc.status === "submitted") return "Review";
  if (expiry === "Expiring") return "Expiring";
  return "Valid";
};

const getClinicUploadActionLabel = (doc?: providerSession.VendorComplianceDocument) => {
  if (!doc?.fileName) return "Upload";
  return "Replace";
};

const getClinicNextActionMessage = (doc?: providerSession.VendorComplianceDocument) => {
  if (doc?.status === "submitted") {
    return "Review required — Approve or Reject the vendor submission.";
  }

  const state = getDocumentState(doc);
  if (state === "Missing") return "Upload the clinic license to complete compliance.";
  if (state === "Rejected") return "Replace the rejected clinic license and record the new expiry date.";
  if (state === "Expired") return "Replace the expired clinic license and record the new expiry date.";
  if (state === "Expiring") return "Replace the clinic license soon to avoid expiration.";
  return "No action required. Replace only if the license details have changed.";
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });

const downloadComplianceDocument = (
  fileName: string,
  fileDataUrl?: string,
  fallbackContent?: string
) => {
  if (fileDataUrl) {
    const anchor = document.createElement("a");
    anchor.href = fileDataUrl;
    anchor.download = fileName;
    anchor.click();
    return;
  }
  downloadText(fileName, fallbackContent || "Document preview unavailable.");
};

const getComplianceState = (vendor?: providerSession.ProviderDirectoryEntry | null) => {
  if (!vendor) return { state: "Missing", clinicStatus: "Missing", apcStatuses: [] as string[] };
  const clinicStatus = getDocumentState(vendor.compliance?.clinicLicense);
  const apcStatuses = (vendor.compliance?.doctorApcs ?? []).map((doc) => getDocumentState(doc));
  const hasBlocked = [clinicStatus, ...apcStatuses].some((status) =>
    ["Missing", "Rejected", "Expired"].includes(status)
  );
  const hasReview = [clinicStatus, ...apcStatuses].some((status) => status === "Review");
  const hasExpiring = [clinicStatus, ...apcStatuses].some((status) => status === "Expiring");
  const state = hasBlocked ? "Blocked" : hasReview ? "Review" : hasExpiring ? "Expiring" : "Valid";
  return { state, clinicStatus, apcStatuses };
};

const createEmptyVendorForm = (): providerSession.ProviderDirectoryEntry => ({
  vendorId: "",
  providerName: "",
  status: "Active",
  contactEmail: "",
  contactPhone: "",
  address: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  compliance: {
    clinicLicense: { fileName: "", expiryDate: "", status: "missing" },
    doctorApcs: [],
  },
});

type ComplianceWizardStep = "clinic" | "doctors" | "review";

export default function VendorManagementPage() {
  const providerDirectory = useSyncExternalStore(
    subscribeProviderDirectory,
    getProviderDirectorySnapshot,
    getProviderDirectoryServerSnapshot
  );
  useSyncExternalStore(
    subscribeProviderCredentials,
    getProviderCredentialsSnapshot,
    getProviderCredentialsServerSnapshot
  );
  const vendors = providerDirectory;
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vendorModalView, setVendorModalView] = useState<"details" | "info">("details");
  const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
  const [complianceVendorId, setComplianceVendorId] = useState("");
  const [complianceStep, setComplianceStep] = useState<ComplianceWizardStep>("clinic");
  const [selectedDoctorProviderUserUuid, setSelectedDoctorProviderUserUuid] = useState("");
  const [bulkReviewStatus, setBulkReviewStatus] = useState<null | "approved" | "rejected">(null);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState<providerSession.ProviderDirectoryEntry>(createEmptyVendorForm);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminRoleResolved, setAdminRoleResolved] = useState(false);
  const resolvedAdminRole = adminRole ?? "accountant";
  const isVendorReadOnly = adminRoleResolved ? isAdminReadOnly(resolvedAdminRole, "/admin/vendors") : false;
  const canDeleteVendors = adminRoleResolved ? canDeleteAdminResource(resolvedAdminRole) : false;
  const isVendorAccessPending = !adminRoleResolved;
  const disableVendorEditing = isVendorAccessPending || isVendorReadOnly;
  const [memberForm, setMemberForm] = useState<providerSession.VendorMemberDirectoryEntry>({
    vendorId: "",
    memberId: "",
    fullName: "",
    email: "",
    phone: "",
    role: "",
    status: "Active",
  });
  const [memberCredential, setMemberCredential] = useState({
    password: "",
  });
  const [memberFormError, setMemberFormError] = useState("");
  const [vendorActionNotice, setVendorActionNotice] = useState("");
  const [showClinicUpload, setShowClinicUpload] = useState(false);
  const [clinicUploadDraft, setClinicUploadDraft] = useState({
    fileName: "",
    fileDataUrl: "",
    fileMimeType: "",
    expiryDate: "",
  });
  const [apcUploadDraft, setApcUploadDraft] = useState({
    fileName: "",
    fileDataUrl: "",
    fileMimeType: "",
    expiryDate: "",
  });
  const [memberRefreshVersion, setMemberRefreshVersion] = useState(0);

  useEffect(() => {
    ensureProviderSeed();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchAdminSession();
        if (!cancelled) setAdminRole(session?.role ?? "accountant");
      } catch {
        if (!cancelled) setAdminRole("accountant");
      } finally {
        if (!cancelled) setAdminRoleResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredVendors = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return vendors;
    return vendors.filter((vendor) => {
      return (
        vendor.providerName.toLowerCase().includes(normalized) ||
        vendor.vendorId.toLowerCase().includes(normalized)
      );
    });
  }, [vendors, searchTerm]);

  const activeVendorId = useMemo(() => {
    return selectedVendorId || vendors[0]?.vendorId || "";
  }, [selectedVendorId, vendors]);
  const selectedVendor = useMemo(() => {
    return vendors.find((vendor) => vendor.vendorId === activeVendorId) || null;
  }, [vendors, activeVendorId]);
  const members = useMemo(() => {
    if (!activeVendorId) return [];
    const refreshVersion = memberRefreshVersion;
    if (refreshVersion < 0) return [];
    return getVendorMembersByVendor(activeVendorId);
  }, [activeVendorId, memberRefreshVersion]);
  const memberStats = useMemo(() => {
    const total = members.length;
    const active = members.filter((member) => member.status === "Active").length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [members]);
  const vendorStats = useMemo(() => {
    const total = vendors.length;
    const active = vendors.filter((vendor) => vendor.status === "Active").length;
    return { total, active, inactive: total - active };
  }, [vendors]);
  const complianceVendor = useMemo(() => {
    return vendors.find((vendor) => vendor.vendorId === complianceVendorId) || null;
  }, [vendors, complianceVendorId]);
  const vendorPhoneParts = splitPhoneNumber(vendorForm.contactPhone);
  const memberPhoneParts = splitPhoneNumber(memberForm.phone);
  const complianceState = useMemo(() => getComplianceState(complianceVendor), [complianceVendor]);
  const clinicDoc = useMemo(() => complianceVendor?.compliance?.clinicLicense, [complianceVendor]);
  const apcDocs = useMemo(() => complianceVendor?.compliance?.doctorApcs ?? [], [complianceVendor]);
  const doctorMembers = useMemo(() => {
    if (!complianceVendorId) return [];
    return getVendorMembersByVendor(complianceVendorId)
      .filter((member) => normalizeProviderUserRole(member.role) === "doctor")
      .sort((a, b) => (a.fullName || a.memberId).localeCompare(b.fullName || b.memberId));
  }, [complianceVendorId]);
  const selectedDoctor = useMemo(() => {
    return (
      doctorMembers.find((member) => member.providerUserUuid === selectedDoctorProviderUserUuid) || null
    );
  }, [doctorMembers, selectedDoctorProviderUserUuid]);
  const selectedDoctorApcDoc = useMemo(() => {
    if (!selectedDoctorProviderUserUuid) return null;
    const selectedMember = doctorMembers.find(
      (member) => member.providerUserUuid === selectedDoctorProviderUserUuid
    );
    const memberId = selectedMember?.memberId || "";
    const doc =
      apcDocs.find((row) => row.providerUserId === memberId) ||
      apcDocs.find((row) => row.providerUserId === selectedDoctorProviderUserUuid) ||
      null;
    return doc;
  }, [apcDocs, doctorMembers, selectedDoctorProviderUserUuid]);
  const compliancePendingCount = useMemo(() => {
    const clinicPending = clinicDoc?.status === "submitted" ? 1 : 0;
    const apcPending = apcDocs.filter((doc) => doc.status === "submitted").length;
    return clinicPending + apcPending;
  }, [apcDocs, clinicDoc]);
  const complianceHistory = useMemo(() => {
    if (!complianceVendor) return [];
    const historyRows: Array<{
      type: string;
      subject: string;
      event: string;
      actor: string;
      date: string;
      status: string;
    }> = [];
    if (clinicDoc?.submittedAt) {
      historyRows.push({
        type: "Clinic License",
        subject: clinicDoc.fileName || "Clinic License",
        event: "Submitted",
        actor: clinicDoc.submittedBy || "unknown",
        date: clinicDoc.submittedAt,
        status: getDocumentState(clinicDoc),
      });
    }
    if (clinicDoc?.reviewedAt) {
      historyRows.push({
        type: "Clinic License",
        subject: clinicDoc.fileName || "Clinic License",
        event: "Reviewed",
        actor: clinicDoc.reviewedBy || "Admin",
        date: clinicDoc.reviewedAt,
        status: getDocumentState(clinicDoc),
      });
    }
    apcDocs.forEach((doc) => {
      if (doc.submittedAt) {
        historyRows.push({
          type: "Doctor APC",
          subject: doc.doctorName,
          event: "Submitted",
          actor: doc.submittedBy || "unknown",
          date: doc.submittedAt,
          status: getDocumentState(doc),
        });
      }
      if (doc.reviewedAt) {
        historyRows.push({
          type: "Doctor APC",
          subject: doc.doctorName,
          event: "Reviewed",
          actor: doc.reviewedBy || "Admin",
          date: doc.reviewedAt,
          status: getDocumentState(doc),
        });
      }
    });
    return historyRows.sort((a, b) => b.date.localeCompare(a.date));
  }, [apcDocs, clinicDoc, complianceVendor]);
  const pendingReviews = useMemo(() => {
    return vendors.flatMap((vendor) => {
      const items: Array<{ vendorId: string; providerName: string; type: string; name: string }> = [];
      if (vendor.compliance?.clinicLicense?.status === "submitted") {
        items.push({
          vendorId: vendor.vendorId,
          providerName: vendor.providerName,
          type: "Clinic License",
          name: vendor.compliance.clinicLicense.fileName || "Unnamed file",
        });
      }
      (vendor.compliance?.doctorApcs || []).forEach((doc) => {
        if (doc.status === "submitted") {
          items.push({
            vendorId: vendor.vendorId,
            providerName: vendor.providerName,
            type: "Doctor APC",
            name: `${doc.doctorName} • ${doc.fileName || "Unnamed file"}`,
          });
        }
      });
      return items;
    });
  }, [vendors]);
  const pendingVendorSubmissions = useMemo(() => {
    return providerSession.getVendorPendingComplianceItems(activeVendorId);
  }, [activeVendorId]);

  const reviewCredentialDecision = async (credentialId: string, status: "approved" | "rejected") => {
    if (disableVendorEditing) return;
    await reviewProviderCredential(credentialId, status);
    await refreshProviderCredentialsSnapshot();
  };

  const deleteCredential = async (credentialId: string) => {
    if (!canDeleteVendors) return;
    await deleteProviderCredential(credentialId);
    await refreshProviderCredentialsSnapshot();
  };

  const reviewClinicSubmission = async (status: "approved" | "rejected") => {
    if (!complianceVendor) return;
    const credentialId = complianceVendor.compliance?.clinicLicense?.credentialId;
    if (!credentialId) return;
    await reviewCredentialDecision(credentialId, status);
  };

  useEffect(() => {
    if (!isComplianceModalOpen) return;
    if (complianceStep !== "doctors") return;
    if (selectedDoctorProviderUserUuid) return;
    const firstDoctor = doctorMembers[0]?.providerUserUuid || "";
    if (firstDoctor) setSelectedDoctorProviderUserUuid(firstDoctor);
  }, [complianceStep, doctorMembers, isComplianceModalOpen, selectedDoctorProviderUserUuid]);

  useEffect(() => {
    if (!isComplianceModalOpen) return;
    if (complianceStep !== "doctors") return;
    setApcUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
  }, [complianceStep, isComplianceModalOpen, selectedDoctorProviderUserUuid]);

  const openVendorEditor = (vendor: providerSession.ProviderDirectoryEntry, view: "details" | "info" = "details") => {
    setSelectedVendorId(vendor.vendorId);
    setEditingVendorId(vendor.vendorId);
    setVendorModalView(view);
    setVendorForm(vendor);
    setIsVendorModalOpen(true);
    setShowClinicUpload(false);
    setClinicUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
    setApcUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
  };

  const resetComplianceModalState = () => {
    setComplianceVendorId("");
    setComplianceStep("clinic");
    setSelectedDoctorProviderUserUuid("");
    setShowClinicUpload(false);
    setClinicUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
    setApcUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
  };

  const openComplianceModal = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setComplianceVendorId(vendorId);
    setIsComplianceModalOpen(true);
    setComplianceStep("clinic");
    setSelectedDoctorProviderUserUuid("");
    setShowClinicUpload(false);
    setClinicUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
    setApcUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
  };

  const toggleVendorStatus = (vendor: providerSession.ProviderDirectoryEntry) => {
    if (disableVendorEditing) return;
    const nextStatus = vendor.status === "Active" ? "Disabled" : "Active";
    void saveProviderDirectoryEntry({
      ...vendor,
      status: nextStatus,
    });
    if (editingVendorId === vendor.vendorId) {
      setVendorForm((prev) => ({ ...prev, status: nextStatus }));
    }
  };

  const deleteVendor = (vendor: providerSession.ProviderDirectoryEntry) => {
    if (!canDeleteVendors) return;
    const shouldDelete = window.confirm(`Delete ${vendor.providerName} and all vendor members?`);
    if (!shouldDelete) return;
    void deleteProviderDirectoryEntry(vendor.vendorId);
    if (selectedVendorId === vendor.vendorId) {
      setSelectedVendorId("");
      setMemberRefreshVersion((prev) => prev + 1);
    }
    if (editingVendorId === vendor.vendorId) {
      setIsVendorModalOpen(false);
      setEditingVendorId(null);
      setVendorModalView("details");
    }
  };

  const openAddVendorMember = (vendor: providerSession.ProviderDirectoryEntry) => {
    if (disableVendorEditing) return;
    setSelectedVendorId(vendor.vendorId);
    setMemberForm({
      vendorId: vendor.vendorId,
      memberId: "",
      fullName: "",
      email: "",
      phone: "",
      role: "",
      status: "Active",
    });
    setIsMemberModalOpen(true);
  };

  const renderVendorGridActions = (vendor: providerSession.ProviderDirectoryEntry, vendorPendingCount: number) => (
    <>
      {vendorPendingCount > 0 && (
        <GlassButton className="h-9 px-3 text-xs font-semibold" onClick={() => openComplianceModal(vendor.vendorId)}>
          Approve ({vendorPendingCount})
        </GlassButton>
      )}
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-sky-600 hover:text-sky-700"
        title="Edit vendor"
        onClick={() => openVendorEditor(vendor, "details")}
      >
        <Pencil className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center"
        title="Compliance actions"
        onClick={() => openComplianceModal(vendor.vendorId)}
      >
        <ShieldCheck className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center"
        title={vendor.status === "Active" ? "Disable vendor" : "Activate vendor"}
        onClick={() => toggleVendorStatus(vendor)}
        disabled={disableVendorEditing}
      >
        <Power className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center"
        title="Add member"
        onClick={() => openAddVendorMember(vendor)}
        disabled={disableVendorEditing}
      >
        <UserPlus className="w-4 h-4" />
      </GlassButton>
      {canDeleteVendors && (
        <GlassButton
          variant="ghost"
          className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
          title="Delete vendor"
          onClick={() => deleteVendor(vendor)}
        >
          <XCircle className="w-4 h-4" />
        </GlassButton>
      )}
    </>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Vendor Management</h1>
          <p className="text-slate-500">Manage provider vendors and their staff accounts.</p>
        </div>
        <GlassButton
          className="gap-2"
          disabled={disableVendorEditing}
          onClick={() => {
            setEditingVendorId(null);
            setVendorModalView("details");
            setVendorForm(createEmptyVendorForm());
            setIsVendorModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          {isVendorAccessPending ? "Checking Access..." : "Add Vendor"}
        </GlassButton>
      </div>
      {vendorActionNotice && (
        <GlassCard className="p-4 border-amber-200/70 bg-amber-50/80">
          <p className="text-sm text-amber-800">{vendorActionNotice}</p>
        </GlassCard>
      )}

      <GlassCard className="p-4 space-y-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by vendor name or ID..."
            className="w-full pl-9 pr-4 py-2 glass-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Total Vendors</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{vendorStats.total}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Active Vendors</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{vendorStats.active}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Inactive Vendors</p>
            <p className="text-2xl font-bold text-slate-600 mt-1">{vendorStats.inactive}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Pending Compliance</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{pendingReviews.length}</p>
          </div>
        </div>
      </GlassCard>

      <ResponsiveDataView
        desktop={
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Vendors Grid View</h2>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${pendingReviews.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {pendingReviews.length} pending compliance review
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                    <th className="px-6 py-3">Vendor</th>
                    <th className="px-6 py-3">Vendor ID</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Compliance Status</th>
                    <th className="px-6 py-3">Pending Docs</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVendors.map((vendor) => {
                    const vendorPendingCount = pendingReviews.filter((item) => item.vendorId === vendor.vendorId).length;
                    const compliance = getComplianceState(vendor).state;
                    return (
                      <tr key={vendor.vendorId} className={`border-t border-slate-100 ${activeVendorId === vendor.vendorId ? "bg-emerald-50/60" : "hover:bg-slate-50/60"}`}>
                        <td className="px-6 py-4 font-semibold text-slate-800">{vendor.providerName}</td>
                        <td className="px-6 py-4 text-slate-500">{vendor.vendorId}</td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${vendor.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{vendor.status}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStatusStyles(compliance)}`}>{compliance}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{vendorPendingCount}</td>
                        <td className="px-6 py-4"><div className="flex justify-end gap-2">{renderVendorGridActions(vendor, vendorPendingCount)}</div></td>
                      </tr>
                    );
                  })}
                  {filteredVendors.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No vendors found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        }
        mobile={
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-slate-800">Vendors Grid View</h2>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${pendingReviews.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {pendingReviews.length} pending
              </span>
            </div>
            {filteredVendors.map((vendor) => {
              const vendorPendingCount = pendingReviews.filter((item) => item.vendorId === vendor.vendorId).length;
              const compliance = getComplianceState(vendor).state;
              return (
                <MobileRecordCard
                  key={vendor.vendorId}
                  title={vendor.providerName}
                  subtitle={vendor.vendorId}
                  badge={<span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${vendor.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{vendor.status}</span>}
                  footer={<div className="flex flex-wrap justify-end gap-2">{renderVendorGridActions(vendor, vendorPendingCount)}</div>}
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Compliance Status</p>
                    <p className="mt-1 text-sm text-slate-700">{compliance}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Docs</p>
                    <p className="mt-1 text-sm text-slate-700">{vendorPendingCount}</p>
                  </div>
                </MobileRecordCard>
              );
            })}
            {filteredVendors.length === 0 && (
              <GlassCard className="p-6 text-center text-sm text-slate-400">No vendors found.</GlassCard>
            )}
          </div>
        }
      />

      {isVendorModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              setIsVendorModalOpen(false);
              setEditingVendorId(null);
              setVendorModalView("details");
            }}
          />
          <GlassCard className="w-full max-w-3xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Stethoscope className="w-6 h-6 text-emerald-600" />
                  {editingVendorId ? "Edit Vendor" : "Add Vendor"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {editingVendorId
                    ? "Update vendor profile and contact details."
                    : "Admin creates initial vendor profile and credentials. Compliance and member setup continue after creation."}
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsVendorModalOpen(false);
                  setEditingVendorId(null);
                  setVendorModalView("details");
                }}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            {editingVendorId && (
              <div className="px-8 py-3 border-b border-slate-200/60 bg-white/80 backdrop-blur-md flex gap-2">
                <GlassButton
                  variant={vendorModalView === "details" ? "primary" : "secondary"}
                  className="gap-2"
                  onClick={() => setVendorModalView("details")}
                >
                  <Pencil className="w-4 h-4" />
                  Details
                </GlassButton>
                <GlassButton
                  variant={vendorModalView === "info" ? "primary" : "secondary"}
                  className="gap-2"
                  onClick={() => setVendorModalView("info")}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Info
                </GlassButton>
              </div>
            )}

            <div className="overflow-y-auto p-8 custom-scrollbar">
              {vendorModalView === "details" ? (
                <fieldset disabled={disableVendorEditing} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Vendor ID <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="VND-0003"
                          value={vendorForm.vendorId}
                          onChange={(e) => setVendorForm({ ...vendorForm, vendorId: e.target.value })}
                          required
                        />
                        <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Vendor Name <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="Clinic / Hospital Name"
                          value={vendorForm.providerName}
                          onChange={(e) => setVendorForm({ ...vendorForm, providerName: e.target.value })}
                          required
                        />
                        <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Contact Email</label>
                      <div className="relative">
                        <input
                          type="email"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="contact@vendor.com"
                          value={vendorForm.contactEmail || ""}
                          onChange={(e) => setVendorForm({ ...vendorForm, contactEmail: e.target.value })}
                        />
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Contact Number</label>
                      <div className="flex gap-3">
                        <div className="relative w-28 shrink-0">
                          <select
                            className="w-full glass-input px-3 py-2.5 bg-transparent"
                            value={vendorPhoneParts.countryCode}
                            onChange={(e) =>
                              setVendorForm({
                                ...vendorForm,
                                contactPhone: joinPhoneNumber(e.target.value, vendorPhoneParts.localNumber),
                              })
                            }
                          >
                            {DIAL_CODES.map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="tel"
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="Key in number"
                          value={vendorPhoneParts.localNumber}
                          onChange={(e) =>
                            setVendorForm({
                              ...vendorForm,
                              contactPhone: joinPhoneNumber(vendorPhoneParts.countryCode, e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Address Line 1</label>
                      <input
                        className="w-full glass-input px-4 py-2.5"
                        placeholder="No / Building / Street"
                        value={vendorForm.addressLine1 || ""}
                        onChange={(e) => setVendorForm({ ...vendorForm, addressLine1: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Address Line 2</label>
                      <input
                        className="w-full glass-input px-4 py-2.5"
                        placeholder="Area / District"
                        value={vendorForm.addressLine2 || ""}
                        onChange={(e) => setVendorForm({ ...vendorForm, addressLine2: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">City</label>
                      <input
                        className="w-full glass-input px-4 py-2.5"
                        placeholder="City"
                        value={vendorForm.city || ""}
                        onChange={(e) => setVendorForm({ ...vendorForm, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">State</label>
                      <input
                        className="w-full glass-input px-4 py-2.5"
                        placeholder="State"
                        value={vendorForm.state || ""}
                        onChange={(e) => setVendorForm({ ...vendorForm, state: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Postal Code</label>
                      <div className="relative">
                        <input
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="e.g. 50450"
                          value={vendorForm.postalCode || ""}
                          onChange={(e) => setVendorForm({ ...vendorForm, postalCode: e.target.value })}
                        />
                        <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Status</label>
                      <div className="relative">
                        <select
                          className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                          value={vendorForm.status}
                          onChange={(e) => setVendorForm({ ...vendorForm, status: e.target.value as "Active" | "Disabled" })}
                        >
                          <option value="Active">Active</option>
                          <option value="Disabled">Disabled</option>
                        </select>
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Vendor ID</label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="Auto uses Vendor ID"
                          value={vendorForm.vendorId}
                          readOnly
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                      <p className="text-xs text-slate-500">This ID is used to identify the vendor record.</p>
                    </div>
                  </div>
                </fieldset>
              ) : selectedVendor ? (
                <div className="space-y-6">
                  <GlassCard className="p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Stethoscope className="w-5 h-5 text-emerald-500" />
                          {selectedVendor.providerName}
                        </h2>
                        <p className="text-xs text-slate-500">{selectedVendor.vendorId}</p>
                      </div>
                      <GlassButton
                        className="gap-2"
                        disabled={disableVendorEditing}
                        onClick={() => {
                          setMemberForm({
                            vendorId: selectedVendor.vendorId,
                            memberId: "",
                            fullName: "",
                            email: "",
                            phone: "",
                            role: "",
                            status: "Active",
                          });
                          setMemberCredential({ password: "" });
                          setMemberFormError("");
                          setIsMemberModalOpen(true);
                        }}
                      >
                        <Users className="w-4 h-4" />
                        Add Member
                      </GlassButton>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Contact</p>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Mail className="w-4 h-4 text-slate-400" />
                          {selectedVendor.contactEmail || "Not provided"}
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone className="w-4 h-4 text-slate-400" />
                          {formatPhoneForDisplay(selectedVendor.contactPhone) || "Not provided"}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Address</p>
                        <p className="text-slate-600">{buildAddressLine(selectedVendor) || selectedVendor.address || "Not provided"}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">Vendor Members Overview</h3>
                      <span className="text-xs text-slate-500">{memberStats.total} total</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Total Members</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{memberStats.total}</p>
                      </div>
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Active Members</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{memberStats.active}</p>
                      </div>
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Inactive Members</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{memberStats.inactive}</p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a vendor to view details.</p>
              )}
            </div>

            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              <GlassButton
                variant="secondary"
                onClick={() => {
                  setIsVendorModalOpen(false);
                  setEditingVendorId(null);
                  setVendorModalView("details");
                }}
              >
                Cancel
              </GlassButton>
              {vendorModalView === "details" && (
                <GlassButton
                  disabled={disableVendorEditing}
                  onClick={async () => {
                    if (disableVendorEditing) return;
                    if (!vendorForm.vendorId || !vendorForm.providerName) return;
                    await fetch("/api/admin/providers/upsert", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        vendorId: vendorForm.vendorId,
                        providerName: vendorForm.providerName,
                        status: vendorForm.status === "Disabled" ? "disabled" : "active",
                        contactEmail: vendorForm.contactEmail || undefined,
                        contactPhone: normalizePhone(vendorForm.contactPhone) || undefined,
                        addressLine1: vendorForm.addressLine1 || undefined,
                        addressLine2: vendorForm.addressLine2 || undefined,
                        city: vendorForm.city || undefined,
                        state: vendorForm.state || undefined,
                        postalCode: vendorForm.postalCode || undefined,
                        complianceStatus: vendorForm.complianceStatus || undefined,
                      }),
                    });
                    await refreshProviderDirectorySnapshot();
                    await refreshProviderCredentialsSnapshot();
                    await refreshVendorMembersSnapshot();
                    setSelectedVendorId(vendorForm.vendorId);
                    setMemberRefreshVersion((prev) => prev + 1);
                    setVendorForm(createEmptyVendorForm());
                    setEditingVendorId(null);
                    setVendorModalView("details");
                    setIsVendorModalOpen(false);
                  }}
                >
                  {isVendorAccessPending ? "Checking Access..." : editingVendorId ? "Update Vendor" : "Save Vendor"}
                </GlassButton>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {isComplianceModalOpen && complianceVendor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              setIsComplianceModalOpen(false);
              resetComplianceModalState();
            }}
          />
          <GlassCard className="w-full max-w-6xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  Compliance Management
                </h2>
                <p className="text-sm text-slate-500 mt-1">{complianceVendor.providerName} • {complianceVendor.vendorId}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${getStatusStyles(complianceState.state)}`}>
                  {complianceState.state}
                </span>
                <button
                  onClick={() => {
                    setIsComplianceModalOpen(false);
                    resetComplianceModalState();
                  }}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Overall Status</p>
                  <p className="text-2xl font-bold mt-1 text-slate-800">{complianceState.state}</p>
                </div>
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Pending Reviews</p>
                  <p className="text-2xl font-bold mt-1 text-amber-700">{compliancePendingCount}</p>
                </div>
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Clinic License</p>
                  <p className="text-2xl font-bold mt-1 text-slate-800">{getDocumentState(clinicDoc)}</p>
                </div>
                <div className="glass-card rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">Doctor APC Files</p>
                  <p className="text-2xl font-bold mt-1 text-slate-800">{apcDocs.length}</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <GlassButton
                  variant={complianceStep === "clinic" ? "primary" : "secondary"}
                  className="gap-2 justify-center"
                  onClick={() => setComplianceStep("clinic")}
                >
                  Clinic License
                </GlassButton>
                <GlassButton
                  variant={complianceStep === "doctors" ? "primary" : "secondary"}
                  className="gap-2 justify-center"
                  onClick={() => setComplianceStep("doctors")}
                >
                  Doctors (APC)
                </GlassButton>
                <GlassButton
                  variant={complianceStep === "review" ? "primary" : "secondary"}
                  className="gap-2 justify-center"
                  onClick={() => setComplianceStep("review")}
                >
                  Review Queue{pendingVendorSubmissions.length ? ` (${pendingVendorSubmissions.length})` : ""}
                </GlassButton>
              </div>

              {complianceStep === "clinic" && (
                <GlassCard className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-slate-400">Clinic License</p>
                      <p className="text-base font-bold text-slate-800 mt-1">{clinicDoc?.fileName || "Not uploaded"}</p>
                      <p className="text-xs text-slate-500 mt-1">Expiry: {clinicDoc?.expiryDate || "—"}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {clinicDoc?.submittedBy ? `Submitted by ${clinicDoc.submittedBy}` : "No submission yet"}
                        {clinicDoc?.submittedAt ? ` • ${clinicDoc.submittedAt}` : ""}
                      </p>
                      <p className="text-xs text-slate-400">
                        {clinicDoc?.reviewedBy ? `Reviewed by ${clinicDoc.reviewedBy}` : "Not reviewed"}
                        {clinicDoc?.reviewedAt ? ` • ${clinicDoc.reviewedAt}` : ""}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">
                        <span className="font-semibold text-slate-600">Next action:</span>{" "}
                        {getClinicNextActionMessage(clinicDoc)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${getStatusStyles(getDocumentState(clinicDoc))}`}>
                      {getDocumentState(clinicDoc)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <GlassButton
                        variant="secondary"
                        size="sm"
                        className="h-9 px-4 text-sm font-semibold"
                        disabled={!clinicDoc?.fileName}
                        onClick={() =>
                          downloadComplianceDocument(
                            clinicDoc?.fileName || "clinic-license.pdf",
                            clinicDoc?.fileDataUrl,
                            `Vendor: ${complianceVendor.providerName}\nDocument: Clinic License\nExpiry: ${clinicDoc?.expiryDate || "-"}`
                          )
                        }
                      >
                        Download
                      </GlassButton>
                      <GlassButton
                        size="sm"
                        className="h-9 px-4 text-sm font-semibold"
                        disabled={disableVendorEditing}
                        onClick={() => setShowClinicUpload((prev) => !prev)}
                      >
                        {showClinicUpload ? "Hide Upload" : getClinicUploadActionLabel(clinicDoc)}
                      </GlassButton>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {clinicDoc?.status === "submitted" ? (
                        <>
                          <GlassButton
                            size="sm"
                            className="h-9 px-4 text-sm"
                            disabled={disableVendorEditing}
                            onClick={() => void reviewClinicSubmission("approved")}
                          >
                            Approve
                          </GlassButton>
                          <GlassButton
                            size="sm"
                            className="h-9 px-4 text-sm"
                            variant="ghost"
                            disabled={disableVendorEditing}
                            onClick={() => void reviewClinicSubmission("rejected")}
                          >
                            Reject
                          </GlassButton>
                        </>
                      ) : null}
                      {canDeleteVendors && (
                        <GlassButton
                          variant="ghost"
                          size="sm"
                          className="h-9 px-4 text-sm text-rose-700 hover:bg-rose-50 border-rose-200"
                          disabled={!clinicDoc?.credentialId}
                          onClick={() => {
                            const credentialId = clinicDoc?.credentialId;
                            if (!credentialId) return;
                            void deleteCredential(credentialId);
                          }}
                        >
                          Request Update
                        </GlassButton>
                      )}
                    </div>
                  </div>
                  {showClinicUpload && (
                    <fieldset disabled={disableVendorEditing} className="pt-2 border-t border-slate-200/60 space-y-2">
                      <label className="glass-input px-3 py-2.5 cursor-pointer flex items-center justify-between text-sm text-slate-700 rounded-xl border border-slate-200/70 bg-white/80 shadow-sm hover:bg-white">
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const dataUrl = await readFileAsDataUrl(file);
                            setClinicUploadDraft((prev) => ({
                              ...prev,
                              fileName: file.name,
                              fileDataUrl: dataUrl,
                              fileMimeType: file.type,
                            }));
                          }}
                        />
                        <span className="font-medium truncate">{clinicUploadDraft.fileName || "Choose file"}</span>
                        <span className="text-xs uppercase tracking-wider text-slate-400">Browse</span>
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          className="glass-input px-3 py-2 bg-slate-50 text-slate-500 cursor-not-allowed"
                          placeholder="clinic-license.pdf"
                          value={clinicUploadDraft.fileName}
                          readOnly
                        />
                        <input
                          type="date"
                          className="glass-input px-3 py-2"
                          value={clinicUploadDraft.expiryDate}
                          onChange={(e) => setClinicUploadDraft((prev) => ({ ...prev, expiryDate: e.target.value }))}
                        />
                      </div>
                      <GlassButton
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          if (disableVendorEditing) return;
                          if (!clinicUploadDraft.fileName || !clinicUploadDraft.expiryDate) return;
                          submitVendorClinicLicense(complianceVendor.vendorId, {
                            fileName: clinicUploadDraft.fileName,
                            fileDataUrl: clinicUploadDraft.fileDataUrl,
                            fileMimeType: clinicUploadDraft.fileMimeType,
                            expiryDate: clinicUploadDraft.expiryDate,
                            submittedBy: "admin",
                          });
                          setShowClinicUpload(false);
                          setClinicUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
                        }}
                      >
                        Record Clinic Upload
                      </GlassButton>
                    </fieldset>
                  )}
                </GlassCard>
              )}

              {complianceStep === "doctors" && (
                <GlassCard className="p-6 space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="glass-card rounded-2xl p-0 overflow-hidden lg:col-span-1">
                      <div className="px-4 py-3 border-b border-slate-200/60 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Doctors (APC)</p>
                        <span className="text-xs text-slate-500">{doctorMembers.length} doctors</span>
                      </div>
                      <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                        {doctorMembers.map((member) => {
                          const doc =
                            apcDocs.find((row) => row.providerUserId === member.memberId) ||
                            (member.providerUserUuid
                              ? apcDocs.find((row) => row.providerUserId === member.providerUserUuid)
                              : undefined);
                          const isSelected = !!member.providerUserUuid && member.providerUserUuid === selectedDoctorProviderUserUuid;
                          return (
                            <button
                              key={member.providerUserUuid || member.memberId}
                              type="button"
                              className={`w-full text-left px-4 py-3 border-t border-slate-100 hover:bg-slate-50/60 transition-colors ${isSelected ? "bg-emerald-50/60" : ""}`}
                              onClick={() => {
                                if (!member.providerUserUuid) return;
                                setSelectedDoctorProviderUserUuid(member.providerUserUuid);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 truncate">
                                    {member.fullName || "Unnamed doctor"}
                                  </p>
                                  <p className="text-[11px] text-slate-500 truncate">{member.memberId}</p>
                                  <p className="text-[11px] text-slate-400 truncate">
                                    {doc?.fileName ? doc.fileName : "No APC uploaded"}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStatusStyles(
                                    getDocumentState(doc)
                                  )}`}
                                >
                                  {getDocumentState(doc)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                        {doctorMembers.length === 0 && (
                          <div className="px-4 py-10 text-center text-sm text-slate-400">
                            No doctor users found for this vendor.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="glass-card rounded-2xl p-5 space-y-4 lg:col-span-2">
                      {selectedDoctor ? (
                        <>
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-widest text-slate-400">Selected Doctor</p>
                              <p className="text-lg font-bold text-slate-800 mt-1">
                                {selectedDoctor.fullName || "Unnamed doctor"}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">{selectedDoctor.memberId}</p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {selectedDoctor.providerUserUuid || "—"}
                              </p>
                            </div>
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${getStatusStyles(
                                getDocumentState(selectedDoctorApcDoc || undefined)
                              )}`}
                            >
                              {getDocumentState(selectedDoctorApcDoc || undefined)}
                            </span>
                          </div>

                          <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-widest text-slate-400">Current APC</p>
                                <p className="text-sm font-semibold text-slate-800 mt-1 truncate">
                                  {selectedDoctorApcDoc?.fileName || "Not uploaded"}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  Expiry: {selectedDoctorApcDoc?.expiryDate || "—"}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                  {selectedDoctorApcDoc?.submittedAt
                                    ? `Submitted • ${selectedDoctorApcDoc.submittedAt}`
                                    : "No submission yet"}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {selectedDoctorApcDoc?.reviewedAt
                                    ? `Reviewed • ${selectedDoctorApcDoc.reviewedAt}`
                                    : "Not reviewed"}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0">
                                <GlassButton
                                  variant="secondary"
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  disabled={!selectedDoctorApcDoc?.fileName}
                                  onClick={() => {
                                    if (!selectedDoctorApcDoc?.fileName) return;
                                    downloadComplianceDocument(
                                      selectedDoctorApcDoc.fileName || "doctor-apc.pdf",
                                      selectedDoctorApcDoc.fileDataUrl,
                                      `Vendor: ${complianceVendor.providerName}\nDoctor: ${selectedDoctor.fullName || selectedDoctor.memberId}\nExpiry: ${selectedDoctorApcDoc.expiryDate || "-"}`
                                    );
                                  }}
                                >
                                  Download
                                </GlassButton>
                                {canDeleteVendors && (
                                  <GlassButton
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-3 text-xs text-rose-600 hover:text-rose-700"
                                    disabled={!selectedDoctorApcDoc?.credentialId}
                                    onClick={() => {
                                      const credentialId = selectedDoctorApcDoc?.credentialId;
                                      if (!credentialId) return;
                                      void deleteCredential(credentialId);
                                      setApcUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete
                                  </GlassButton>
                                )}
                              </div>
                            </div>

                            {selectedDoctorApcDoc?.status === "submitted" && (
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                                <GlassButton
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  disabled={disableVendorEditing}
                                  onClick={() => {
                                    const credentialId = selectedDoctorApcDoc?.credentialId;
                                    if (!credentialId) return;
                                    void reviewCredentialDecision(credentialId, "approved");
                                  }}
                                >
                                  Approve
                                </GlassButton>
                                <GlassButton
                                  size="sm"
                                  className="h-8 px-3 text-xs"
                                  variant="secondary"
                                  disabled={disableVendorEditing}
                                  onClick={() => {
                                    const credentialId = selectedDoctorApcDoc?.credentialId;
                                    if (!credentialId) return;
                                    void reviewCredentialDecision(credentialId, "rejected");
                                  }}
                                >
                                  Reject
                                </GlassButton>
                              </div>
                            )}
                          </div>

                          <fieldset disabled={disableVendorEditing} className="pt-2 border-t border-slate-200/60 space-y-2">
                            <p className="text-xs uppercase tracking-widest text-slate-400">
                              {selectedDoctorApcDoc?.fileName ? "Replace APC" : "Upload APC"}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                              <label className="glass-input px-3 py-2 cursor-pointer flex items-center text-sm text-slate-600 md:col-span-2">
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const dataUrl = await readFileAsDataUrl(file);
                                    setApcUploadDraft((prev) => ({
                                      ...prev,
                                      fileName: file.name,
                                      fileDataUrl: dataUrl,
                                      fileMimeType: file.type,
                                    }));
                                  }}
                                />
                                {apcUploadDraft.fileName || "Choose APC file"}
                              </label>
                              <input
                                type="date"
                                className="glass-input px-3 py-2"
                                value={apcUploadDraft.expiryDate}
                                onChange={(e) => setApcUploadDraft((prev) => ({ ...prev, expiryDate: e.target.value }))}
                              />
                              <GlassButton
                                onClick={() => {
                                  if (disableVendorEditing) return;
                                  if (!selectedDoctor.providerUserUuid) return;
                                  if (!apcUploadDraft.fileName || !apcUploadDraft.expiryDate) return;
                                  submitVendorDoctorApc(complianceVendor.vendorId, {
                                    providerUserId: selectedDoctor.providerUserUuid,
                                    fileName: apcUploadDraft.fileName,
                                    fileDataUrl: apcUploadDraft.fileDataUrl,
                                    fileMimeType: apcUploadDraft.fileMimeType,
                                    expiryDate: apcUploadDraft.expiryDate,
                                    submittedBy: "admin",
                                  });
                                  setApcUploadDraft({ fileName: "", fileDataUrl: "", fileMimeType: "", expiryDate: "" });
                                }}
                              >
                                {selectedDoctorApcDoc?.fileName ? "Replace APC" : "Upload APC"}
                              </GlassButton>
                            </div>
                          </fieldset>
                        </>
                      ) : (
                        <div className="text-sm text-slate-500">Select a doctor to manage APC details.</div>
                      )}
                    </div>
                  </div>

                  {complianceState.state === "Blocked" && (
                    <p className="text-xs text-rose-600">Claim submissions are auto-blocked for missing, expired, or rejected compliance.</p>
                  )}
                </GlassCard>
              )}

              {complianceStep === "review" && (
                <>
                  <GlassCard className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-widest text-slate-400">Vendor Submitted Review Queue</p>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${pendingVendorSubmissions.length > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {pendingVendorSubmissions.length} pending
                      </span>
                    </div>
                    {pendingVendorSubmissions.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/80 p-3">
                          <p className="text-xs text-slate-500">
                            Bulk review runs sequentially ({pendingVendorSubmissions.length} items).
                          </p>
                          <div className="flex gap-2">
                            <GlassButton
                              className="h-9 px-4"
                              disabled={disableVendorEditing || bulkReviewStatus !== null}
                              onClick={async () => {
                                if (disableVendorEditing) return;
                                if (bulkReviewStatus !== null) return;
                                setBulkReviewStatus("approved");
                                try {
                                  for (const item of pendingVendorSubmissions) {
                                    if (!item.credentialId) continue;
                                    await reviewCredentialDecision(item.credentialId, "approved");
                                  }
                                } finally {
                                  setBulkReviewStatus(null);
                                }
                              }}
                            >
                              Approve All
                            </GlassButton>
                            <GlassButton
                              variant="secondary"
                              className="h-9 px-4"
                              disabled={disableVendorEditing || bulkReviewStatus !== null}
                              onClick={async () => {
                                if (disableVendorEditing) return;
                                if (bulkReviewStatus !== null) return;
                                setBulkReviewStatus("rejected");
                                try {
                                  for (const item of pendingVendorSubmissions) {
                                    if (!item.credentialId) continue;
                                    await reviewCredentialDecision(item.credentialId, "rejected");
                                  }
                                } finally {
                                  setBulkReviewStatus(null);
                                }
                              }}
                            >
                              Reject All
                            </GlassButton>
                          </div>
                        </div>
                        {pendingVendorSubmissions.map((item) => (
                          <div
                            key={`${item.credentialId || item.kind}-${item.submittedAt || ""}-${item.name}`}
                            className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-800">
                                {item.kind === "clinic_license" ? "Clinic License" : "Doctor APC"}
                              </p>
                              <p className="text-xs text-slate-500">{item.name}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                Submitted by vendor • {item.submittedAt || TODAY_KEY}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <GlassButton
                                variant="secondary"
                                className="h-9 px-4"
                                onClick={() => {
                                  const doc =
                                    item.kind === "clinic_license"
                                      ? clinicDoc
                                      : apcDocs.find((row) => row.credentialId === item.credentialId) ||
                                        apcDocs.find((row) => row.providerUserId === item.providerUserId);
                                  const fileName = doc?.fileName || item.name || "compliance-document";
                                  downloadComplianceDocument(
                                    fileName,
                                    doc?.fileDataUrl,
                                    `Vendor: ${complianceVendor.providerName}\nType: ${
                                      item.kind === "clinic_license" ? "Clinic License" : "Doctor APC"
                                    }\nName: ${item.name}\nSubmitted: ${item.submittedAt || "-"}\nExpiry: ${doc?.expiryDate || "-"}`
                                  );
                                }}
                              >
                                Download
                              </GlassButton>
                              <GlassButton
                                className="h-9 px-4"
                                disabled={disableVendorEditing || bulkReviewStatus !== null || !item.credentialId}
                                onClick={() => {
                                  if (!item.credentialId) return;
                                  void reviewCredentialDecision(item.credentialId, "approved");
                                }}
                              >
                                Approve
                              </GlassButton>
                              <GlassButton
                                variant="secondary"
                                className="h-9 px-4"
                                disabled={disableVendorEditing || bulkReviewStatus !== null || !item.credentialId}
                                onClick={() => {
                                  if (!item.credentialId) return;
                                  void reviewCredentialDecision(item.credentialId, "rejected");
                                }}
                              >
                                Reject
                              </GlassButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No vendor-submitted files waiting for approval.</p>
                    )}
                  </GlassCard>

                  <GlassCard className="p-0 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">Compliance History</h3>
                      <span className="text-xs text-slate-500">{complianceHistory.length} events</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50/80">
                          <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                            <th className="px-6 py-3">Type</th>
                            <th className="px-6 py-3">Subject</th>
                            <th className="px-6 py-3">Event</th>
                            <th className="px-6 py-3">Actor</th>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {complianceHistory.map((row, index) => (
                            <tr key={`${row.type}-${row.subject}-${row.event}-${row.date}-${index}`} className="border-t border-slate-100">
                              <td className="px-6 py-4 text-slate-700">{row.type}</td>
                              <td className="px-6 py-4 font-medium text-slate-800">{row.subject}</td>
                              <td className="px-6 py-4 text-slate-600">{row.event}</td>
                              <td className="px-6 py-4 text-slate-600 capitalize">{row.actor}</td>
                              <td className="px-6 py-4 text-slate-500">{row.date}</td>
                              <td className="px-6 py-4">
                                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStatusStyles(row.status)}`}>
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {complianceHistory.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No compliance history yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </GlassCard>
                </>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {isMemberModalOpen && selectedVendor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsMemberModalOpen(false)} />
          <GlassCard className="w-full max-w-3xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Users className="w-6 h-6 text-emerald-600" />
                  Add Vendor Member
                </h2>
                <p className="text-sm text-slate-500 mt-1">Assign staff access for {selectedVendor.providerName}.</p>
              </div>
              <button 
                onClick={() => setIsMemberModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar">
              <fieldset disabled={disableVendorEditing} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Member ID <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="VND-0003-ADM"
                        value={memberForm.memberId}
                        onChange={(e) => setMemberForm({ ...memberForm, memberId: e.target.value })}
                        required
                      />
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="Staff Name"
                        value={memberForm.fullName}
                        onChange={(e) => setMemberForm({ ...memberForm, fullName: e.target.value })}
                        onBlur={() => setMemberForm((prev) => ({ ...prev, fullName: normalizeName(prev.fullName) }))}
                        required
                      />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Email <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="email"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="staff@vendor.com"
                        value={memberForm.email}
                        onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                        required
                      />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Contact Number</label>
                    <div className="flex gap-3">
                      <div className="relative w-28 shrink-0">
                        <select
                          className="w-full glass-input px-3 py-2.5 bg-transparent"
                          value={memberPhoneParts.countryCode}
                          onChange={(e) =>
                            setMemberForm({
                              ...memberForm,
                              phone: joinPhoneNumber(e.target.value, memberPhoneParts.localNumber),
                            })
                          }
                        >
                          {DIAL_CODES.map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="tel"
                        className="w-full glass-input px-4 py-2.5"
                        placeholder="Key in number"
                        value={memberPhoneParts.localNumber}
                        onChange={(e) =>
                          setMemberForm({
                            ...memberForm,
                            phone: joinPhoneNumber(memberPhoneParts.countryCode, e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Role</label>
                    <div className="relative">
                      <select
                        className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                        value={memberForm.role || ""}
                        onChange={(e) => {
                          setMemberFormError("");
                          setMemberForm({ ...memberForm, role: e.target.value });
                        }}
                      >
                        <option value="">Select role</option>
                        <option value="Admin">Admin</option>
                        <option value="Doctor">Doctor</option>
                      </select>
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Temporary Password <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="password"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="Create temporary password"
                        value={memberCredential.password}
                        onChange={(e) => setMemberCredential((prev) => ({ ...prev, password: e.target.value }))}
                        required
                      />
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <div className="relative">
                      <select
                        className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                        value={memberForm.status}
                        onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value as "Active" | "Disabled" })}
                      >
                        <option value="Active">Active</option>
                        <option value="Disabled">Disabled</option>
                      </select>
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                    {memberForm.role === "Doctor" && (
                      <p className="text-[11px] text-amber-700 md:col-span-2">
                        Doctor operational usage depends on an approved APC. If APC is missing after save, Compliance Management opens so you can upload it immediately.
                      </p>
                    )}
                </div>
              </fieldset>
            </div>

            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              {memberFormError && <p className="mr-auto text-xs text-red-500 font-medium self-center">{memberFormError}</p>}
              <GlassButton
                variant="secondary"
                onClick={() => {
                  setMemberFormError("");
                  setIsMemberModalOpen(false);
                }}
              >
                Cancel
              </GlassButton>
              <GlassButton
                disabled={disableVendorEditing}
                onClick={async () => {
                  if (disableVendorEditing) return;
                  if (!memberForm.memberId || !memberForm.fullName || !memberForm.email) {
                    setMemberFormError("Please complete Member ID, Full Name, and Email.");
                    return;
                  }
                  if (!memberForm.role || !["Admin", "Doctor"].includes(memberForm.role)) {
                    setMemberFormError("Please select a valid role.");
                    return;
                  }
                  if (!memberCredential.password) {
                    setMemberFormError("Temporary password is required.");
                    return;
                  }
                  const response = await fetch("/api/admin/providers/create-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      vendorId: selectedVendor.vendorId,
                      memberCode: memberForm.memberId,
                      fullName: normalizeName(memberForm.fullName),
                      email: memberForm.email,
                      password: memberCredential.password,
                      phone: normalizePhone(memberForm.phone) || undefined,
                      role: normalizeProviderUserRole(memberForm.role) || memberForm.role || "provider_user",
                      status: memberForm.status === "Disabled" ? "disabled" : "active",
                    }),
                  });
                  const payload = (await response.json()) as {
                    ok?: boolean;
                    error?: string;
                    providerUserId?: string | null;
                    requiresApcUpload?: boolean;
                  };
                  if (!response.ok || !payload.ok) {
                    setMemberFormError(payload.error || "Unable to create vendor member login.");
                    return;
                  }
                  await refreshVendorMembersSnapshot();
                  setMemberForm({
                    vendorId: selectedVendor.vendorId,
                    memberId: "",
                    fullName: "",
                    email: "",
                    phone: "",
                    role: "",
                    status: "Active",
                  });
                  setMemberCredential({ password: "" });
                  setMemberFormError("");
                  setMemberRefreshVersion((prev) => prev + 1);
                  setIsMemberModalOpen(false);
                  if (memberForm.role === "Doctor" && payload.requiresApcUpload && payload.providerUserId) {
                    setVendorActionNotice(
                      "Doctor member created. APC upload and approval are still required before operational use."
                    );
                    setSelectedVendorId(selectedVendor.vendorId);
                    setComplianceVendorId(selectedVendor.vendorId);
                    setComplianceStep("doctors");
                    setSelectedDoctorProviderUserUuid(payload.providerUserId);
                    setIsComplianceModalOpen(true);
                  } else {
                    setVendorActionNotice("");
                  }
                }}
              >
                {isVendorAccessPending ? "Checking Access..." : "Save Member"}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
