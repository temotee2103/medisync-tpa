"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { MobileDetailModal } from "@/components/ui/MobileDetailModal";
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  Search, 
  UserCheck, 
  AlertCircle,
  Calendar,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getProviderById, getProviderSession, getProviderUserById, normalizeProviderUserRole } from "@/lib/providerSession";
import { ensureMemberSeed, getMemberDirectory } from "@/lib/memberSession";
import { ensureCompanySeed, getCompanies, type CompanyPlanCategoryKey } from "@/lib/companyStore";
import { addAdminClaim, ensureAdminClaimsSeed } from "@/lib/claimsStore";
import { getCategoryLimit, getMemberLimitOwnerStaffId, resolveMemberPlan } from "@/lib/memberPlan";
import { formatCurrency } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { generateMedicalCertificatePdf, generateReferralLetterPdf } from "@/lib/providerDocuments";
import { getLimitLocks, getUtilizations, releaseReservation, reserveLimit } from "@/lib/entitlementStore";
import { addPanelVisitTransaction } from "@/lib/panelVisitStore";

const generateClaimId = () => {
  const stamp = Date.now().toString().slice(-8);
  return `CLM-${stamp}`;
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

export default function ProviderInvoicePage() {
  const router = useRouter();
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [patientId, setPatientId] = useState("");
  const [treatmentDate, setTreatmentDate] = useState("");
  const [error, setError] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(generateClaimId());
  const [doctorUserId, setDoctorUserId] = useState("");
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);
  const [diagnosisToAdd, setDiagnosisToAdd] = useState("");
  const [medicationDescription, setMedicationDescription] = useState("");
  const [medicationFee, setMedicationFee] = useState("");
  const [injectionFee, setInjectionFee] = useState("");
  const [investigationFee, setInvestigationFee] = useState("");
  const [procedureFee, setProcedureFee] = useState("");
  const [immunizationFee, setImmunizationFee] = useState("");
  const [adminDraftTotalAmount, setAdminDraftTotalAmount] = useState("");
  const [serviceType, setServiceType] = useState("Annual Health Screening (AHS)");
  const [mcFileName, setMcFileName] = useState("");
  const [referralFileName, setReferralFileName] = useState("");
  const [finalBillFileName, setFinalBillFileName] = useState("");
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastSubmittedClaimId, setLastSubmittedClaimId] = useState("");
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
  const diagnosisOptions = useMemo(
    () => [
      "Acute Upper Respiratory Infection",
      "Acute Gastritis",
      "Viral Fever",
      "Hypertension",
      "Type 2 Diabetes Mellitus",
      "Migraine",
      "Allergic Rhinitis",
      "Acute Pharyngitis",
      "Conjunctivitis",
      "Low Back Pain",
    ],
    []
  );

  if (isHydrated) {
    ensureMemberSeed();
    ensureCompanySeed();
    ensureAdminClaimsSeed();
  }

  const providerSession = isHydrated ? getProviderSession() : null;
  const providerOrgId = providerSession?.providerId || "";
  const memberDirectory = isHydrated ? getMemberDirectory() : [];
  const companies = isHydrated ? getCompanies() : [];
  const provider = providerOrgId ? getProviderById(providerOrgId) : null;
  const today = new Date().toISOString().slice(0, 10);
  const currentUser =
    providerOrgId && providerSession?.providerUserId
      ? getProviderUserById(providerOrgId, providerSession.providerUserId)
      : null;
  const currentUserRole =
    providerSession?.providerUserRole || normalizeProviderUserRole(currentUser?.role) || "provider_admin";
  const canEditClinicalFields = currentUserRole === "doctor";
  const canSaveDraft = currentUserRole === "doctor" || currentUserRole === "provider_admin";
  const verifiedDoctors =
    (provider?.compliance?.doctorApcs || [])
      .filter((doc) => {
        if (doc.status !== "approved") return false;
        if (!doc.expiryDate || doc.expiryDate < today) return false;
        const doctor = providerOrgId ? getProviderUserById(providerOrgId, doc.providerUserId) : null;
        const role = normalizeProviderUserRole(doctor?.role);
        return !!doctor && doctor.status === "Active" && role === "doctor";
      })
      .map((doc) => {
        const doctor = providerOrgId ? getProviderUserById(providerOrgId, doc.providerUserId) : null;
        return { providerUserId: doc.providerUserId, fullName: doctor?.fullName || doc.doctorName || doc.providerUserId };
      }) || [];
  const selectedDoctorUserId = canEditClinicalFields
    ? providerSession?.providerUserId || ""
    : doctorUserId || verifiedDoctors[0]?.providerUserId || "";
  const selectedDoctorName =
    verifiedDoctors.find((doc) => doc.providerUserId === selectedDoctorUserId)?.fullName ||
    (providerOrgId && selectedDoctorUserId ? getProviderUserById(providerOrgId, selectedDoctorUserId)?.fullName : "") ||
    "";
  const diagnosisCode = selectedDiagnoses.join(", ");
  const isTreatmentDateError =
    error === "Claims must be submitted within 7 days of treatment." ||
    error === "Please select treatment date before generating MC.";
  const isDocumentationError = error === "Please upload the final bill and reports.";
  const isGeneralSubmissionError = !!error && !isTreatmentDateError && !isDocumentationError;
  const clinicalTotalAmountNumber =
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
    if (!canEditClinicalFields) {
      setError("Only doctor login can key in medication description and charges breakdown.");
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

    if (!finalBillFileName) {
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

    const submittedClaims = JSON.parse(localStorage.getItem("provider_claims") || "[]");
    const alreadySubmitted = submittedClaims.some(
      (claim: { patientId: string; treatmentDate: string }) =>
        claim.patientId === patientId && claim.treatmentDate === treatmentDate
    );

    if (alreadySubmitted) {
      setError("Frequency Limit Exceeded: Only 1 visit per member per day is allowed.");
      return;
    }

    submittedClaims.push({ patientId, treatmentDate, timestamp: new Date().toISOString() });
    localStorage.setItem("provider_claims", JSON.stringify(submittedClaims));
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

    addAdminClaim({
      id: submittedInvoiceId,
      hospital: provider?.providerName || "Provider Submission",
      patient: matchedMember?.fullName || patientId,
      patientId: matchedMember?.staffId || patientId,
      amount: Number(totalAmount),
      status: "In review",
      date: treatmentDate,
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      doctorName: selectedDoctorName,
      doctorUserId: selectedDoctorUserId,
      operatorName: currentUser?.fullName || "",
      operatorMemberId: providerSession?.providerUserId || "",
      serviceType,
      diagnosis: diagnosisCode,
      diagnosisCodes: selectedDiagnoses,
      medicationDescription,
      medicationFee,
      injectionFee,
      investigationFee,
      procedureFee,
      immunizationFee,
      selectedChargeItems,
      mcFileName,
      referralFileName,
      finalBillFileName,
      memberKey,
      limitCategory: normalizedClaimCategory,
      reservedAmount: Number(totalAmount),
    });

    addPanelVisitTransaction({
      id: `PVIS-${Date.now()}`,
      claimId: submittedInvoiceId,
      providerId: providerOrgId,
      memberKey,
      patientId: matchedMember?.staffId || patientId,
      patientName: matchedMember?.fullName || patientId,
      visitDateTime: new Date().toISOString(),
      serviceType,
      amount: Number(totalAmount),
      createdAt: new Date().toISOString(),
    });
    // Keep reservation until admin approves/rejects (entitlement consumption is handled on approval).
    localStorage.removeItem("provider_invoice_draft");
    setLastSubmittedClaimId(submittedInvoiceId);
    setIsSuccessModalOpen(true);
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
    setServiceType("Annual Health Screening (AHS)");
    setMcFileName("");
    setReferralFileName("");
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
    setError("");
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
    localStorage.setItem(
      "provider_invoice_draft",
      JSON.stringify({
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
        serviceType,
        mcFileName,
        referralFileName,
        finalBillFileName,
      })
    );
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
    localStorage.removeItem("provider_invoice_draft");
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
    setServiceType("Annual Health Screening (AHS)");
    setMcFileName("");
    setReferralFileName("");
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
    const next = (chargePickerDraft[sectionKey] || "").trim();
    if (!next) return;
    setSelectedChargeItems((prev) => {
      const existing = prev[sectionKey] || [];
      if (existing.includes(next)) return prev;
      return { ...prev, [sectionKey]: [...existing, next] };
    });
    setChargePickerDraft((prev) => ({ ...prev, [sectionKey]: "" }));
  };

  const removeChargeItem = (sectionKey: string, item: string) => {
    setSelectedChargeItems((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).filter((entry) => entry !== item),
    }));
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
    if (!treatmentDate) {
      setError("Please select treatment date before generating MC.");
      return;
    }
    generateMedicalCertificatePdf({
      clinicName: provider?.providerName || "Clinic",
      clinicAddress: providerAddress,
      clinicPhone: provider?.contactPhone || "",
      clinicEmail: provider?.contactEmail || "",
      visitDate: treatmentDate,
      serialNumber: invoiceNumber,
      memberName: matchedMember?.fullName || "N/A",
      memberIdNo: matchedMember?.nricPassport || patientId || "N/A",
      diagnosis: diagnosisCode || "N/A",
      mcFrom: treatmentDate,
      mcTo: treatmentDate,
      issueDate: today,
      filename: `mc-${invoiceNumber}.pdf`,
    });
    setMcFileName(`mc-${invoiceNumber}.pdf`);
    setError("");
  };

  const handleGenerateReferralPdf = () => {
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
    generateReferralLetterPdf({
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
    setReferralFileName(`referral-${invoiceNumber}.pdf`);
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
      options: ["Paracetamol 500mg", "Amoxicillin 500mg", "Cetirizine 10mg", "Omeprazole 20mg", "Others"],
    },
    {
      key: "injection",
      label: "Injection (RM)",
      amount: injectionFee,
      setAmount: setInjectionFee,
      pickerLabel: "Injection",
      options: ["Diclofenac IM", "Vitamin B Complex", "Hydrocortisone", "Tetanus Toxoid", "Others"],
    },
    {
      key: "investigation",
      label: "Investigation (RM)",
      amount: investigationFee,
      setAmount: setInvestigationFee,
      pickerLabel: "Investigation",
      options: ["FBC", "LFT", "RFT", "Urine FEME", "X-Ray Chest", "Others"],
    },
    {
      key: "procedure",
      label: "Procedure (RM)",
      amount: procedureFee,
      setAmount: setProcedureFee,
      pickerLabel: "Procedure",
      options: ["Wound Dressing", "Nebulization", "ECG", "Minor Surgery", "Others"],
    },
    {
      key: "immunization",
      label: "Immunization (RM)",
      amount: immunizationFee,
      setAmount: setImmunizationFee,
      pickerLabel: "Immunization",
      options: ["Influenza", "Hepatitis B", "Tdap", "MMR", "Others"],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="space-y-6 p-6">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                Patient Selection
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                <input 
                  type="text" 
                  placeholder="Enter Member ID / NRIC / Passport No..." 
                  className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                />
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
              
              {/* Treatment Date with 7-day validation */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 ml-1">Treatment Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                  <input 
                    type="date" 
                    className={`w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 ${isTreatmentDateError ? 'focus:ring-rose-500/50 border-rose-500' : 'focus:ring-sky-500/50'}`}
                    value={treatmentDate}
                    onChange={handleDateChange}
                  />
                </div>
                {isTreatmentDateError && (
                  <p className="text-xs text-rose-500 font-medium ml-1 animate-in slide-in-from-top-1">
                    {error}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 ml-1">Claim ID</label>
                  <input
                    type="text"
                    className="w-full glass-input px-4 py-2 bg-slate-100/70"
                    value={invoiceNumber}
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 ml-1">Total Amount (RM)</label>
                  <div className="relative">
                    <span className="currency-prefix text-xs">RM</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      className="w-full currency-input pr-4 py-2 glass-input font-bold bg-slate-100/70"
                      step="0.01"
                      value={totalAmount}
                      readOnly
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 ml-1">Logged-in User</label>
                  <input
                    className="w-full glass-input px-3 py-2 text-sm bg-slate-50"
                    value={currentUser?.fullName ? `${currentUser.fullName} (${currentUserRole})` : "Unknown user"}
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 ml-1">Attending Doctor</label>
                  <select
                    className="w-full glass-select px-3 py-2 text-sm"
                    value={selectedDoctorUserId}
                    onChange={(e) => setDoctorUserId(e.target.value)}
                    disabled={canEditClinicalFields}
                  >
                    {verifiedDoctors.length === 0 ? (
                      <option value="">No verified doctor</option>
                    ) : (
                      verifiedDoctors.map((doctor) => (
                        <option key={doctor.providerUserId} value={doctor.providerUserId}>
                          {doctor.fullName}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-white/70">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clinical Details</h4>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500 ml-1">Diagnosis</label>
                  <div className="flex items-center gap-2">
                    <select
                      className="w-full glass-select px-4 py-2"
                      value={diagnosisToAdd}
                      onChange={(e) => setDiagnosisToAdd(e.target.value)}
                    >
                      <option value="">Select diagnosis</option>
                      {diagnosisOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <GlassButton
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                      onClick={addDiagnosis}
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
                          className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-700 text-[11px] font-medium px-2.5 py-1 hover:bg-sky-200"
                          onClick={() => removeDiagnosis(item)}
                          title="Remove diagnosis"
                        >
                          {item}
                          <span className="text-xs">x</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                {canEditClinicalFields && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 ml-1">Medication Description</label>
                    <textarea
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm min-h-40 resize-y focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
                      placeholder="Describe medication, dosage, route, and duration"
                      value={medicationDescription}
                      onChange={(e) => setMedicationDescription(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {!canEditClinicalFields && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Provider admin can save draft only. Login as doctor to key clinical details and submit.
                </div>
              )}

              {!canEditClinicalFields && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 ml-1">Draft Total Amount (RM)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full glass-input px-4 py-2.5"
                    step="0.01"
                    min="0"
                    value={adminDraftTotalAmount}
                    onChange={(e) => {
                      setAdminDraftTotalAmount(e.target.value);
                      setError("");
                    }}
                  />
                  <p className="text-[11px] text-slate-500 ml-1">
                    This amount will be used for limit reservation. Final amount will be locked in by the doctor submission.
                  </p>
                </div>
              )}

              {canEditClinicalFields && (
                <div className="space-y-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700">Charges Breakdown</h4>
                    <span className="text-[11px] text-slate-500">Itemized by treatment category</span>
                  </div>
                  {chargeSections.map((section) => (
                    <div key={section.key} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-center">
                        <label className="text-sm font-semibold text-slate-800">{section.label}</label>
                        <div className="relative">
                          <span className="currency-prefix text-[10px]">RM</span>
                          <input
                            type="number"
                            className="w-full currency-input py-2 text-sm bg-white rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            value={section.amount}
                            onChange={(e) => section.setAmount(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-3 items-center">
                        <label className="text-xs font-medium text-slate-600">{section.pickerLabel}</label>
                        <select
                          className="w-full glass-select px-3 py-2 text-sm bg-white"
                          value={chargePickerDraft[section.key] || ""}
                          onChange={(e) =>
                            setChargePickerDraft((prev) => ({
                              ...prev,
                              [section.key]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select {section.pickerLabel.toLowerCase()}</option>
                          {section.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <GlassButton
                          variant="secondary"
                          className="h-9 px-3 text-xs"
                          onClick={() => addChargeItem(section.key)}
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
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-medium px-2.5 py-1 hover:bg-emerald-200"
                              onClick={() => removeChargeItem(section.key, item)}
                              title="Remove item"
                            >
                              {item}
                              <span className="text-xs">x</span>
                            </button>
                          ))
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-1.5">
                        Select item(s) used for this category, then key in the total amount on top.
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
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 ml-1">Service Type</label>
                <select
                  className="w-full glass-select px-4 py-2"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
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
              </div>
            </div>

            <div className="h-px bg-slate-200/50" />

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Documentation
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500 ml-1">MC (Member) - Optional</label>
                  <label className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-white/40 transition-all cursor-pointer group block">
                    <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-700">Upload MC</p>
                    <p className="text-[10px] text-slate-400 mt-1">Optional supporting document. PDF or Image (Max 10MB)</p>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        setMcFileName(e.target.files?.[0]?.name || "");
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
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500 ml-1">Referral Letter - Optional</label>
                  <label className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-white/40 transition-all cursor-pointer group block">
                    <Upload className="w-6 h-6 text-slate-300 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-xs font-bold text-slate-700">Upload Referral Letter</p>
                    <p className="text-[10px] text-slate-400 mt-1">Optional supporting document. PDF or Image (Max 10MB)</p>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        setReferralFileName(e.target.files?.[0]?.name || "");
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
              <label className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-white/40 transition-all cursor-pointer group block">
                <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-bold text-slate-700">Upload Final Bill & Reports</p>
                <p className="text-[10px] text-slate-400 mt-1">Combine into one PDF if possible (Max 20MB)</p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    setFinalBillFileName(e.target.files?.[0]?.name || "");
                    setError("");
                  }}
                />
              </label>
              {finalBillFileName && <p className="text-[10px] text-slate-500">Uploaded: {finalBillFileName}</p>}
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
              disabled={!canEditClinicalFields || !!error}
              onClick={handleSubmit}
            >
              Submit
            </GlassButton>
          </div>
          {!canEditClinicalFields && canSaveDraft && (
            <p className="text-xs text-amber-700 font-medium ml-1">
              Doctor-only submission is enabled. Provider admin can save draft; doctor must submit.
            </p>
          )}
          {isGeneralSubmissionError && (
            <p className="text-xs text-rose-500 font-medium ml-1 animate-in slide-in-from-top-1">
              {error}
            </p>
          )}
        </div>

        {/* Info Sidebar */}
        <div className="space-y-6">
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
        title="Claim Submitted Successfully"
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
            <p className="text-base font-semibold text-slate-800">Your invoice claim has been submitted for review.</p>
            <p className="text-sm text-slate-500">
              You can continue working here or return to the provider dashboard.
            </p>
          </div>
        </div>
      </MobileDetailModal>
    </div>
  );
}
