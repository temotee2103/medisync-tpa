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
  doc?: VendorComplianceDocument | VendorDoctorApc
): ProviderComplianceState => {
  if (!doc || !doc.fileName || String(doc.status || "").trim().toLowerCase() === "missing") {
    return "missing";
  }

  const normalizedStatus = String(doc.status || "").trim().toLowerCase();
  if (normalizedStatus === "submitted") return "submitted";
  if (normalizedStatus === "rejected") return "rejected";

  if (!doc.expiryDate || doc.expiryDate < TODAY_KEY) {
    return "expired";
  }

  return "approved";
};

export const getClinicLicenseState = (clinicLicense?: VendorComplianceDocument) =>
  getComplianceDocumentState(clinicLicense);

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
  doctorApcState: ProviderComplianceState;
  clinicLicenseState: ProviderComplianceState;
}) => {
  if (!input.canAuthorClinicalContent) {
    return "Only doctor users can submit clinical content.";
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
  const clinicLicenseState = getClinicLicenseState(input.clinicLicense);
  const doctorApcState = getDoctorApcState({
    doctorApcs: input.doctorApcs,
    doctorIdentifiers: effectiveDoctorIdentifiers,
  });
  const hasVerifiedDoctorApc = doctorApcState === "approved";
  const hasActiveClinicLicense = clinicLicenseState === "approved";
  const canSubmit = canAuthorClinicalContent && hasVerifiedDoctorApc && hasActiveClinicLicense;

  return {
    canAuthorClinicalContent,
    hasVerifiedDoctorApc,
    hasActiveClinicLicense,
    canSubmit,
    doctorApcState,
    clinicLicenseState,
    doctorOptions,
    selectedDoctor,
    blockingReason: getBlockingReason({
      canAuthorClinicalContent,
      doctorApcState,
      clinicLicenseState,
    }),
  };
};
