"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassField } from "@/components/ui/GlassField";
import { MobileDetailModal } from "@/components/ui/MobileDetailModal";
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  Search, 
  UserCheck, 
  AlertCircle,
  Calendar,
  CheckCircle2,
  QrCode
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  ensureProviderSeed,
  refreshProviderCredentialsSnapshot,
  refreshProviderDirectorySnapshot,
  refreshVendorMembersSnapshot,
  getProviderById,
  getProviderCredentialsServerSnapshot,
  getProviderCredentialsSnapshot,
  getProviderDirectoryServerSnapshot,
  getProviderDirectorySnapshot,
  getProviderSession,
  getProviderUserById,
  getVendorMembersByVendor,
  getVendorMembersServerSnapshot,
  getVendorMembersSnapshot,
  normalizeProviderUserRole,
  subscribeProviderCredentials,
  subscribeProviderDirectory,
  subscribeVendorMembers,
  type ProviderSession,
} from "@/lib/providerSession";
import {
  ensureMemberSeed,
  getMemberDirectoryServerSnapshot,
  getMemberDirectorySnapshot,
  subscribeMemberDirectory,
} from "@/lib/memberSession";
import {
  ensureCompaniesStore,
  getCompaniesServerSnapshot,
  getCompaniesSnapshot,
  subscribeCompanies,
  type CompanyPlanCategoryKey,
} from "@/lib/companyStore";
import { getCategoryLimit, getMemberLimitOwnerStaffId, resolveMemberPlan } from "@/lib/memberPlan";
import { formatCurrency } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/basePath";
import { generateMedicalCertificatePdf, generateReferralLetterPdf } from "@/lib/providerDocuments";
import { getLimitLocks, getUtilizations, releaseReservation, reserveLimit } from "@/lib/entitlementStore";
import { fetchCatalogItemRows, fetchCatalogItems } from "@/lib/catalog/supabase";
import { ensureServiceTypeRulesSeed, isSectionAllowed, type CatalogSection } from "@/lib/catalog/serviceTypeRules";
import { uploadProviderClaimFile, type ProviderClaimDocumentType } from "@/lib/providerClaimStorage";
import {
  ensureProviderClaimsStore,
  getProviderClaimById,
  getProviderClaimDocuments,
  getProviderClaimsServerSnapshot,
  getProviderClaimsSnapshot,
  insertProviderClaim,
  insertProviderClaimDocuments,
  subscribeProviderClaims,
  updateProviderClaim,
  upsertProviderClaimDocument,
} from "@/lib/providerClaimsStore";
import { upsertPanelVisitTransaction } from "@/lib/panelVisitStore";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchDiagnosisOptions } from "@/lib/diagnosisOptions";
import { getProviderSubmissionGuard } from "@/lib/providerComplianceGuard";
import { QrScanner } from "@/components/ui/QrScanner";

const generateClaimId = () => {
  const stamp = Date.now().toString().slice(-8);
  return `CLM-${stamp}`;
};

const parseDependentIdFromDirectoryStaffId = (staffId: string) => {
  const parts = staffId.split("-DEP-");
  if (parts.length < 2) return null;
  const dependentId = (parts[1] || "").trim();
  return dependentId || null;
};

type ClaimLimitLock = {
  claimId: string;
  memberKey: string;
  amount: number;
  category: CompanyPlanCategoryKey;
  createdAt: string;
};

type ClaimUtilization = {
  claimId: string;
  memberKey: string;
  amount: number;
  category: CompanyPlanCategoryKey;
  approvedAt: string;
};

type CurrentProviderUserRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  providers: { id: string | null; vendor_id: string | null; provider_name: string | null } | null;
};

type ProviderClaimUploadItem = {
  docType: ProviderClaimDocumentType;
  storagePath: string;
  fileName: string;
  mimeType: string;
};

const formatProviderRole = (role?: string | null) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "doctor" ? "Doctor" : "Admin";
};

export default function ProviderInvoicePage() {
  const router = useRouter();
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const memberDirectory = useSyncExternalStore(
    subscribeMemberDirectory,
    getMemberDirectorySnapshot,
    getMemberDirectoryServerSnapshot
  );
  const providerClaimsSnapshot = useSyncExternalStore(
    subscribeProviderClaims,
    getProviderClaimsSnapshot,
    getProviderClaimsServerSnapshot
  );
  const [patientId, setPatientId] = useState("");
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [treatmentDate, setTreatmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(generateClaimId());
  const [doctorUserId, setDoctorUserId] = useState("");
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);
  const [diagnosisToAdd, setDiagnosisToAdd] = useState("");
  const [medicationDescription, setMedicationDescription] = useState("");
  const [consultationFee, setConsultationFee] = useState("");
  const [medicationFee, setMedicationFee] = useState("");
  const [injectionFee, setInjectionFee] = useState("");
  const [investigationFee, setInvestigationFee] = useState("");
  const [procedureFee, setProcedureFee] = useState("");
  const [immunizationFee, setImmunizationFee] = useState("");
  const [adminDraftTotalAmount, setAdminDraftTotalAmount] = useState("");
  const [serviceType, setServiceType] = useState("Outpatient (OP)");
  const [mcRequired, setMcRequired] = useState<"Y" | "N">("N");
  const [mcFrom, setMcFrom] = useState("");
  const [mcTo, setMcTo] = useState("");
  const [rlRequired, setRlRequired] = useState<"Y" | "N">("N");
  const [mcFile, setMcFile] = useState<File | null>(null);
  const [mcFileName, setMcFileName] = useState("");
  const [referralFile, setReferralFile] = useState<File | null>(null);
  const [referralFileName, setReferralFileName] = useState("");
  const [finalBillFile, setFinalBillFile] = useState<File | null>(null);
  const [finalBillFileName, setFinalBillFileName] = useState("");
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastSubmittedClaimId, setLastSubmittedClaimId] = useState("");
  const [lastSubmitWasResubmit, setLastSubmitWasResubmit] = useState(false);
  const [editProviderClaimId, setEditProviderClaimId] = useState("");
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [referralDraft, setReferralDraft] = useState({
    date: "",
    specialistName: "",
    hospital: "",
    memberName: "",
    memberIdNo: "",
    details: "",
  });
  const [referralDraftErrors, setReferralDraftErrors] = useState<Record<string, string>>({});
  const [selectedChargeItems, setSelectedChargeItems] = useState<Record<string, string[]>>({
    medication: [],
    injection: [],
    investigation: [],
    procedure: [],
    immunization: [],
  });
  const [chargePickerDraft, setChargePickerDraft] = useState<Record<string, string>>({
    medication: "",
    injection: "",
    investigation: "",
    procedure: "",
    immunization: "",
  });
  const [chargeCustomDraft, setChargeCustomDraft] = useState<Record<string, string>>({
    medication: "",
    injection: "",
    investigation: "",
    procedure: "",
    immunization: "",
  });
  const [medicationOptions, setMedicationOptions] = useState<string[]>([]);
  const [injectionOptions, setInjectionOptions] = useState<string[]>([]);
  const [immunizationOptions, setImmunizationOptions] = useState<string[]>([]);
  const [investigationOptions, setInvestigationOptions] = useState<string[]>([]);
  const [frequencyOptions, setFrequencyOptions] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [diagnosisOptions, setDiagnosisOptions] = useState<string[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [selectedChargeItemMeta, setSelectedChargeItemMeta] = useState<
    Record<string, Record<string, { quantity: string; unit: string; frequency: string }>>
  >({
    medication: {},
    injection: {},
    immunization: {},
  });
  const sanitizeSelectedChargeItems = (value: unknown): Record<string, string[]> => {
    if (!value || typeof value !== "object") {
      return {
        medication: [],
        injection: [],
        investigation: [],
        procedure: [],
        immunization: [],
      };
    }
    const source = value as Record<string, unknown>;
    return {
      medication: Array.isArray(source.medication) ? source.medication.filter((item): item is string => typeof item === "string") : [],
      injection: Array.isArray(source.injection) ? source.injection.filter((item): item is string => typeof item === "string") : [],
      investigation: Array.isArray(source.investigation)
        ? source.investigation.filter((item): item is string => typeof item === "string")
        : [],
      procedure: Array.isArray(source.procedure) ? source.procedure.filter((item): item is string => typeof item === "string") : [],
      immunization: Array.isArray(source.immunization)
        ? source.immunization.filter((item): item is string => typeof item === "string")
        : [],
    };
  };
  const sanitizeSelectedChargeItemMeta = (
    value: unknown
  ): Record<string, Record<string, { quantity: string; unit: string; frequency: string }>> => {
    if (!value || typeof value !== "object") {
      return {
        medication: {},
        injection: {},
        immunization: {},
      };
    }
    const source = value as Record<string, unknown>;
    const sanitizeBucket = (bucket: unknown) => {
      if (!bucket || typeof bucket !== "object") return {};
      return Object.fromEntries(
        Object.entries(bucket as Record<string, unknown>).map(([key, raw]) => {
          const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          return [
            key,
            {
              quantity: typeof entry.quantity === "string" ? entry.quantity : "",
              unit: typeof entry.unit === "string" ? entry.unit : "",
              frequency: typeof entry.frequency === "string" ? entry.frequency : "",
            },
          ];
        })
      );
    };
    return {
      medication: sanitizeBucket(source.medication),
      injection: sanitizeBucket(source.injection),
      immunization: sanitizeBucket(source.immunization),
    };
  };
  const upsertDraft = async (payload: Record<string, unknown>) => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const profileId = data.session?.user.id;
    if (!profileId) return;
    await supabase.from("provider_invoice_drafts").upsert(
      {
        provider_profile_id: profileId,
        draft_key: "default",
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_profile_id,draft_key" }
    );
  };

  const deleteDraft = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const profileId = data.session?.user.id;
    if (!profileId) return;
    await supabase.from("provider_invoice_drafts").delete().eq("provider_profile_id", profileId).eq("draft_key", "default");
  };

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchCatalogItems("medications")
      .then((rows) => {
        if (!alive) return;
        setMedicationOptions(rows.filter((r) => r.status === "Active").map((r) => r.name));
      })
      .catch(() => {
        if (!alive) return;
        setMedicationOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchDiagnosisOptions()
      .then((options) => {
        if (!alive) return;
        setDiagnosisOptions(options);
      })
      .catch(() => {
        if (!alive) return;
        setDiagnosisOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchCatalogItems("injections")
      .then((rows) => {
        if (!alive) return;
        setInjectionOptions(rows.filter((r) => r.status === "Active").map((r) => r.name));
      })
      .catch(() => {
        if (!alive) return;
        setInjectionOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchCatalogItems("immunizations")
      .then((rows) => {
        if (!alive) return;
        setImmunizationOptions(rows.filter((r) => r.status === "Active").map((r) => r.name));
      })
      .catch(() => {
        if (!alive) return;
        setImmunizationOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchCatalogItemRows("investigations")
      .then((rows) => {
        if (!alive) return;
        setInvestigationOptions(
          rows
            .filter((r) => r.status === "Active")
            .map((r) => {
              const raw = r.data;
              const shortName =
                raw && typeof raw === "object" ? (raw as { shortName?: unknown }).shortName : "";
              return (typeof shortName === "string" && shortName.trim() ? shortName : r.name) as string;
            })
        );
      })
      .catch(() => {
        if (!alive) return;
        setInvestigationOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchCatalogItems("frequencies")
      .then((rows) => {
        if (!alive) return;
        setFrequencyOptions(rows.filter((r) => r.status === "Active").map((r) => r.name));
      })
      .catch(() => {
        if (!alive) return;
        setFrequencyOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    let alive = true;
    fetchCatalogItems("units")
      .then((rows) => {
        if (!alive) return;
        setUnitOptions(rows.filter((r) => r.status === "Active").map((r) => r.name));
      })
      .catch(() => {
        if (!alive) return;
        setUnitOptions([]);
      });
    return () => {
      alive = false;
    };
  }, [isHydrated]);

  if (isHydrated) {
    ensureMemberSeed();
    ensureCompaniesStore();
    ensureProviderClaimsStore();
    ensureServiceTypeRulesSeed();
  }

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;
    const nextEditProviderClaimId = new URLSearchParams(window.location.search).get("editProviderClaimId") || "";
    setEditProviderClaimId(nextEditProviderClaimId);
  }, [isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    if (editProviderClaimId) {
      setDraftLoaded(true);
      return;
    }
    if (draftLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const profileId = sessionData.session?.user.id;
        if (!profileId) return;
        const { data, error } = await supabase
          .from("provider_invoice_drafts")
          .select("data")
          .eq("provider_profile_id", profileId)
          .eq("draft_key", "default")
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        const raw = (data?.data || {}) as Record<string, unknown>;
        if (!raw || typeof raw !== "object") return;
        setPatientId(typeof raw.patientId === "string" ? raw.patientId : "");
        setTreatmentDate(
          typeof raw.treatmentDate === "string" && raw.treatmentDate ? raw.treatmentDate : new Date().toISOString().slice(0, 10)
        );
        setInvoiceNumber(typeof raw.invoiceNumber === "string" && raw.invoiceNumber ? raw.invoiceNumber : generateClaimId());
        setDoctorUserId(typeof raw.doctorUserId === "string" ? raw.doctorUserId : "");
        setSelectedDiagnoses(Array.isArray(raw.diagnosisCodes) ? raw.diagnosisCodes : []);
        setMedicationDescription(typeof raw.medicationDescription === "string" ? raw.medicationDescription : "");
        setMedicationFee(typeof raw.medicationFee === "string" ? raw.medicationFee : "");
        setInjectionFee(typeof raw.injectionFee === "string" ? raw.injectionFee : "");
        setInvestigationFee(typeof raw.investigationFee === "string" ? raw.investigationFee : "");
        setProcedureFee(typeof raw.procedureFee === "string" ? raw.procedureFee : "");
        setImmunizationFee(typeof raw.immunizationFee === "string" ? raw.immunizationFee : "");
        setAdminDraftTotalAmount(typeof raw.adminDraftTotalAmount === "string" ? raw.adminDraftTotalAmount : "");
        setSelectedChargeItems(sanitizeSelectedChargeItems(raw.selectedChargeItems));
        setSelectedChargeItemMeta(sanitizeSelectedChargeItemMeta(raw.selectedChargeItemMeta));
        setServiceType(typeof raw.serviceType === "string" ? raw.serviceType : "Outpatient (OP)");
        setConsultationFee(typeof raw.consultationFee === "string" ? raw.consultationFee : "");
        setMcRequired(raw.mcRequired === "Y" ? "Y" : "N");
        setMcFrom(typeof raw.mcFrom === "string" ? raw.mcFrom : "");
        setMcTo(typeof raw.mcTo === "string" ? raw.mcTo : "");
        setRlRequired(raw.rlRequired === "Y" ? "Y" : "N");
        setMcFileName(typeof raw.mcFileName === "string" ? raw.mcFileName : "");
        setReferralFileName(typeof raw.referralFileName === "string" ? raw.referralFileName : "");
        setFinalBillFileName(typeof raw.finalBillFileName === "string" ? raw.finalBillFileName : "");
      } finally {
        if (!cancelled) setDraftLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftLoaded, editProviderClaimId, isHydrated]);

  const [resolvedProviderSession, setResolvedProviderSession] = useState<ProviderSession | null>(null);
  const [resolvedUserLabel, setResolvedUserLabel] = useState("");
  const [resolvedProviderUuid, setResolvedProviderUuid] = useState("");
  const [isProviderContextResolved, setIsProviderContextResolved] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;
    ensureProviderSeed();
    ensureMemberSeed();
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const profileId = data.session?.user.id;
      if (!profileId) {
        if (!cancelled) {
          setResolvedProviderSession(null);
          setResolvedUserLabel("");
          setIsProviderContextResolved(true);
        }
        return;
      }

      void refreshProviderDirectorySnapshot();
      void refreshVendorMembersSnapshot();
      void refreshProviderCredentialsSnapshot();

      const { data: providerUserRow, error } = await supabase
        .from("provider_users")
        .select("id, full_name, role, providers(id, vendor_id, provider_name)")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error || !providerUserRow) {
        if (!cancelled) {
          setResolvedProviderSession(null);
          setResolvedUserLabel("");
          setResolvedProviderUuid("");
          setIsProviderContextResolved(true);
        }
        return;
      }

      const row = providerUserRow as unknown as CurrentProviderUserRow;
      const vendorId = String(row.providers?.vendor_id || "");
      const providerName = String(row.providers?.provider_name || "");
      const providerUuid = String(row.providers?.id || "");
      const providerUserRole = normalizeProviderUserRole(row.role || "") || "provider_admin";
      const fullName = String(row.full_name || "");

      if (!cancelled) {
        setResolvedProviderSession({
          vendorId,
          providerUuid,
          providerName,
          providerUserId: String(row.id || ""),
          providerUserRole,
        });
        setResolvedUserLabel(fullName ? `${fullName} (${formatProviderRole(providerUserRole)})` : "");
        setResolvedProviderUuid(providerUuid);
        setIsProviderContextResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHydrated]);

  const providerSession = isHydrated ? (resolvedProviderSession || getProviderSession()) : null;
  const providerOrgId = providerSession?.vendorId || "";
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
  const companiesSnapshot = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const companies = isHydrated ? companiesSnapshot : [];
  const provider = useMemo(() => {
    if (!providerOrgId) return null;
    void providerDirectorySnapshot;
    void providerCredentialsSnapshot;
    void vendorMembersSnapshot;
    return getProviderById(providerOrgId);
  }, [providerOrgId, providerDirectorySnapshot, providerCredentialsSnapshot, vendorMembersSnapshot]);
  const today = new Date().toISOString().slice(0, 10);
  const currentUser =
    providerOrgId && providerSession?.providerUserId
      ? getProviderUserById(providerOrgId, providerSession.providerUserId)
      : null;
  const currentUserRole =
    providerSession?.providerUserRole || normalizeProviderUserRole(currentUser?.role) || "provider_admin";
  const canEditClinicalFields = currentUserRole === "doctor";
  const canSaveDraft = currentUserRole === "doctor" || currentUserRole === "provider_admin";
  void vendorMembersSnapshot;
  const providerDoctors = providerOrgId ? getVendorMembersByVendor(providerOrgId) : [];
  const preferredDoctorId = canEditClinicalFields
    ? currentUser?.providerUserUuid || currentUser?.memberId || providerSession?.providerUserId || doctorUserId
    : doctorUserId;
  const submissionGuard = getProviderSubmissionGuard({
    role: currentUserRole,
    clinicLicense: provider?.compliance?.clinicLicense,
    doctorApcs: provider?.compliance?.doctorApcs,
    doctors: providerDoctors,
    selectedDoctorId: preferredDoctorId,
    doctorIdentifiers: [providerSession?.providerUserId, currentUser?.providerUserUuid, currentUser?.memberId],
  });
  const verifiedDoctors = submissionGuard.doctorOptions.filter((doctor) => doctor.hasVerifiedDoctorApc);
  const hasVerifiedDoctors = verifiedDoctors.length > 0;
  const selectedDoctorUserId = canEditClinicalFields
    ? submissionGuard.selectedDoctor?.providerUserId || preferredDoctorId || ""
    : doctorUserId || verifiedDoctors[0]?.providerUserId || "";
  const selectedDoctorName =
    verifiedDoctors.find((doc) => doc.providerUserId === selectedDoctorUserId)?.fullName ||
    submissionGuard.selectedDoctor?.fullName ||
    (providerOrgId && selectedDoctorUserId ? getProviderUserById(providerOrgId, selectedDoctorUserId)?.fullName : "") ||
    "";
  const isProviderContextLoading =
    !isProviderContextResolved ||
    (!!providerOrgId && !provider && providerDirectorySnapshot.length === 0);
  const diagnosisCode = selectedDiagnoses.join(", ");
  const isTreatmentDateError =
    error === "Claims must be submitted within 7 days of treatment." ||
    error === "Please select treatment date before generating MC.";
  const isDocumentationError = error === "Please upload the final bill and reports.";
  const isGeneralSubmissionError = !!error && !isTreatmentDateError && !isDocumentationError;
  const clinicalTotalAmountNumber =
    Number(consultationFee || 0) +
    Number(medicationFee || 0) +
    Number(injectionFee || 0) +
    Number(investigationFee || 0) +
    Number(procedureFee || 0) +
    Number(immunizationFee || 0);
  const draftTotalAmountNumber = canEditClinicalFields
    ? clinicalTotalAmountNumber
    : Number(adminDraftTotalAmount || 0);
  const totalAmountNumber = draftTotalAmountNumber;
  const totalAmount = totalAmountNumber > 0 ? totalAmountNumber.toFixed(2) : "";
  const matchedMember =
    memberDirectory.find((member) => member.staffId.toLowerCase() === patientId.trim().toLowerCase()) ||
    memberDirectory.find((member) => member.nricPassport?.toLowerCase() === patientId.trim().toLowerCase()) ||
    null;
  const matchedMemberCompanyUuid =
    matchedMember?.companyUuid ||
    (matchedMember?.parentStaffId
      ? memberDirectory.find(
          (entry) => entry.companyId === matchedMember.companyId && entry.staffId === matchedMember.parentStaffId
        )?.companyUuid
      : undefined);
  const mappedCompany = matchedMember
    ? companies.find((company) => company.companyId === matchedMember.companyId) || null
    : null;
  const memberKey =
    (matchedMember ? getMemberLimitOwnerStaffId(matchedMember, mappedCompany) : "") || patientId.trim();
  const lockEntries = isHydrated ? (getLimitLocks() as ClaimLimitLock[]) : [];
  const utilizationEntries = isHydrated ? (getUtilizations() as ClaimUtilization[]) : [];
  const memberLockedAmount = lockEntries
    .filter((entry) => entry.memberKey === memberKey)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const memberUtilizedAmount = utilizationEntries
    .filter((entry) => entry.memberKey === memberKey)
    .reduce((sum, entry) => sum + entry.amount, 0);
  const claimCategory: ClaimLimitLock["category"] =
    serviceType === "Dental"
      ? "dental"
    : serviceType === "Traditional Chinese Medicine (TCM)"
      ? "tmc"
        : serviceType === "Specialist Referral (SF)"
          ? "sp"
      : serviceType === "Annual Health Screening (AHS)"
        ? "ahs"
        : "op";
  const normalizedClaimCategory: CompanyPlanCategoryKey = claimCategory;
  const resolvedMemberPlan = matchedMember ? resolveMemberPlan(matchedMember, mappedCompany) : null;
  const memberBenefitLimit = resolvedMemberPlan
    ? resolvedMemberPlan.type === "lump_sum"
      ? resolvedMemberPlan.lumpSumLimit
      : getCategoryLimit(resolvedMemberPlan, normalizedClaimCategory)
    : 0;
  const memberReservedAmount = resolvedMemberPlan?.type === "lump_sum"
    ? memberLockedAmount
    : lockEntries
        .filter((entry) => entry.memberKey === memberKey && entry.category === normalizedClaimCategory)
        .reduce((sum, entry) => sum + entry.amount, 0);
  const memberUsedAmount = resolvedMemberPlan?.type === "lump_sum"
    ? memberUtilizedAmount
    : utilizationEntries
        .filter((entry) => entry.memberKey === memberKey && entry.category === normalizedClaimCategory)
        .reduce((sum, entry) => sum + entry.amount, 0);
  const memberAvailableLimit = Math.max(memberBenefitLimit - memberReservedAmount - memberUsedAmount, 0);
  const mcDays = useMemo(() => {
    if (mcRequired !== "Y") return 0;
    if (!mcFrom || !mcTo) return 0;
    const diffMs = new Date(mcTo).getTime() - new Date(mcFrom).getTime();
    if (Number.isNaN(diffMs) || diffMs < 0) return 0;
    return Math.max(1, Math.ceil(diffMs / 86400000) + 1);
  }, [mcRequired, mcFrom, mcTo]);
  const editingProviderClaim = useMemo(() => {
    void providerClaimsSnapshot;
    if (!editProviderClaimId) return null;
    return getProviderClaimById(editProviderClaimId);
  }, [editProviderClaimId, providerClaimsSnapshot]);
  const editingProviderClaimDocuments = useMemo(
    () => {
      void providerClaimsSnapshot;
      return editingProviderClaim ? getProviderClaimDocuments(editingProviderClaim.id) : [];
    },
    [editingProviderClaim, providerClaimsSnapshot]
  );
  const editingPatientId = useMemo(() => {
    if (!editingProviderClaim) return "";
    if (editingProviderClaim.patientStaffId) return editingProviderClaim.patientStaffId;
    if (editingProviderClaim.dependentId) {
      const dependentEntry = memberDirectory.find(
        (entry) =>
          entry.memberType === "dependent" &&
          parseDependentIdFromDirectoryStaffId(entry.staffId) === editingProviderClaim.dependentId
      );
      if (dependentEntry?.staffId) return dependentEntry.staffId;
    }
    if (editingProviderClaim.memberRecordId) {
      const primaryEntry = memberDirectory.find((entry) => entry.memberUuid === editingProviderClaim.memberRecordId);
      if (primaryEntry?.staffId) return primaryEntry.staffId;
    }
    return "";
  }, [editingProviderClaim, memberDirectory]);
  const canEditRequestedClaim = useMemo(() => {
    if (!editingProviderClaim) return false;
    if (!resolvedProviderUuid) return false;
    return (
      editingProviderClaim.providerId === resolvedProviderUuid &&
      String(editingProviderClaim.status || "").trim().toLowerCase() === "request_additional_information"
    );
  }, [editingProviderClaim, resolvedProviderUuid]);
  const hasExistingFinalBill = useMemo(
    () => editingProviderClaimDocuments.some((doc) => doc.docType === "final_bill"),
    [editingProviderClaimDocuments]
  );
  const isBlockedEditMode = Boolean(editProviderClaimId) && !canEditRequestedClaim;

  useEffect(() => {
    if (!canEditRequestedClaim || !editingProviderClaim) return;

    const breakdown = editingProviderClaim.chargeBreakdown || {};
    const selectedItems =
      typeof editingProviderClaim.selectedChargeItems === "object" && editingProviderClaim.selectedChargeItems
        ? (editingProviderClaim.selectedChargeItems as Record<string, string[]>)
        : {
            medication: [],
            injection: [],
            investigation: [],
            procedure: [],
            immunization: [],
          };
    const selectedItemMeta =
      typeof breakdown.selectedChargeItemMeta === "object" && breakdown.selectedChargeItemMeta
        ? (breakdown.selectedChargeItemMeta as Record<string, Record<string, { quantity: string; unit: string; frequency: string }>>)
        : {
            medication: {},
            injection: {},
            immunization: {},
          };
    const finalBillDoc = editingProviderClaimDocuments.find((doc) => doc.docType === "final_bill");
    const mcDoc = editingProviderClaimDocuments.find((doc) => doc.docType === "mc");
    const referralDoc = editingProviderClaimDocuments.find((doc) => doc.docType === "referral_letter");

    setPatientId(editingPatientId);
    setTreatmentDate(editingProviderClaim.treatmentDate || "");
    setInvoiceNumber(editingProviderClaim.invoiceNumber || editingProviderClaim.claimNumber || "");
    setDoctorUserId(editingProviderClaim.providerUserId || "");
    setSelectedDiagnoses(editingProviderClaim.diagnosisCodes || []);
    setDiagnosisToAdd("");
    setMedicationDescription(editingProviderClaim.medicationDescription || "");
    setServiceType(editingProviderClaim.serviceType || "Outpatient (OP)");
    setConsultationFee(String(breakdown.consultationFee ?? ""));
    setMedicationFee(String(breakdown.medicationFee ?? ""));
    setInjectionFee(String(breakdown.injectionFee ?? ""));
    setInvestigationFee(String(breakdown.investigationFee ?? ""));
    setProcedureFee(String(breakdown.procedureFee ?? ""));
    setImmunizationFee(String(breakdown.immunizationFee ?? ""));
    setAdminDraftTotalAmount(String(editingProviderClaim.totalAmount || ""));
    setMcRequired(breakdown.mcRequired === "Y" ? "Y" : "N");
    setMcFrom(String(breakdown.mcFrom ?? ""));
    setMcTo(String(breakdown.mcTo ?? ""));
    setRlRequired(breakdown.rlRequired === "Y" ? "Y" : "N");
    setMcFile(null);
    setMcFileName(mcDoc?.fileName || "");
    setReferralFile(null);
    setReferralFileName(referralDoc?.fileName || "");
    setFinalBillFile(null);
    setFinalBillFileName(finalBillDoc?.fileName || "");
    setSelectedChargeItems(selectedItems);
    setSelectedChargeItemMeta(selectedItemMeta);
    setChargePickerDraft({
      medication: "",
      injection: "",
      investigation: "",
      procedure: "",
      immunization: "",
    });
    setChargeCustomDraft({
      medication: "",
      injection: "",
      investigation: "",
      procedure: "",
      immunization: "",
    });
    setError("");
  }, [canEditRequestedClaim, editingPatientId, editingProviderClaim, editingProviderClaimDocuments]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setTreatmentDate(date);
    
    if (date) {
      const today = new Date();
      const treatment = new Date(date);
      const diffTime = Math.abs(today.getTime() - treatment.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 7) {
        setError("Claims must be submitted within 7 days of treatment.");
      } else {
        setError("");
      }
    }
  };

  const handleSubmit = () => {
    if (error) return;
    if (isBlockedEditMode) {
      setError("This submission cannot be edited. Only claims marked Request Additional Information can be updated.");
      return;
    }
    if (!submissionGuard.canSubmit) {
      setError(submissionGuard.blockingReason || "Submission is blocked by provider compliance requirements.");
      return;
    }

    if (!patientId || !treatmentDate || !invoiceNumber || !totalAmount || !selectedDoctorUserId || selectedDiagnoses.length === 0) {
      setError("Please fill in all required fields.");
      return;
    }

    if (totalAmountNumber <= 0) {
      setError("Please key in at least one charge amount.");
      return;
    }

    if (!finalBillFile && !(canEditRequestedClaim && hasExistingFinalBill)) {
      setError("Please upload the final bill and reports.");
      return;
    }

    if (resolvedMemberPlan?.type === "category" && memberBenefitLimit <= 0) {
      setError("This member does not have coverage for the selected service category.");
      return;
    }

    if (memberBenefitLimit > 0 && totalAmountNumber > memberAvailableLimit) {
      setError("Insufficient member balance after considering locked and utilized limits.");
      return;
    }

    const submittedInvoiceId = invoiceNumber;

    // Ensure the member limit is reserved on submit (reserve now if user didn't save a draft).
    if (memberKey && totalAmountNumber > 0) {
      reserveLimit({
        claimId: submittedInvoiceId,
        memberKey,
        amount: Number(totalAmount),
        category: normalizedClaimCategory,
      });
    }

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const providerProfileId = sessionData.session?.user.id || "";
        if (!providerProfileId) {
          throw new Error("Provider session not found.");
        }
        if (!resolvedProviderUuid) {
          throw new Error("Provider record not found.");
        }

        const nowIso = new Date().toISOString();
        const uploads: ProviderClaimUploadItem[] = [];

        if (finalBillFile) {
          uploads.push({
            docType: "final_bill" as const,
            ...(await uploadProviderClaimFile(resolvedProviderUuid, submittedInvoiceId, "final_bill", finalBillFile)),
          });
        }

        if (mcFile) {
          uploads.push({
            docType: "mc" as const,
            ...(await uploadProviderClaimFile(resolvedProviderUuid, submittedInvoiceId, "mc", mcFile)),
          });
        }

        if (referralFile) {
          uploads.push({
            docType: "referral_letter" as const,
            ...(await uploadProviderClaimFile(resolvedProviderUuid, submittedInvoiceId, "referral_letter", referralFile)),
          });
        }

        const providerClaimPayload = {
          provider_id: resolvedProviderUuid,
          provider_user_id: providerSession?.providerUserId || null,
          submitted_by_profile_id: providerProfileId,
          claim_number: submittedInvoiceId,
          invoice_number: submittedInvoiceId,
          treatment_date: treatmentDate,
          total_amount: Number(totalAmount),
          status: "submitted",
          company_id: matchedMemberCompanyUuid || null,
          member_id: matchedMember?.memberType === "primary" ? matchedMember.memberUuid || null : null,
          member_record_id: matchedMember?.memberType === "primary" ? matchedMember.memberUuid || null : null,
          dependent_id:
            matchedMember?.memberType === "dependent"
              ? parseDependentIdFromDirectoryStaffId(matchedMember.staffId)
              : null,
          diagnosis_code: diagnosisCode || null,
          diagnosis_codes: selectedDiagnoses,
          diagnosis_summary: diagnosisCode || null,
          medication_description: medicationDescription || null,
          charge_breakdown: {
            consultationFee,
            medicationFee,
            injectionFee,
            investigationFee,
            procedureFee,
            immunizationFee,
            selectedChargeItems,
            selectedChargeItemMeta,
            mcRequired,
            mcFrom,
            mcTo,
            mcDays,
            rlRequired,
          },
          selected_charge_items: selectedChargeItems,
          service_type: serviceType || null,
          submitted_at: nowIso,
        };

        let providerClaimId = "";

        if (canEditRequestedClaim && editingProviderClaim) {
          providerClaimId = editingProviderClaim.id;
          await updateProviderClaim(providerClaimId, {
            ...providerClaimPayload,
            status: "submitted",
            submitted_at: nowIso,
            updated_at: nowIso,
            review_note: null,
            approval_attachment_path: null,
            approval_attachment_name: null,
            approved_at: null,
          });

          for (const item of uploads) {
            await upsertProviderClaimDocument(providerClaimId, item.docType, {
              storage_path: item.storagePath,
              file_name: item.fileName,
              mime_type: item.mimeType,
              uploaded_by_profile_id: providerProfileId,
            });
          }
        } else {
          providerClaimId = await insertProviderClaim(providerClaimPayload);

          await insertProviderClaimDocuments(
            uploads.map((item) => ({
              provider_claim_id: providerClaimId,
              doc_type: item.docType,
              storage_path: item.storagePath,
              file_name: item.fileName,
              mime_type: item.mimeType,
              uploaded_by_profile_id: providerProfileId,
            }))
          );
        }

        await upsertPanelVisitTransaction({
          claimId: submittedInvoiceId,
          providerId: resolvedProviderUuid,
          memberKey,
          patientId: patientId.trim(),
          patientName: matchedMember?.fullName || patientId.trim(),
          visitDateTime: treatmentDate,
          serviceType,
          amount: Number(totalAmount),
          createdAt: nowIso,
          dedupeKey: submittedInvoiceId,
        });

        void deleteDraft();
        setLastSubmitWasResubmit(canEditRequestedClaim && Boolean(editingProviderClaim));
        if (typeof window !== "undefined" && editProviderClaimId) {
          window.history.replaceState({}, "", "/provider/invoices");
        }
        setEditProviderClaimId("");
        setLastSubmittedClaimId(submittedInvoiceId);
        setIsSuccessModalOpen(true);
        setPatientId("");
        setTreatmentDate("");
        setInvoiceNumber(generateClaimId());
        setDoctorUserId("");
        setSelectedDiagnoses([]);
        setDiagnosisToAdd("");
        setMedicationDescription("");
        setConsultationFee("");
        setMedicationFee("");
        setInjectionFee("");
        setInvestigationFee("");
        setProcedureFee("");
        setImmunizationFee("");
        setServiceType("Outpatient (OP)");
        setMcRequired("N");
        setMcFrom("");
        setMcTo("");
        setRlRequired("N");
        setMcFile(null);
        setMcFileName("");
        setReferralFile(null);
        setReferralFileName("");
        setFinalBillFile(null);
        setFinalBillFileName("");
        setSelectedChargeItems({
          medication: [],
          injection: [],
          investigation: [],
          procedure: [],
          immunization: [],
        });
        setChargePickerDraft({
          medication: "",
          injection: "",
          investigation: "",
          procedure: "",
          immunization: "",
        });
        setChargeCustomDraft({
          medication: "",
          injection: "",
          investigation: "",
          procedure: "",
          immunization: "",
        });
        setSelectedChargeItemMeta({
          medication: {},
          injection: {},
          immunization: {},
        });
        setError("");
      } catch (err) {
        const nextMessage =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: unknown }).message || "")
            : "";
        setError(nextMessage || "Failed to submit invoice. Please try again.");
      }
    })();
  };

  const handleSaveDraft = () => {
    if (!canSaveDraft) {
      setError("Only provider admin or doctor can save draft.");
      return;
    }
    if (!patientId || !treatmentDate || !totalAmount) {
      setError("Please fill patient, date, and charges before saving draft.");
      return;
    }
    if (!selectedDoctorUserId) {
      setError("Please select attending doctor before saving draft.");
      return;
    }
    if (!memberKey) {
      setError("Member identifier is required to lock limit.");
      return;
    }
    if (resolvedMemberPlan?.type === "category" && memberBenefitLimit <= 0) {
      setError("Draft cannot be saved because the selected service category is not covered for this member.");
      return;
    }
    if (memberBenefitLimit > 0 && totalAmountNumber > memberAvailableLimit) {
      setError("Draft cannot be saved because member available limit is insufficient.");
      return;
    }
    void upsertDraft({
      patientId,
      treatmentDate,
      invoiceNumber,
      totalAmount,
      doctorUserId: selectedDoctorUserId,
      doctorName: selectedDoctorName,
      diagnosisCode,
      diagnosisCodes: selectedDiagnoses,
      medicationDescription,
      medicationFee,
      injectionFee,
      investigationFee,
      procedureFee,
      immunizationFee,
      adminDraftTotalAmount,
      selectedChargeItems,
      selectedChargeItemMeta,
      serviceType,
      consultationFee,
      mcRequired,
      mcFrom,
      mcTo,
      mcDays,
      rlRequired,
      mcFileName,
      referralFileName,
      finalBillFileName,
    });
    reserveLimit({
      claimId: invoiceNumber,
      memberKey,
      amount: Number(totalAmount),
      category: normalizedClaimCategory,
    });
    setError("");
    alert("Draft saved and member limit locked.");
  };

  const handleCancelDraft = () => {
    void deleteDraft();
    releaseReservation(invoiceNumber);
    setPatientId("");
    setTreatmentDate("");
    setInvoiceNumber(generateClaimId());
    setDoctorUserId("");
    setSelectedDiagnoses([]);
    setDiagnosisToAdd("");
    setMedicationDescription("");
    setMedicationFee("");
    setInjectionFee("");
    setInvestigationFee("");
    setProcedureFee("");
    setImmunizationFee("");
    setAdminDraftTotalAmount("");
    setServiceType("Outpatient (OP)");
    setConsultationFee("");
    setMcRequired("N");
    setMcFrom("");
    setMcTo("");
    setRlRequired("N");
    setMcFile(null);
    setMcFileName("");
    setReferralFile(null);
    setReferralFileName("");
    setFinalBillFile(null);
    setFinalBillFileName("");
    setSelectedChargeItems({
      medication: [],
      injection: [],
      investigation: [],
      procedure: [],
      immunization: [],
    });
    setChargePickerDraft({
      medication: "",
      injection: "",
      investigation: "",
      procedure: "",
      immunization: "",
    });
    setChargeCustomDraft({
      medication: "",
      injection: "",
      investigation: "",
      procedure: "",
      immunization: "",
    });
    setSelectedChargeItemMeta({
      medication: {},
      injection: {},
      immunization: {},
    });
    setError("");
    alert("Draft canceled and member lock released.");
  };

  const addDiagnosis = () => {
    const next = diagnosisToAdd.trim();
    if (!next) return;
    if (selectedDiagnoses.includes(next)) {
      setDiagnosisToAdd("");
      return;
    }
    setSelectedDiagnoses((prev) => [...prev, next]);
    setDiagnosisToAdd("");
  };

  const removeDiagnosis = (diagnosis: string) => {
    setSelectedDiagnoses((prev) => prev.filter((item) => item !== diagnosis));
  };

  const addChargeItem = (sectionKey: string) => {
    if (!isSectionAllowed(serviceType, sectionKey as CatalogSection)) return;
    const selected = (chargePickerDraft[sectionKey] || "").trim();
    const custom = (chargeCustomDraft[sectionKey] || "").trim();
    const next = selected || custom;
    if (!next) return;
    setSelectedChargeItems((prev) => {
      const existing = prev[sectionKey] || [];
      if (existing.includes(next)) return prev;
      return { ...prev, [sectionKey]: [...existing, next] };
    });
    if (sectionKey === "medication" || sectionKey === "injection" || sectionKey === "immunization") {
      setSelectedChargeItemMeta((prev) => ({
        ...prev,
        [sectionKey]: { ...(prev[sectionKey] || {}), [next]: prev[sectionKey]?.[next] || { quantity: "", unit: "", frequency: "" } },
      }));
    }
    setChargePickerDraft((prev) => ({ ...prev, [sectionKey]: "" }));
    setChargeCustomDraft((prev) => ({ ...prev, [sectionKey]: "" }));
  };

  const removeChargeItem = (sectionKey: string, item: string) => {
    setSelectedChargeItems((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((entry) => entry !== item),
    }));
    if (sectionKey === "medication" || sectionKey === "injection" || sectionKey === "immunization") {
      setSelectedChargeItemMeta((prev) => {
        const next = { ...(prev[sectionKey] || {}) };
        delete next[item];
        return { ...prev, [sectionKey]: next };
      });
    }
  };

  const providerAddress = [
    provider?.addressLine1,
    provider?.addressLine2,
    provider?.city,
    provider?.state,
    provider?.postalCode,
  ]
    .filter(Boolean)
    .join(", ") || provider?.address || "";

  const handleGenerateMcPdf = () => {
    if (mcRequired !== "Y") {
      setError("MC is set to No. Select Yes to generate MC.");
      return;
    }
    if (!mcFrom || !mcTo) {
      setError("Please fill MC From and MC To before generating MC.");
      return;
    }
    if (new Date(mcTo).getTime() < new Date(mcFrom).getTime()) {
      setError("MC To date cannot be earlier than MC From date.");
      return;
    }
    if (!treatmentDate) {
      setError("Please select treatment date before generating MC.");
      return;
    }
    const generatedMcFile = generateMedicalCertificatePdf({
      clinicName: provider?.providerName || "Clinic",
      clinicAddress: providerAddress,
      clinicPhone: provider?.contactPhone || "",
      clinicEmail: provider?.contactEmail || "",
      visitDate: treatmentDate,
      serialNumber: invoiceNumber,
      memberName: matchedMember?.fullName || "N/A",
      memberIdNo: matchedMember?.nricPassport || patientId || "N/A",
      diagnosis: diagnosisCode || "N/A",
      mcFrom,
      mcTo,
      issueDate: today,
      filename: `mc-${invoiceNumber}.pdf`,
    });
    setMcFile(generatedMcFile);
    setMcFileName(generatedMcFile.name);
    setError("");
  };

  const handleGenerateReferralPdf = () => {
    if (rlRequired !== "Y") {
      setError("Referral Letter is set to No. Select Yes to generate a referral letter.");
      return;
    }
    setReferralDraft({
      date: treatmentDate || today,
      specialistName: "",
      hospital: "",
      memberName: matchedMember?.fullName || "",
      memberIdNo: matchedMember?.nricPassport || patientId || "",
      details:
        medicationDescription ||
        "Please assess and continue specialist management for this patient.",
    });
    setIsReferralModalOpen(true);
    setError("");
  };

  const handleConfirmGenerateReferralPdf = () => {
    if (rlRequired !== "Y") {
      setError("Referral Letter is set to No. Select Yes to generate a referral letter.");
      return;
    }
    const nextErrors: Record<string, string> = {};
    if (!referralDraft.date) nextErrors.date = "Date is required.";
    if (!referralDraft.specialistName.trim()) nextErrors.specialistName = "Specialist Name is required.";
    if (!referralDraft.hospital.trim()) nextErrors.hospital = "Hospital is required.";
    if (!referralDraft.details.trim()) nextErrors.details = "Referral letter content is required.";
    if (Object.keys(nextErrors).length > 0) {
      setReferralDraftErrors(nextErrors);
      setError("Please complete required referral fields.");
      return;
    }
    const generatedReferralFile = generateReferralLetterPdf({
      clinicName: provider?.providerName || "Clinic",
      clinicAddress: providerAddress,
      clinicPhone: provider?.contactPhone || "",
      clinicEmail: provider?.contactEmail || "",
      date: referralDraft.date,
      specialistName: referralDraft.specialistName,
      hospital: referralDraft.hospital,
      memberName: referralDraft.memberName || "N/A",
      memberIdNo: referralDraft.memberIdNo || "N/A",
      details: referralDraft.details,
      filename: `referral-${invoiceNumber}.pdf`,
    });
    setReferralFile(generatedReferralFile);
    setReferralFileName(generatedReferralFile.name);
    setIsReferralModalOpen(false);
    setReferralDraftErrors({});
    setError("");
  };

  const chargeSections: Array<{
    key: string;
    label: string;
    amount: string;
    setAmount: (value: string) => void;
    pickerLabel: string;
    options: string[];
  }> = [
    {
      key: "medication",
      label: "Medication (RM)",
      amount: medicationFee,
      setAmount: setMedicationFee,
      pickerLabel: "Drug",
      options: medicationOptions,
    },
    {
      key: "injection",
      label: "Injection (RM)",
      amount: injectionFee,
      setAmount: setInjectionFee,
      pickerLabel: "Injection",
      options: injectionOptions,
    },
    {
      key: "investigation",
      label: "Investigation (RM)",
      amount: investigationFee,
      setAmount: setInvestigationFee,
      pickerLabel: "Investigation",
      options: investigationOptions,
    },
    {
      key: "procedure",
      label: "Procedure (RM)",
      amount: procedureFee,
      setAmount: setProcedureFee,
      pickerLabel: "Procedure",
      options: ["Wound Dressing", "Nebulization", "ECG", "Minor Surgery"],
    },
    {
      key: "immunization",
      label: "Immunization (RM)",
      amount: immunizationFee,
      setAmount: setImmunizationFee,
      pickerLabel: "Immunization",
      options: immunizationOptions,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/provider/dashboard">
          <GlassButton variant="ghost" className="rounded-full h-10 w-10 p-0">
            <ArrowLeft className="w-5 h-5" />
          </GlassButton>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Submit Invoice</h1>
          <p className="text-slate-500 text-sm">Submit provider claim documents for TPA settlement.</p>
        </div>
      </div>

      <div className="space-y-6">
          {editProviderClaimId && (
            <GlassCard className="border-amber-100 bg-amber-50/70 p-4">
              <p className="text-sm font-semibold text-amber-900">
                {canEditRequestedClaim
                  ? `You are updating submission ${
                      editingProviderClaim?.claimNumber || editingProviderClaim?.invoiceNumber || editingProviderClaim?.id
                    }.`
                  : "This submission cannot be edited. Only claims marked Request Additional Information can be updated."}
              </p>
              {canEditRequestedClaim && editingProviderClaim?.reviewNote ? (
                <p className="mt-2 text-sm text-amber-800">Info needed: {editingProviderClaim.reviewNote}</p>
              ) : null}
            </GlassCard>
          )}
          <GlassCard className="space-y-6 p-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                Patient Selection
              </h3>
              <GlassField label="Member ID / NRIC / Passport No." hint="Scan QR or type member identifier">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                  <GlassInput className="pl-10" value={patientId} onChange={(e) => setPatientId(e.target.value)} />
                </div>
              </GlassField>
              <div className="flex justify-end">
                <GlassButton variant="secondary" className="gap-2" onClick={() => { setScanError(""); setIsScanOpen(true); }}>
                  <QrCode className="w-4 h-4" />
                  Scan QR
                </GlassButton>
              </div>
              {patientId.length > 3 && (
                <div className={cn(
                  "p-3 border rounded-xl flex items-center justify-between animate-in fade-in zoom-in-95 duration-200",
                  matchedMember ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold",
                      matchedMember ? "bg-emerald-500" : "bg-amber-500"
                    )}>
                      {(matchedMember?.fullName || "NA").split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{matchedMember?.fullName || "Member Not Found"}</p>
                      <p className="text-[10px] text-slate-500">
                        {matchedMember ? `${matchedMember.staffId} • ${mappedCompany?.name || matchedMember.companyId}` : "Use Member ID or NRIC from directory"}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold",
                    matchedMember ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  )}>
                    {matchedMember ? "Verified" : "Unverified"}
                  </span>
                </div>
              )}
            </div>

            <div className="h-px bg-slate-200/50" />

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Billing Details
              </h3>
              
              <GlassField label="Treatment Date" error={isTreatmentDateError ? error : undefined}>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                  <GlassInput
                    type="date"
                    className={`pl-10 ${isTreatmentDateError ? 'focus:ring-rose-500/50 border-rose-500' : ''}`}
                    value={treatmentDate}
                    onChange={handleDateChange}
                  />
                </div>
              </GlassField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassField label="Claim ID">
                  <GlassInput
                    value={invoiceNumber}
                    readOnly
                    className="bg-slate-100/70"
                  />
                </GlassField>
                <GlassField label="Total Amount (RM)">
                  <div className="relative">
                    <span className="currency-prefix text-xs text-slate-900">RM</span>
                    <GlassInput
                      type="number"
                      placeholder="0.00"
                      className="currency-input pl-10 pr-4 py-1.5 font-bold bg-slate-100/70"
                      step="0.01"
                      value={totalAmount}
                      readOnly
                    />
                  </div>
                </GlassField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassField label="Logged-in User">
                  <GlassInput
                    className="px-3 py-2 text-sm bg-slate-50"
                    value={
                      !isProviderContextResolved
                        ? "Loading user..."
                        : currentUser?.fullName
                          ? `${currentUser.fullName} (${formatProviderRole(currentUserRole)})`
                          : resolvedUserLabel || "Unknown user"
                    }
                    readOnly
                  />
                </GlassField>
                <GlassField label="Attending Doctor" error={!isProviderContextLoading && !hasVerifiedDoctors ? "No verified doctor found. Upload APC for doctors and get it approved to enable submission." : undefined}>
                  <select
                    className="w-full glass-select px-3 py-2 text-sm"
                    value={selectedDoctorUserId}
                    onChange={(e) => setDoctorUserId(e.target.value)}
                    disabled={canEditClinicalFields || !hasVerifiedDoctors || isProviderContextLoading}
                  >
                    {isProviderContextLoading ? (
                      <option value="">Loading doctors...</option>
                    ) : !hasVerifiedDoctors ? (
                      <option value="">No verified doctor</option>
                    ) : (
                      verifiedDoctors.map((doctor) => (
                        <option key={doctor.providerUserId} value={doctor.providerUserId}>
                          {doctor.fullName}
                        </option>
                      ))
                    )}
                  </select>
                </GlassField>
              </div>

              <GlassField label="Service Type (required)">
                <select
                  className="w-full glass-select px-4 py-2"
                  value={serviceType}
                  onChange={(e) => {
                    const nextServiceType = e.target.value;
                    setServiceType(nextServiceType);
                    if (!isSectionAllowed(nextServiceType, "consultation")) {
                      setConsultationFee("");
                    }
                    if (!isSectionAllowed(nextServiceType, "medication")) {
                      setMedicationFee("");
                      setSelectedChargeItems((prev) => ({ ...prev, medication: [] }));
                      setChargePickerDraft((prev) => ({ ...prev, medication: "" }));
                      setChargeCustomDraft((prev) => ({ ...prev, medication: "" }));
                      setSelectedChargeItemMeta((prev) => ({ ...prev, medication: {} }));
                    }
                    if (!isSectionAllowed(nextServiceType, "injection")) {
                      setInjectionFee("");
                      setSelectedChargeItems((prev) => ({ ...prev, injection: [] }));
                      setChargePickerDraft((prev) => ({ ...prev, injection: "" }));
                      setChargeCustomDraft((prev) => ({ ...prev, injection: "" }));
                      setSelectedChargeItemMeta((prev) => ({ ...prev, injection: {} }));
                    }
                    if (!isSectionAllowed(nextServiceType, "investigation")) {
                      setInvestigationFee("");
                      setSelectedChargeItems((prev) => ({ ...prev, investigation: [] }));
                      setChargePickerDraft((prev) => ({ ...prev, investigation: "" }));
                      setChargeCustomDraft((prev) => ({ ...prev, investigation: "" }));
                    }
                    if (!isSectionAllowed(nextServiceType, "procedure")) {
                      setProcedureFee("");
                      setSelectedChargeItems((prev) => ({ ...prev, procedure: [] }));
                      setChargePickerDraft((prev) => ({ ...prev, procedure: "" }));
                      setChargeCustomDraft((prev) => ({ ...prev, procedure: "" }));
                    }
                    if (!isSectionAllowed(nextServiceType, "immunization")) {
                      setImmunizationFee("");
                      setSelectedChargeItems((prev) => ({ ...prev, immunization: [] }));
                      setChargePickerDraft((prev) => ({ ...prev, immunization: "" }));
                      setChargeCustomDraft((prev) => ({ ...prev, immunization: "" }));
                      setSelectedChargeItemMeta((prev) => ({ ...prev, immunization: {} }));
                    }
                    setError("");
                  }}
                >
                  <option>Annual Health Screening (AHS)</option>
                  <option>Outpatient (OP)</option>
                  <option>Specialist Referral (SF)</option>
                  <option>Dental</option>
                  <option>Traditional Chinese Medicine (TCM)</option>
                  <option>Rehabilitation</option>
                  <option>Optical</option>
                  <option>Others</option>
                </select>
              </GlassField>

              <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white/70">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clinical Details</h4>
                <GlassField label="Diagnosis" className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="w-full glass-input px-4 py-2"
                      placeholder="Type or select diagnosis..."
                      value={diagnosisToAdd}
                      onChange={(e) => setDiagnosisToAdd(e.target.value)}
                      disabled={!canEditClinicalFields}
                      list="diagnosis-datalist"
                    />
                    <datalist id="diagnosis-datalist">
                      {diagnosisOptions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                    <GlassButton
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                      onClick={addDiagnosis}
                      disabled={!canEditClinicalFields}
                    >
                      Add
                    </GlassButton>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedDiagnoses.length === 0 ? (
                      <span className="text-[10px] text-slate-400">No diagnosis selected yet.</span>
                    ) : (
                      selectedDiagnoses.map((item) => (
                        <button
                          key={item}
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2.5 py-1",
                            canEditClinicalFields
                              ? "bg-sky-100 text-sky-700 hover:bg-sky-200"
                              : "bg-slate-100 text-slate-600 cursor-default"
                          )}
                          onClick={canEditClinicalFields ? () => removeDiagnosis(item) : undefined}
                          title={canEditClinicalFields ? "Remove diagnosis" : "Doctor-only field"}
                        >
                          {item}
                          <span className="text-xs">x</span>
                        </button>
                      ))
                    )}
                  </div>
                </GlassField>
                <GlassField label="Medication Description">
                  <textarea
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-sm min-h-40 resize-y",
                      canEditClinicalFields
                        ? "border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
                        : "border-slate-200 bg-slate-50 text-slate-600 cursor-not-allowed"
                    )}
                    placeholder="Describe medication, dosage, route, and duration"
                    value={medicationDescription}
                    onChange={canEditClinicalFields ? (e) => setMedicationDescription(e.target.value) : undefined}
                    readOnly={!canEditClinicalFields}
                  />
                </GlassField>
              </div>
              {!canEditClinicalFields && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Provider admin can save draft only. Login as doctor to key clinical details and submit.
                </div>
              )}

              {!canEditClinicalFields && (
                <GlassField label="Draft Total Amount (RM)" hint="This amount will be used for limit reservation. Final amount will be locked in by the doctor submission.">
                  <GlassInput
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    value={adminDraftTotalAmount}
                    onChange={(e) => {
                      setAdminDraftTotalAmount(e.target.value);
                      setError("");
                    }}
                  />
                </GlassField>
              )}

              <div className="space-y-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700">Charges Breakdown</h4>
                    <span className="text-[11px] text-slate-500">
                      {canEditClinicalFields ? "Itemized by treatment category" : "Doctor-only editing. Admin can view only."}
                    </span>
                  </div>
                  {isSectionAllowed(serviceType, "consultation") && (
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-center">
                        <label className="text-sm font-semibold text-slate-800">Consultation Fee (RM)</label>
                        <div className="relative">
                          <span className="currency-prefix text-[10px] text-slate-900">RM</span>
                          <input
                            type="number"
                            className={cn(
                              "w-full currency-input pl-10 py-1.5 text-sm rounded-xl border",
                              canEditClinicalFields
                                ? "bg-white border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
                                : "bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed"
                            )}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            value={consultationFee}
                            onChange={canEditClinicalFields
                              ? (e) => {
                                  setConsultationFee(e.target.value);
                                  setError("");
                                }
                              : undefined}
                            readOnly={!canEditClinicalFields}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Consultation fee is included in the grand total and will be stored with the claim record.
                      </p>
                    </div>
                  )}
                  {chargeSections
                    .filter((section) => isSectionAllowed(serviceType, section.key as CatalogSection))
                    .map((section) => (
                    <div key={section.key} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-center">
                        <label className="text-sm font-semibold text-slate-800">{section.label}</label>
                        <div className="relative">
                          <span className="currency-prefix text-[10px] text-slate-900">RM</span>
                          <input
                            type="number"
                            className="w-full currency-input pl-10 py-1.5 text-sm bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            value={section.amount}
                            onChange={(e) => {
                              section.setAmount(e.target.value);
                              setError("");
                            }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr_auto] gap-3 items-center">
                        <label className="text-xs font-medium text-slate-600">{section.pickerLabel}</label>
                        <select
                          className={cn(
                            "w-full glass-select px-3 py-2 text-sm",
                            canEditClinicalFields ? "bg-white" : "bg-slate-50 text-slate-600 cursor-not-allowed"
                          )}
                          value={chargePickerDraft[section.key] || ""}
                          onChange={canEditClinicalFields
                            ? (e) =>
                                setChargePickerDraft((prev) => ({
                                  ...prev,
                                  [section.key]: e.target.value,
                                }))
                            : undefined}
                          disabled={!canEditClinicalFields}
                        >
                          <option value="">Select {section.pickerLabel.toLowerCase()}</option>
                          {section.options.length === 0 ? (
                            <option value="" disabled>
                              No catalog items
                            </option>
                          ) : null}
                          {section.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className={cn(
                            "w-full glass-input px-3 py-2 text-sm",
                            canEditClinicalFields ? "bg-white" : "bg-slate-50 text-slate-600 cursor-not-allowed"
                          )}
                          placeholder={`Other ${section.pickerLabel.toLowerCase()}`}
                          value={chargeCustomDraft[section.key] || ""}
                          onChange={canEditClinicalFields
                            ? (e) =>
                                setChargeCustomDraft((prev) => ({
                                  ...prev,
                                  [section.key]: e.target.value,
                                }))
                            : undefined}
                          readOnly={!canEditClinicalFields}
                        />
                        <GlassButton
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          onClick={() => addChargeItem(section.key)}
                          disabled={!canEditClinicalFields}
                        >
                          Add Item
                        </GlassButton>
                      </div>
                      <div className="flex flex-wrap gap-2 min-h-8">
                        {(selectedChargeItems[section.key] || []).length === 0 ? (
                          <span className="text-[11px] text-slate-400">No item selected.</span>
                        ) : (
                          (selectedChargeItems[section.key] || []).map((item) => (
                            <button
                              key={`${section.key}-${item}`}
                              type="button"
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full text-[11px] font-medium px-2.5 py-1",
                                canEditClinicalFields
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : "bg-slate-100 text-slate-600 cursor-default"
                              )}
                              onClick={canEditClinicalFields ? () => removeChargeItem(section.key, item) : undefined}
                              title={canEditClinicalFields ? "Remove item" : "Doctor-only field"}
                            >
                              {item}
                              <span className="text-xs">x</span>
                            </button>
                          ))
                        )}
                      </div>
                      {(["medication", "injection", "immunization"].includes(section.key) &&
                        (selectedChargeItems[section.key] || []).length > 0 && (
                          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_1fr] gap-2 text-[11px] font-semibold text-slate-500">
                              <span>Item</span>
                              <span>Qty</span>
                              <span>Unit</span>
                              <span>Frequency</span>
                            </div>
                            {(selectedChargeItems[section.key] || []).map((item) => {
                              const meta = selectedChargeItemMeta?.[section.key]?.[item] || {
                                quantity: "",
                                unit: "",
                                frequency: "",
                              };
                              return (
                                <div
                                  key={`${section.key}-${item}-meta`}
                                  className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_1fr] gap-2 items-center"
                                >
                                  <div className="text-xs font-medium text-slate-700 truncate" title={item}>
                                    {item}
                                  </div>
                                  <input
                                    type="text"
                                    className={cn(
                                      "w-full glass-input px-2 py-1.5 text-sm",
                                      canEditClinicalFields ? "bg-white" : "bg-slate-50 text-slate-600 cursor-not-allowed"
                                    )}
                                    placeholder="e.g. 1"
                                    value={meta.quantity}
                                    onChange={canEditClinicalFields
                                      ? (e) => {
                                          const value = e.target.value;
                                          setSelectedChargeItemMeta((prev) => ({
                                            ...prev,
                                            [section.key]: {
                                              ...(prev[section.key] || {}),
                                              [item]: { ...(prev[section.key]?.[item] || meta), quantity: value },
                                            },
                                          }));
                                        }
                                      : undefined}
                                    readOnly={!canEditClinicalFields}
                                  />
                                  <select
                                    className={cn(
                                      "w-full glass-select px-2 py-1.5 text-sm",
                                      canEditClinicalFields ? "bg-white" : "bg-slate-50 text-slate-600 cursor-not-allowed"
                                    )}
                                    value={meta.unit}
                                    onChange={canEditClinicalFields
                                      ? (e) => {
                                          const value = e.target.value;
                                          setSelectedChargeItemMeta((prev) => ({
                                            ...prev,
                                            [section.key]: {
                                              ...(prev[section.key] || {}),
                                              [item]: { ...(prev[section.key]?.[item] || meta), unit: value },
                                            },
                                          }));
                                        }
                                      : undefined}
                                    disabled={!canEditClinicalFields}
                                  >
                                    <option value="">Select unit</option>
                                    {unitOptions.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    className={cn(
                                      "w-full glass-select px-2 py-1.5 text-sm",
                                      canEditClinicalFields ? "bg-white" : "bg-slate-50 text-slate-600 cursor-not-allowed"
                                    )}
                                    value={meta.frequency}
                                    onChange={canEditClinicalFields
                                      ? (e) => {
                                          const value = e.target.value;
                                          setSelectedChargeItemMeta((prev) => ({
                                            ...prev,
                                            [section.key]: {
                                              ...(prev[section.key] || {}),
                                              [item]: { ...(prev[section.key]?.[item] || meta), frequency: value },
                                            },
                                          }));
                                        }
                                      : undefined}
                                    disabled={!canEditClinicalFields}
                                  >
                                    <option value="">Select frequency</option>
                                    {frequencyOptions.map((opt) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-1.5">
                        Select item(s) used for this category (catalog or custom), then key in the total amount on top.
                      </p>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3 items-center pt-2 border-t border-slate-200">
                    <label className="text-sm font-semibold text-slate-900 pt-2">Grand Total Amount (RM)</label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-bold focus:outline-none"
                      value={formatCurrency(totalAmount)}
                      readOnly
                    />
                  </div>
              </div>
            </div>

            <div className="h-px bg-slate-200/50" />

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Documentation
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                <div className="flex flex-col gap-2 h-full">
                  <label className="text-xs font-medium text-slate-500 ml-1">Medical Certificate (MC)</label>
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-center gap-3">
                      <label className="text-xs font-semibold text-slate-700">MC Required?</label>
                      <select
                        className="w-full glass-select px-3 py-2 text-sm bg-white"
                        value={mcRequired}
                        onChange={(e) => {
                          const next = (e.target.value as "Y" | "N") || "N";
                          setMcRequired(next);
                          if (next === "Y" && treatmentDate && !mcFrom && !mcTo) {
                            setMcFrom(treatmentDate);
                            setMcTo(treatmentDate);
                          }
                          if (next === "N") {
                            setMcFrom("");
                            setMcTo("");
                          }
                          setError("");
                        }}
                      >
                        <option value="N">No</option>
                        <option value="Y">Yes</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <GlassField label="MC From">
                        <GlassInput
                          type="date"
                          className="px-3 py-2 text-sm bg-white"
                          value={mcFrom}
                          onChange={(e) => {
                            setMcFrom(e.target.value);
                            setError("");
                          }}
                          disabled={mcRequired !== "Y"}
                        />
                      </GlassField>
                      <GlassField label="MC To">
                        <GlassInput
                          type="date"
                          className="px-3 py-2 text-sm bg-white"
                          value={mcTo}
                          onChange={(e) => {
                            setMcTo(e.target.value);
                            setError("");
                          }}
                          disabled={mcRequired !== "Y"}
                        />
                      </GlassField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] items-center gap-3">
                      <label className="text-xs font-semibold text-slate-700">MC Days</label>
                      <GlassInput
                        className="px-3 py-2 text-sm bg-slate-50"
                        value={String(mcDays)}
                        readOnly
                      />
                    </div>
                  </div>
                  <div className="mt-auto space-y-2">
                    <label className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-white/40 transition-all cursor-pointer group block">
                      <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-slate-700">Upload MC</p>
                      <p className="text-[10px] text-slate-400 mt-1">Optional supporting document. PDF or Image (Max 10MB)</p>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setMcFile(file);
                          setMcFileName(file?.name || "");
                          setError("");
                        }}
                      />
                    </label>
                    {mcFileName && <p className="text-[10px] text-slate-500">Uploaded: {mcFileName}</p>}
                    <GlassButton
                      variant="secondary"
                      className="w-full text-xs"
                      onClick={handleGenerateMcPdf}
                    >
                      Generate MC PDF
                    </GlassButton>
                  </div>
                </div>
                <div className="flex flex-col gap-2 h-full">
                  <label className="text-xs font-medium text-slate-500 ml-1">Referral Letter (RL)</label>
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] items-center gap-3">
                      <label className="text-xs font-semibold text-slate-700">RL Required?</label>
                      <select
                        className="w-full glass-select px-3 py-2 text-sm bg-white"
                        value={rlRequired}
                        onChange={(e) => {
                          setRlRequired(((e.target.value as "Y" | "N") || "N") as "Y" | "N");
                          setError("");
                        }}
                      >
                        <option value="N">No</option>
                        <option value="Y">Yes</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      If RL is set to No, referral letter PDF generation will be disabled.
                    </p>
                  </div>
                  <div className="mt-auto space-y-2">
                    <label className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-white/40 transition-all cursor-pointer group block">
                      <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-slate-700">Upload Referral Letter</p>
                      <p className="text-[10px] text-slate-400 mt-1">Optional supporting document. PDF or Image (Max 10MB)</p>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setReferralFile(file);
                          setReferralFileName(file?.name || "");
                          setError("");
                        }}
                      />
                    </label>
                    {referralFileName && <p className="text-[10px] text-slate-500">Uploaded: {referralFileName}</p>}
                    <GlassButton
                      variant="secondary"
                      className="w-full text-xs"
                      onClick={handleGenerateReferralPdf}
                    >
                      Generate Referral Letter PDF
                    </GlassButton>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-white/40 transition-all cursor-pointer group block">
                    <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-sm font-bold text-slate-700">Upload Final Bill & Reports</p>
                    <p className="text-[10px] text-slate-400 mt-1">Combine into one PDF if possible (Max 20MB)</p>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setFinalBillFile(file);
                        setFinalBillFileName(file?.name || "");
                        setError("");
                      }}
                    />
                  </label>
                  {finalBillFileName && <p className="text-[10px] text-slate-500">Uploaded: {finalBillFileName}</p>}
                </div>
              </div>
              {isDocumentationError && (
                <p className="text-xs text-rose-500 font-medium ml-1 animate-in slide-in-from-top-1">
                  {error}
                </p>
              )}
            </div>
          </GlassCard>

          <div className="flex flex-wrap items-center gap-3">
            <GlassButton
              variant="secondary"
              className="h-9 px-4 text-sm min-w-32"
              onClick={handleSaveDraft}
              disabled={!canSaveDraft}
            >
              Save Draft
            </GlassButton>
            <GlassButton
              variant="ghost"
              className="h-9 px-4 text-sm min-w-32 text-rose-700 border border-rose-200 bg-rose-50/60 hover:bg-rose-100 hover:text-rose-800"
              onClick={handleCancelDraft}
            >
              Cancel Draft
            </GlassButton>
            <GlassButton
              className="h-9 px-5 text-sm min-w-32"
              disabled={!submissionGuard.canSubmit || !!error || isBlockedEditMode}
              onClick={handleSubmit}
            >
              {canEditRequestedClaim ? "Resubmit" : "Submit"}
            </GlassButton>
          </div>
          {!canEditClinicalFields && canSaveDraft && (
            <p className="text-xs text-amber-700 font-medium ml-1">
              Doctor-only submission is enabled. Provider admin can save draft; doctor must submit.
            </p>
          )}
          {canEditClinicalFields && !submissionGuard.canSubmit ? (
            <p className="text-xs text-amber-700 font-medium ml-1">
              {submissionGuard.blockingReason}
            </p>
          ) : null}
          {isGeneralSubmissionError && (
            <p className="text-xs text-rose-500 font-medium ml-1 animate-in slide-in-from-top-1">
              {error}
            </p>
          )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="bg-sky-500/5 border-sky-100 p-6 space-y-4">
          <h3 className="font-bold text-sky-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Submission Tips
          </h3>
          <ul className="space-y-3">
            {[
              "Submit claims within 7 days of treatment.",
              "Ensure patient name matches the policy exactly.",
              "Include a detailed breakdown of all charges.",
              "Verify that the discharge summary is attached.",
              "Check for doctor's signature on all reports.",
            ].map((tip, i) => (
              <li key={i} className="text-xs text-sky-800 leading-relaxed flex gap-2">
                <span className="font-bold text-sky-500">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-6 text-center space-y-3">
          <h4 className="text-sm font-bold text-slate-800">Need Assistance?</h4>
          <p className="text-xs text-slate-500">Contact the Provider Support team at:</p>
          <p className="text-sm font-bold text-sky-600">1-800-MEDISYNC</p>
        </GlassCard>
      </div>
      {isReferralModalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-2xl p-0 overflow-hidden !bg-white border border-slate-200 backdrop-blur-none shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">Generate Referral Letter</h3>
                <button
                  className="text-sm text-slate-500 hover:text-slate-700"
                  onClick={() => {
                    setIsReferralModalOpen(false);
                    setReferralDraftErrors({});
                  }}
                  type="button"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Fill all required details before generating PDF.</p>
            </div>
            <div className="p-6 space-y-4">
              {Object.keys(referralDraftErrors).length > 0 && (
                <p className="text-xs text-red-500 font-medium">Please fix the highlighted required fields.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    className="w-full glass-input !bg-white !border-slate-300 text-slate-800 px-4 py-2.5"
                    value={referralDraft.date}
                    onChange={(e) => {
                      const value = e.target.value;
                      setReferralDraft((prev) => ({ ...prev, date: value }));
                      setReferralDraftErrors((prev) => ({ ...prev, date: value ? "" : "Date is required." }));
                    }}
                  />
                  {referralDraftErrors.date ? <p className="text-xs text-red-500 font-medium">{referralDraftErrors.date}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Specialist Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full glass-input !bg-white !border-slate-300 text-slate-800 px-4 py-2.5"
                    placeholder="Dr. Name"
                    value={referralDraft.specialistName}
                    onChange={(e) => {
                      const value = e.target.value;
                      setReferralDraft((prev) => ({ ...prev, specialistName: value }));
                      setReferralDraftErrors((prev) => ({ ...prev, specialistName: value.trim() ? "" : "Specialist Name is required." }));
                    }}
                  />
                  {referralDraftErrors.specialistName ? <p className="text-xs text-red-500 font-medium">{referralDraftErrors.specialistName}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">
                    Hospital <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full glass-input !bg-white !border-slate-300 text-slate-800 px-4 py-2.5"
                    placeholder="Hospital / Medical Center"
                    value={referralDraft.hospital}
                    onChange={(e) => {
                      const value = e.target.value;
                      setReferralDraft((prev) => ({ ...prev, hospital: value }));
                      setReferralDraftErrors((prev) => ({ ...prev, hospital: value.trim() ? "" : "Hospital is required." }));
                    }}
                  />
                  {referralDraftErrors.hospital ? <p className="text-xs text-red-500 font-medium">{referralDraftErrors.hospital}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    className="w-full glass-input !bg-white !border-slate-300 text-slate-800 px-4 py-2.5"
                    value={referralDraft.memberName}
                    onChange={(e) => setReferralDraft((prev) => ({ ...prev, memberName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">NRIC / Passport</label>
                  <input
                    type="text"
                    className="w-full glass-input !bg-white !border-slate-300 text-slate-800 px-4 py-2.5"
                    value={referralDraft.memberIdNo}
                    onChange={(e) => setReferralDraft((prev) => ({ ...prev, memberIdNo: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">
                    Referral Letter Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm min-h-36 resize-y focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
                    placeholder="Write referral content here..."
                    value={referralDraft.details}
                    onChange={(e) => {
                      const value = e.target.value;
                      setReferralDraft((prev) => ({ ...prev, details: value }));
                      setReferralDraftErrors((prev) => ({ ...prev, details: value.trim() ? "" : "Referral letter content is required." }));
                    }}
                  />
                  <p className="text-xs text-slate-400">This free text will be printed in the referral letter body.</p>
                  {referralDraftErrors.details ? <p className="text-xs text-red-500 font-medium">{referralDraftErrors.details}</p> : null}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-2">
              <GlassButton
                variant="ghost"
                className="h-9 px-4 text-sm"
                onClick={() => {
                  setIsReferralModalOpen(false);
                  setReferralDraftErrors({});
                }}
              >
                Cancel
              </GlassButton>
              <GlassButton className="h-9 px-4 text-sm" onClick={handleConfirmGenerateReferralPdf}>
                Generate Referral PDF
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
      <MobileDetailModal
        open={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title={lastSubmitWasResubmit ? "Claim Resubmitted Successfully" : "Claim Submitted Successfully"}
        subtitle={lastSubmittedClaimId ? `Reference: ${lastSubmittedClaimId}` : undefined}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setIsSuccessModalOpen(false)}>
              Stay Here
            </GlassButton>
            <GlassButton
              onClick={() => {
                setIsSuccessModalOpen(false);
                router.push("/provider/dashboard");
              }}
            >
              Go To Dashboard
            </GlassButton>
          </>
        }
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-800">
              {lastSubmitWasResubmit
                ? "Your updated invoice claim has been resubmitted for review."
                : "Your invoice claim has been submitted for review."}
            </p>
            <p className="text-sm text-slate-500">
              You can continue working here or return to the provider dashboard.
            </p>
          </div>
        </div>
      </MobileDetailModal>
      {isScanOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassCard className="w-full max-w-md p-0 overflow-hidden !bg-white border border-slate-200 backdrop-blur-none shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-800">Scan Member QR</h3>
                <button
                  className="text-sm text-slate-500 hover:text-slate-700"
                  onClick={() => setIsScanOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Point camera at member check-in QR.</p>
            </div>
            <div className="p-4 space-y-3">
              {scanError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{scanError}</p>
              ) : null}
              <QrScanner
                onResult={async (text) => {
                  setScanError("");
                  try {
                    const res = await fetch(withBasePath("/api/provider/qr/resolve"), {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ token: text }),
                    });
                    const json = await res.json().catch(() => null);
                    if (!res.ok || !json?.ok) {
                      setScanError(json?.error || "Scan failed.");
                      return;
                    }
                    setPatientId(json.staffId || json.nricPassport || "");
                    setIsScanOpen(false);
                  } catch {
                    setScanError("Failed to resolve QR token.");
                  }
                }}
                onError={(msg) => setScanError(msg)}
              />
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
