export type AddressLike = {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type DependentPassportValidationInput = {
  nationality?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  passportFileName?: string;
};

const RAW_DIAL_CODES = [
  "+60",
  "+93", "+355", "+213", "+376", "+244", "+1", "+54", "+374", "+61", "+43", "+994",
  "+1", "+973", "+880", "+1", "+375", "+32", "+501", "+229", "+975", "+591", "+387",
  "+267", "+55", "+673", "+359", "+226", "+257", "+238", "+855", "+237", "+1", "+236",
  "+235", "+56", "+86", "+57", "+269", "+242", "+243", "+506", "+225", "+385", "+53",
  "+357", "+420", "+45", "+253", "+1", "+1", "+593", "+20", "+503", "+240", "+291",
  "+372", "+268", "+251", "+679", "+358", "+33", "+241", "+220", "+995", "+49", "+233",
  "+30", "+1", "+502", "+224", "+245", "+592", "+509", "+504", "+36", "+354", "+91",
  "+62", "+98", "+964", "+353", "+972", "+39", "+1", "+81", "+962", "+7", "+254",
  "+686", "+965", "+996", "+856", "+371", "+961", "+266", "+231", "+218", "+423",
  "+370", "+352", "+261", "+265", "+960", "+223", "+356", "+692", "+222", "+230",
  "+52", "+691", "+373", "+377", "+976", "+382", "+212", "+258", "+95", "+264", "+674",
  "+977", "+31", "+64", "+505", "+227", "+234", "+850", "+389", "+47", "+968", "+92",
  "+680", "+970", "+507", "+675", "+595", "+51", "+63", "+48", "+351", "+974", "+40",
  "+7", "+250", "+1", "+1", "+1", "+685", "+378", "+239", "+966", "+221", "+381",
  "+248", "+232", "+65", "+421", "+386", "+677", "+252", "+27", "+82", "+211", "+34",
  "+94", "+249", "+597", "+46", "+41", "+963", "+886", "+992", "+255", "+66", "+670",
  "+228", "+676", "+1", "+216", "+90", "+993", "+688", "+256", "+380", "+971", "+44",
  "+1", "+598", "+998", "+678", "+39", "+58", "+84", "+967", "+260", "+263",
];

export const DIAL_CODES = Array.from(new Set(RAW_DIAL_CODES));

export const normalizePhone = (phone?: string) => {
  if (!phone) return "";
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
};

export const formatPhoneForDisplay = (phone?: string) => {
  const normalized = normalizePhone(phone);
  if (!normalized) return "";
  if (!normalized.startsWith("+")) return normalized;
  const digits = normalized.slice(1);
  if (digits.startsWith("60")) {
    const national = digits.slice(2);
    if (national.length === 9) return `+60 ${national.slice(0, 2)}-${national.slice(2, 5)} ${national.slice(5)}`;
    if (national.length === 8) return `+60 ${national.slice(0, 1)}-${national.slice(1, 5)} ${national.slice(5)}`;
    return `+60 ${national}`;
  }
  return `+${digits}`;
};

export const splitPhoneNumber = (phone?: string, fallbackCountryCode = "+60") => {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return {
      countryCode: fallbackCountryCode,
      localNumber: "",
    };
  }

  const matchedDialCode =
    DIAL_CODES.slice().sort((a, b) => b.length - a.length).find((code) => normalized.startsWith(code)) ||
    fallbackCountryCode;

  return {
    countryCode: matchedDialCode,
    localNumber: normalized.slice(matchedDialCode.length),
  };
};

export const joinPhoneNumber = (countryCode: string, localNumber: string) => {
  const sanitizedCountryCode = countryCode.trim() || "+60";
  const sanitizedLocalNumber = localNumber.replace(/[^\d]/g, "");
  if (!sanitizedLocalNumber) return "";
  return normalizePhone(`${sanitizedCountryCode}${sanitizedLocalNumber}`);
};

export const normalizeName = (name?: string) => {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const formatDateDisplay = (isoDate?: string) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const formatCurrency = (amount?: number | string | null) => {
  const numericAmount =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number(amount)
        : 0;

  return `RM ${new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0)}`;
};

export const buildAddressLine = (address: AddressLike) => {
  return [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.postalCode,
    address.country || "Malaysia",
  ]
    .filter(Boolean)
    .join(", ");
};

export const validateDependentPassport = (form: DependentPassportValidationInput) => {
  const errors: Record<string, string> = {};
  const nationality = (form.nationality || "").trim().toLowerCase();
  const isForeigner = nationality && nationality !== "malaysia";
  if (!isForeigner) return { valid: true, errors };

  if (!form.passportNumber?.trim()) {
    errors.passportNumber = "Passport number is required for non-Malaysian dependent.";
  }
  if (!form.passportExpiryDate) {
    errors.passportExpiryDate = "Passport expiry date is required for non-Malaysian dependent.";
  } else if (form.passportExpiryDate <= new Date().toISOString().slice(0, 10)) {
    errors.passportExpiryDate = "Passport expiry date must be a future date.";
  }
  if (!form.passportFileName?.trim()) {
    errors.passportFileName = "Passport file upload is required for non-Malaysian dependent.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
};
