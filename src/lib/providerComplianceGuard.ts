import type {
  VendorComplianceDocument,
  VendorDoctorApc,
  VendorMemberDirectoryEntry,
} from "@/lib/providerSession";

export type ProviderComplianceState = "missing" | "submitted" | "approved" | "rejected" | "expired";

type ProviderSubmissionGuardInput = {
  role?: string | null;
  clinicLicense?: VendorComplianceDocument;
  doctorApcs?: VendorDoctorApc[];
  doctorIdentifiers?: Array<string | null | undefined>;
  selectedDoctorId?: string | null;
  doctors?: Array<VendorMemberDirectoryEntry | null | undefined>;
};

const TODAY_KEY = new Date().toISOString().slice(0, 10);

const normalizeRole = (role?: string | null) => String(role || "").trim().toLowerCase();

const normalizeIdentifier = (value?: string | null) => String(value || "").trim();

const isActiveDoctor = (doctor?: VendorMemberDirectoryEntry | null) => {
  if (!doctor) return false;
  return doctor.status === "Active" && normalizeRole(doctor.role) === "doctor";
};

export type ProviderDoctorOption = {
  providerUserId: string;
  providerUserUuid?: string;
  memberId?: string;
  fullName: string;
  doctorApcState: ProviderComplianceState;
  hasVerifiedDoctorApc: boolean;
};

export const getComplianceDocumentState = (
  doc?: VendorComplianceDocument | VendorDoctorApc,
  docType?: string
): ProviderComplianceState => {
  if (!doc || !doc.fileName || String(doc.status || "").trim().toLowerCase() === "missing") {
    return "missing";
  }

  const normalizedStatus = String(doc.status || "").trim().toLowerCase();
  if (normalizedStatus === "submitted") return "submitted";
  if (normalizedStatus === "rejected") return "rejected";

  // Non-expiry doc types: once approved, always valid (SSM, Borang B/F, TCM)
  const NON_EXPIRY_TYPES = new Set(["ssm", "borang_b", "clinic_license", "tcm"]);
  if (docType && NON_EXPIRY_TYPES.has(docType.toLowerCase())) return "approved";

  if (!doc.expiryDate || doc.expiryDate < TODAY_KEY) {
    return "expired";
  }

  return "approved";
};

export const getClinicLicenseState = (clinicLicense?: VendorComplianceDocument) =>
  getComplianceDocumentState(clinicLicense, "clinic_license");

export const getDoctorApcState = (input: {
  doctorApcs?: VendorDoctorApc[];
  doctorIdentifiers?: Array<string | null | undefined>;
}): ProviderComplianceState => {
  const identifiers = (input.doctorIdentifiers || []).map(normalizeIdentifier).filter(Boolean);
  if (identifiers.length === 0) return "missing";

  const matchedApc = (input.doctorApcs || []).find((doc) => {
    const providerUserId = normalizeIdentifier(doc.providerUserId);
    return identifiers.includes(providerUserId);
  });

  return getComplianceDocumentState(matchedApc);
};

export const getProviderDoctorOptions = (input: {
  doctorApcs?: VendorDoctorApc[];
  doctors?: Array<VendorMemberDirectoryEntry | null | undefined>;
}): ProviderDoctorOption[] => {
  return (input.doctors || [])
    .filter((doctor): doctor is VendorMemberDirectoryEntry => isActiveDoctor(doctor))
    .map((doctor) => {
      const providerUserId = normalizeIdentifier(doctor.providerUserUuid || doctor.memberId);
      const doctorApcState = getDoctorApcState({
        doctorApcs: input.doctorApcs,
        doctorIdentifiers: [doctor.providerUserUuid, doctor.memberId],
      });

      return {
        providerUserId,
        providerUserUuid: normalizeIdentifier(doctor.providerUserUuid) || undefined,
        memberId: normalizeIdentifier(doctor.memberId) || undefined,
        fullName: String(doctor.fullName || providerUserId || "Doctor"),
        doctorApcState,
        hasVerifiedDoctorApc: doctorApcState === "approved",
      };
    })
    .filter((doctor) => !!doctor.providerUserId);
};

const getBlockingReason = (input: {
  canAuthorClinicalContent: boolean;
  canSaveDraft: boolean;
  doctorApcState: ProviderComplianceState;
  clinicLicenseState: ProviderComplianceState;
  anyDoctorHasApprovedApc: boolean;
}) => {
  if (!input.canSaveDraft) {
    return "Only doctor or provider admin users can submit clinical content.";
  }

  if (!input.canAuthorClinicalContent) {
    // provider_admin — check vendor-level compliance
    if (!input.anyDoctorHasApprovedApc) {
      return "No doctor under this vendor has an approved APC. Upload at least one doctor APC before submitting.";
    }
    if (input.clinicLicenseState !== "approved") {
      if (input.clinicLicenseState === "expired") return "Clinic license has expired. Upload an active clinic license before submitting.";
      if (input.clinicLicenseState === "submitted") return "Clinic license is pending admin approval.";
      if (input.clinicLicenseState === "rejected") return "Clinic license was rejected. Upload a valid clinic license before submitting.";
      return "Clinic license is not active.";
    }
    return "";
  }

  if (input.doctorApcState !== "approved") {
    if (input.doctorApcState === "expired") {
      return "Doctor APC has expired. Renew and get it approved before submitting.";
    }
    if (input.doctorApcState === "submitted") {
      return "Doctor APC is pending admin approval.";
    }
    if (input.doctorApcState === "rejected") {
      return "Doctor APC was rejected. Upload a new APC and get it approved before submitting.";
    }
    return "Doctor APC is not verified.";
  }

  if (input.clinicLicenseState !== "approved") {
    if (input.clinicLicenseState === "expired") {
      return "Clinic license has expired. Upload an active clinic license before submitting.";
    }
    if (input.clinicLicenseState === "submitted") {
      return "Clinic license is pending admin approval.";
    }
    if (input.clinicLicenseState === "rejected") {
      return "Clinic license was rejected. Upload a valid clinic license before submitting.";
    }
    return "Clinic license is not active.";
  }

  return "";
};

export const getProviderSubmissionGuard = (input: ProviderSubmissionGuardInput) => {
  const doctorOptions = getProviderDoctorOptions({
    doctorApcs: input.doctorApcs,
    doctors: input.doctors,
  });
  const selectedDoctor = doctorOptions.find((doctor) => {
    const selectedDoctorId = normalizeIdentifier(input.selectedDoctorId);
    if (!selectedDoctorId) return false;
    return [doctor.providerUserId, doctor.providerUserUuid, doctor.memberId]
      .map(normalizeIdentifier)
      .filter(Boolean)
      .includes(selectedDoctorId);
  });
  const effectiveDoctorIdentifiers = [
    ...((selectedDoctor
      ? [selectedDoctor.providerUserId, selectedDoctor.providerUserUuid, selectedDoctor.memberId]
      : []) as Array<string | undefined>),
    ...(input.doctorIdentifiers || []),
  ];
  const canAuthorClinicalContent = normalizeRole(input.role) === "doctor";
  const canSaveDraft = canAuthorClinicalContent || normalizeRole(input.role) === "provider_admin";
  const clinicLicenseState = getClinicLicenseState(input.clinicLicense);
  const doctorApcState = getDoctorApcState({
    doctorApcs: input.doctorApcs,
    doctorIdentifiers: effectiveDoctorIdentifiers,
  });
  // Check if ANY doctor under this vendor has approved APC (for provider_admin)
  const anyDoctorHasApprovedApc = (input.doctorApcs || []).some((doc) =>
    getComplianceDocumentState(doc, "apc") === "approved"
  );
  const hasVerifiedDoctorApc = doctorApcState === "approved" || anyDoctorHasApprovedApc;
  const hasActiveClinicLicense = clinicLicenseState === "approved";
  const canSubmit = (canAuthorClinicalContent && hasVerifiedDoctorApc && hasActiveClinicLicense)
    || (canSaveDraft && !canAuthorClinicalContent && anyDoctorHasApprovedApc && hasActiveClinicLicense);

  return {
    canAuthorClinicalContent,
    canSaveDraft,
    hasVerifiedDoctorApc,
    hasActiveClinicLicense,
    canSubmit,
    doctorApcState,
    clinicLicenseState,
    doctorOptions,
    selectedDoctor,
    anyDoctorHasApprovedApc,
    blockingReason: getBlockingReason({
      canAuthorClinicalContent,
      canSaveDraft,
      doctorApcState,
      clinicLicenseState,
      anyDoctorHasApprovedApc,
    }),
  };
};
