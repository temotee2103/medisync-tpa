"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { 
  Building2,
  Plus,
  Search,
  Users,
  Mail,
  Phone,
  Briefcase,
  ShieldCheck,
  Download,
  Upload,
  User,
  Pencil,
  UserPlus,
  Info,
  MapPin,
  CreditCard,
  Calendar,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Company,
  createDefaultPlanConfig,
  normalizeCompanyPlanConfig,
  type CompanyPlanCategoryKey,
  type CompanyPlanConfig,
  type CompanyPlanType,
} from "@/lib/companyStore";
import { downloadMemberImportTemplate } from "@/lib/memberImport/template";
import { parseMemberImportWorkbook } from "@/lib/memberImport/parser";
import { validateImportRows } from "@/lib/memberImport/validation";
import type { ImportRowResult } from "@/lib/memberImport/types";
import type { MemberDirectoryEntry } from "@/lib/memberSession";
import { downloadText } from "@/lib/download";
import { validateFamilyRelationshipCaps } from "@/lib/familyRelationshipRules";
import { buildAddressLine, formatPhoneForDisplay, joinPhoneNumber, normalizeName, splitPhoneNumber, validateDependentPassport } from "@/lib/formats";
import { isValidPhone, normalizePhoneInput } from "@/lib/phoneValidation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { withBasePath } from "@/lib/basePath";
import { fetchAdminSession, type AdminRole } from "@/lib/adminSession";
import { canDeleteAdminResource, canOperateAdminPage, isAdminReadOnly } from "@/lib/adminPermissions";

const TODAY_KEY = new Date().toISOString().slice(0, 10);

const normalizeSupabaseErrorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return message.includes("Missing environment variable")
    ? "Supabase environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    : message;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type CompanyDbRow = {
  id: string;
  company_id: string;
  name: string;
  hr_name: string | null;
  status: string | null;
  registration_no: string | null;
  registration_no_old: string | null;
  tin_number: string | null;
  sst_number: string | null;
  ssm_file_name: string | null;
  ssm_expiry_date: string | null;
  industry: string | null;
  contact_email: string | null;
  contact_phone_name: string | null;
  contact_phone: string | null;
  contact_phone_secondary_name: string | null;
  contact_phone_secondary: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  plan_config: unknown;
};

type MemberDbRow = {
  staff_id: string;
  full_name: string | null;
  email: string | null;
  status: string | null;
  phone: string | null;
  passport_expiry: string | null;
  nationality: string | null;
  nric_passport: string | null;
  gender: string | null;
  relationship: string | null;
};

type BulkImportMemberRow = {
  rowNumber: number;
  type: "primary" | "dependent";
  staffId: string;
  parentStaffId?: string;
  relationship?: string;
  fullName: string;
  gender: string;
  idType: string;
  nricPassport: string;
  nationality: string;
  status: string;
  phoneCountryCode: string;
  phone: string;
  dob: string;
  passportExpiry: string;
  passportFileName: string;
  email?: string;
  tempPassword?: string;
  planType: string;
  lumpSumLimit: string;
  categoryEnabled: Record<string, string>;
  categoryLimits: Record<string, string>;
};

const NATIONALITIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Côte d’Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe"
];

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
  "+1", "+598", "+998", "+678", "+39", "+58", "+84", "+967", "+260", "+263"
];

const DIAL_CODES = Array.from(new Set(RAW_DIAL_CODES));

const createMemberPlanSelection = (company: Company | null) => {
  if (!company) return {};
  return Object.fromEntries(
    Object.entries(company.planConfig.categories).map(([key, category]) => [key, category.enabled])
  );
};

const createMemberPlanLimits = (company: Company | null) => {
  if (!company) return {};
  return Object.fromEntries(
    Object.entries(company.planConfig.categories).map(([key, category]) => [key, category.limit])
  );
};

const getOppositeBinaryGender = (gender: "Male" | "Female") => {
  return gender === "Male" ? "Female" : "Male";
};

const getNumericLimit = (value: number | "" | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const createEmptyDependentDraft = () => ({
  fullName: "",
  relationship: "Child" as const,
  gender: "Male" as const,
  nricPassport: "",
  passportExpiry: "",
  lumpSumLimit: "" as number | "",
  planLimits: {} as Record<string, number | "">,
});

const getDependentAllocatedLumpSum = (dependents: Array<{ lumpSumLimit?: number | "" }>) =>
  dependents.reduce((sum, dependent) => sum + getNumericLimit(dependent.lumpSumLimit), 0);

const getDependentAllocatedCategoryLimit = (
  dependents: Array<{ planLimits?: Record<string, number | ""> }>,
  key: string
) =>
  dependents.reduce((sum, dependent) => sum + getNumericLimit(dependent.planLimits?.[key]), 0);

type DependentDraft = {
  fullName: string;
  relationship: "Spouse" | "Child" | "Parent";
  gender: "Male" | "Female";
  nricPassport: string;
  passportExpiry: string;
  lumpSumLimit: number | "";
  planLimits: Record<string, number | "">;
};

type MemberFormDraft = {
  staffId: string;
  fullName: string;
  dob: string;
  gender: "Male" | "Female";
  email: string;
  phone: string;
  phoneCountryCode: string;
  passportExpiry: string;
  passportNo: string;
  nationality: string;
  idType: "NRIC" | "Passport";
  nricPassport: string;
  status: "Active" | "Disabled";
  tempPassword: string;
  passportFileName: string;
  autoDisablePassport: boolean;
  dependentSharedLimit: boolean;
  planType: CompanyPlanType;
  lumpSumLimit: number | "";
  planSelection: Record<string, boolean>;
  planLimits: Record<string, number | "">;
  dependents: DependentDraft[];
};

const createEmptyMemberForm = (company: Company | null): MemberFormDraft => ({
  staffId: "",
  fullName: "",
  dob: "",
  gender: "Male",
  email: "",
  phone: "",
  phoneCountryCode: "+60",
  passportExpiry: "",
  passportNo: "",
  nationality: "Malaysia",
  idType: "NRIC",
  nricPassport: "",
  status: "Active",
  tempPassword: "Temp1234",
  passportFileName: "",
  autoDisablePassport: company?.planConfig.autoDisablePassport ?? true,
  dependentSharedLimit: company?.planConfig.dependents.sharedLimit ?? true,
  planType: company?.planConfig.type ?? "category",
  lumpSumLimit: company?.planConfig.lumpSumLimit ?? "",
  planSelection: createMemberPlanSelection(company),
  planLimits: createMemberPlanLimits(company),
  dependents: [],
});

const createEmptyCompanyForm = (): Company => ({
  companyId: "",
  name: "",
  hrName: "",
  registrationNoNew: "",
  registrationNoOld: "",
  tinNumber: "",
  sstNumber: "",
  ssmFileName: "",
  ssmExpiryDate: "",
  industry: "",
  contactEmail: "",
  contactPhoneName: "",
  contactPhone: "",
  contactPhoneSecondaryName: "",
  contactPhoneSecondary: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  status: "Active",
  planConfig: createDefaultPlanConfig(),
});

const inferDobFromNric = (nricPassport: string) => {
  const normalized = nricPassport.replace(/[^0-9]/g, "");
  if (normalized.length < 6) return "";
  const yy = Number(normalized.slice(0, 2));
  const mm = normalized.slice(2, 4);
  const dd = normalized.slice(4, 6);
  const century = yy > Number(new Date().toISOString().slice(2, 4)) ? 1900 : 2000;
  return `${century + yy}-${mm}-${dd}`;
};

export default function AdminCompanyManagementPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyUuidByCode, setCompanyUuidByCode] = useState<Record<string, string>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyModalView, setCompanyModalView] = useState<"details" | "info">("details");
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
  const [bulkImportError, setBulkImportError] = useState("");
  const [bulkImportPreview, setBulkImportPreview] = useState<ImportRowResult[]>([]);
  const [bulkImportIsSubmitting, setBulkImportIsSubmitting] = useState(false);
  const [remoteMemberStats, setRemoteMemberStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    expired: number;
  } | null>(null);
  const [remoteMemberStatsError, setRemoteMemberStatsError] = useState("");
  const [companyForm, setCompanyForm] = useState<Company>(createEmptyCompanyForm);
  const [companyFormError, setCompanyFormError] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminRoleResolved, setAdminRoleResolved] = useState(false);
  const resolvedAdminRole = adminRole ?? "accountant";
  const canOperateCompanies = adminRoleResolved
    ? canOperateAdminPage(resolvedAdminRole, "/admin/companies")
    : false;
  const canDeleteCompanies = adminRoleResolved ? canDeleteAdminResource(resolvedAdminRole) : false;
  const companyPhoneParts = splitPhoneNumber(companyForm.contactPhone);
  const companyPhoneSecondaryParts = splitPhoneNumber(companyForm.contactPhoneSecondary || "");
  const isCompanyReadOnly = adminRoleResolved
    ? isAdminReadOnly(resolvedAdminRole, "/admin/companies")
    : false;
  const isCompanyAccessPending = !adminRoleResolved;
  const disableCompanyEditing = isCompanyAccessPending || isCompanyReadOnly;
  const [memberForm, setMemberForm] = useState<MemberFormDraft>(() => createEmptyMemberForm(null));
  const [memberFormError, setMemberFormError] = useState("");
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [totalMembersCount, setTotalMembersCount] = useState(0);

  const logAdminAction = async (action: string, entityType?: string, entityId?: string) => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const actorProfileId = data.session?.user.id || null;
      await supabase.from("admin_audit_logs").insert([
        {
          action,
          actor_profile_id: actorProfileId,
          entity_type: entityType || null,
          entity_id: entityId || null,
        },
      ]);
    } catch {
      return;
    }
  };

  const loadCompanies = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();

      const [{ data: companyRows, error: companyError }, { count: memberCount }] = await Promise.all([
        supabase
          .from("companies")
          .select(
            "id, company_id, name, hr_name, status, registration_no, registration_no_old, tin_number, sst_number, ssm_file_name, ssm_expiry_date, industry, contact_email, contact_phone_name, contact_phone, contact_phone_secondary_name, contact_phone_secondary, address_line1, address_line2, city, state, postal_code, plan_config"
          )
          .order("company_id"),
        supabase.from("members").select("id", { count: "exact", head: true }),
      ]);

      if (companyError) throw companyError;

      const uuidMap: Record<string, string> = {};
      const mapped = (companyRows || []).map((row: CompanyDbRow) => {
        uuidMap[String(row.company_id)] = String(row.id);
        return {
          companyId: String(row.company_id),
          name: String(row.name || ""),
          hrName: String(row.hr_name || ""),
          registrationNoNew: String(row.registration_no || ""),
          registrationNoOld: String(row.registration_no_old || ""),
          tinNumber: String(row.tin_number || ""),
          sstNumber: String(row.sst_number || ""),
          ssmFileName: String(row.ssm_file_name || ""),
          ssmExpiryDate: row.ssm_expiry_date ? String(row.ssm_expiry_date) : "",
          industry: String(row.industry || ""),
          contactEmail: String(row.contact_email || ""),
          contactPhoneName: String(row.contact_phone_name || ""),
          contactPhone: String(row.contact_phone || ""),
          contactPhoneSecondaryName: String(row.contact_phone_secondary_name || ""),
          contactPhoneSecondary: String(row.contact_phone_secondary || ""),
          addressLine1: String(row.address_line1 || ""),
          addressLine2: String(row.address_line2 || ""),
          city: String(row.city || ""),
          state: String(row.state || ""),
          postalCode: String(row.postal_code || ""),
          status: String(row.status || "").toLowerCase() === "disabled" ? "Disabled" : "Active",
          planConfig: normalizeCompanyPlanConfig(row.plan_config as Partial<CompanyPlanConfig> | null | undefined),
        } satisfies Company;
      });

      setCompanyUuidByCode(uuidMap);
      setCompanies(mapped);
      setTotalMembersCount(Number(memberCount || 0));
    } catch {
      setCompanies([]);
      setCompanyUuidByCode({});
      setTotalMembersCount(0);
    }
  }, []);

  const loadMembersForCompany = useCallback(async (companyCode: string) => {
    const companyUuid = companyUuidByCode[companyCode] || "";
    if (!companyUuid) {
      setMembers([]);
      return;
    }
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("members")
        .select("staff_id, full_name, email, status, phone, passport_expiry, nationality, nric_passport, gender, relationship")
        .eq("company_id", companyUuid)
        .order("staff_id");
      if (error) throw error;

      setMembers(
        (data as MemberDbRow[] | null || []).map((row) => ({
          companyId: companyCode,
          staffId: String(row.staff_id),
          fullName: String(row.full_name || ""),
          email: String(row.email || ""),
          status: String(row.status || "").toLowerCase() === "disabled" ? "Disabled" : "Active",
          phone: row.phone ? String(row.phone) : undefined,
          passportExpiry: row.passport_expiry ? String(row.passport_expiry) : undefined,
          nationality: row.nationality ? String(row.nationality) : undefined,
          nricPassport: row.nric_passport ? String(row.nric_passport) : undefined,
          gender: row.gender ? (String(row.gender) as MemberDirectoryEntry["gender"]) : undefined,
          relationship: row.relationship ? (String(row.relationship) as MemberDirectoryEntry["relationship"]) : undefined,
        }))
      );
    } catch {
      setMembers([]);
    }
  }, [companyUuidByCode]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

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


  const filteredCompanies = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return companies;
    return companies.filter((company) => {
      return (
        company.name.toLowerCase().includes(normalized) ||
        company.companyId.toLowerCase().includes(normalized) ||
        company.registrationNoNew.toLowerCase().includes(normalized) ||
        (company.registrationNoOld || "").toLowerCase().includes(normalized)
      );
    });
  }, [companies, searchTerm]);

  const activeCompanyId = useMemo(() => {
    return selectedCompanyId || companies[0]?.companyId || "";
  }, [selectedCompanyId, companies]);

  const selectedCompany = useMemo(() => {
    return companies.find((company) => company.companyId === activeCompanyId) || null;
  }, [companies, activeCompanyId]);

  useEffect(() => {
    if (!activeCompanyId) return;
    loadMembersForCompany(activeCompanyId);
  }, [activeCompanyId, loadMembersForCompany]);

  const memberStats = useMemo(() => {
    const total = members.length;
    const active = members.filter((member) => member.status === "Active").length;
    const inactive = total - active;
    const expired = members.filter((member) => {
      if (!member.passportExpiry) return false;
      if (member.passportExpiry.length < 10) return false;
      return member.passportExpiry < TODAY_KEY;
    }).length;
    return { total, active, inactive, expired };
  }, [members]);
  const effectiveMemberStats = remoteMemberStats || memberStats;
  const companyStats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter((company) => company.status === "Active").length;
    return { total, active, inactive: total - active, totalMembers: totalMembersCount };
  }, [companies, totalMembersCount]);

  const refreshRemoteMemberStats = useCallback(async (companyCode: string) => {
    if (!companyCode) return;
    setRemoteMemberStatsError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: companyRow, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("company_id", companyCode)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!companyRow?.id) {
        setRemoteMemberStats(null);
        return;
      }

      const companyId = companyRow.id as string;
      const [{ count: total }, { count: active }, { count: expired }] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .lt("passport_expiry", TODAY_KEY),
      ]);

      const totalCount = Number(total || 0);
      const activeCount = Number(active || 0);
      const expiredCount = Number(expired || 0);
      setRemoteMemberStats({
        total: totalCount,
        active: activeCount,
        inactive: Math.max(totalCount - activeCount, 0),
        expired: expiredCount,
      });
    } catch (error) {
      setRemoteMemberStats(null);
      setRemoteMemberStatsError(normalizeSupabaseErrorMessage(error, "Failed to load member stats."));
    }
  }, []);

  const upsertCompanyToSupabase = async (company: Company) => {
    const res = await fetch(withBasePath("/api/admin/companies/upsert"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(payload.error || "Failed to save company.");
  };

  const updateSelectedCompany = (updated: Company) => {
    if (!canOperateCompanies) return;
    setCompanies((prev) => prev.map((entry) => (entry.companyId === updated.companyId ? updated : entry)));
    void upsertCompanyToSupabase(updated);
    void logAdminAction(`Updated company plan config: ${updated.companyId}`, "companies", updated.companyId);
  };

  useEffect(() => {
    if (!activeCompanyId) return;
    refreshRemoteMemberStats(activeCompanyId);
  }, [activeCompanyId, refreshRemoteMemberStats]);

  const closeBulkImport = () => {
    setIsBulkImportOpen(false);
    setBulkImportFile(null);
    setBulkImportError("");
    setBulkImportPreview([]);
    setBulkImportIsSubmitting(false);
  };

  const bulkImportStats = useMemo(() => {
    const ok = bulkImportPreview.filter((row) => row.status === "ok").length;
    const error = bulkImportPreview.filter((row) => row.status === "error").length;
    return { ok, error };
  }, [bulkImportPreview]);

  const handleDownloadMemberTemplate = () => {
    if (!selectedCompany) return;
    downloadMemberImportTemplate(selectedCompany);
  };

  const handleBulkImportFile = async (file: File) => {
    if (!selectedCompany) return;
    setBulkImportFile(file);
    setBulkImportError("");
    try {
      const rows = await parseMemberImportWorkbook(file, selectedCompany);
      const preview = validateImportRows(selectedCompany, rows);
      setBulkImportPreview(preview);
    } catch (error) {
      setBulkImportPreview([]);
      setBulkImportError(error instanceof Error ? error.message : "Failed to parse file.");
    }
  };

  const confirmBulkImport = async () => {
    if (disableCompanyEditing) return;
    if (!selectedCompany || !bulkImportFile) return;
    const hasErrors = bulkImportPreview.some((row) => row.status === "error");
    if (hasErrors) {
      setBulkImportError("Fix Excel errors before importing.");
      return;
    }
    const okRows = bulkImportPreview
      .filter((row): row is Extract<ImportRowResult, { status: "ok" }> => row.status === "ok")
      .map((row) => row.row);
    if (okRows.length === 0) {
      setBulkImportError("No valid rows to import.");
      return;
    }

    setBulkImportIsSubmitting(true);
    setBulkImportError("");
    try {
      await upsertCompanyToSupabase(selectedCompany);
      const res = await fetch(withBasePath("/api/admin/members/bulk-import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedCompany.companyId, mode: "upsert", rows: okRows }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error || "Bulk import failed.");
      await logAdminAction(`Bulk imported members into ${selectedCompany.companyId}`, "companies", selectedCompany.companyId);
      await refreshRemoteMemberStats(selectedCompany.companyId);
      await loadMembersForCompany(selectedCompany.companyId);
      await loadCompanies();
      closeBulkImport();
    } catch (error) {
      setBulkImportError(normalizeSupabaseErrorMessage(error, "Bulk import failed."));
    } finally {
      setBulkImportIsSubmitting(false);
    }
  };

  const renderCompaniesCards = () => (
    <div className="space-y-3">
      {filteredCompanies.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-slate-400">No companies found.</GlassCard>
      ) : (
        filteredCompanies.map((company) => (
          <MobileRecordCard
            key={company.companyId}
            title={<span className="font-semibold text-slate-800">{company.name}</span>}
            subtitle={
              <span>
                {company.companyId}{" · "}
                {company.registrationNoNew}
                {company.registrationNoOld && company.registrationNoOld !== company.registrationNoNew
                  ? ` (Old: ${company.registrationNoOld})`
                  : ""}
              </span>
            }
            badge={
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  company.status === "Active"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {company.status}
              </span>
            }
            footer={
              <div className="flex flex-wrap justify-end gap-2">
                <GlassButton
                  variant="ghost"
                  className="h-9 w-9 p-0 flex items-center justify-center text-sky-600 hover:text-sky-700"
                  title="Edit company"
                  onClick={() => {
                    setSelectedCompanyId(company.companyId);
                    setEditingCompanyId(company.companyId);
                    setCompanyModalView("details");
                    setCompanyForm(company);
                    setCompanyFormError("");
                    setIsCompanyModalOpen(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  className="h-9 w-9 p-0 flex items-center justify-center"
                  title={company.status === "Active" ? "Disable company" : "Activate company"}
                  disabled={disableCompanyEditing}
                  onClick={async () => {
                    if (disableCompanyEditing) return;
                    const nextStatus: Company["status"] = company.status === "Active" ? "Disabled" : "Active";
                    const updated = { ...company, status: nextStatus };
                    updateSelectedCompany(updated);
                    if (editingCompanyId === company.companyId) {
                      setCompanyForm((prev) => ({ ...prev, status: nextStatus }));
                    }
                    await loadCompanies();
                    await logAdminAction(
                      `Changed company status: ${company.companyId} -> ${nextStatus}`,
                      "companies",
                      company.companyId
                    );
                  }}
                >
                  <ShieldCheck className="w-4 h-4" />
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  className="h-9 w-9 p-0 flex items-center justify-center"
                  title="Add member"
                  disabled={disableCompanyEditing}
                  onClick={() => {
                    setSelectedCompanyId(company.companyId);
                    setMemberForm(createEmptyMemberForm(company));
                    setMemberFormError("");
                    setIsMemberModalOpen(true);
                  }}
                >
                  <UserPlus className="w-4 h-4" />
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  className="h-9 w-9 p-0 flex items-center justify-center"
                  title="Bulk upload members (Excel)"
                  disabled={disableCompanyEditing}
                  onClick={() => {
                    setSelectedCompanyId(company.companyId);
                    setBulkImportFile(null);
                    setBulkImportError("");
                    setBulkImportPreview([]);
                    setIsBulkImportOpen(true);
                  }}
                >
                  <Upload className="w-4 h-4" />
                </GlassButton>
                {canDeleteCompanies && (
                  <GlassButton
                    variant="ghost"
                    className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
                    title="Delete company"
                    onClick={async () => {
                      const shouldDelete = window.confirm(`Delete ${company.name} and all its members?`);
                      if (!shouldDelete) return;
                      try {
                        const supabase = createSupabaseBrowserClient();
                        const { error } = await supabase
                          .from("companies")
                          .delete()
                          .eq("company_id", company.companyId);
                        if (error) throw error;
                      } catch (error) {
                        alert(normalizeSupabaseErrorMessage(error, "Failed to delete company."));
                        return;
                      }
                      if (selectedCompanyId === company.companyId) {
                        setSelectedCompanyId("");
                      }
                      if (editingCompanyId === company.companyId) {
                        setIsCompanyModalOpen(false);
                        setEditingCompanyId(null);
                        setCompanyModalView("details");
                      }
                      setCompanies((prev) => prev.filter((entry) => entry.companyId !== company.companyId));
                      setMembers([]);
                      await loadCompanies();
                      await logAdminAction(`Deleted company ${company.companyId}`, "companies", company.companyId);
                    }}
                  >
                    <XCircle className="w-4 h-4" />
                  </GlassButton>
                )}
              </div>
            }
          />
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Corporate Management</h1>
          <p className="text-slate-500">Create companies and manage their member rosters.</p>
        </div>
        <GlassButton
          className="gap-2"
          disabled={disableCompanyEditing}
          onClick={() => {
            setEditingCompanyId(null);
            setCompanyModalView("details");
            setCompanyForm(createEmptyCompanyForm());
            setCompanyFormError("");
            setIsCompanyModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          {isCompanyAccessPending ? "Checking Access..." : "Add Company"}
        </GlassButton>
      </div>

      <GlassCard className="p-4 space-y-4">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by company name, ID, or registration..."
            className="w-full pl-9 pr-4 py-2 glass-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Total Companies</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{companyStats.total}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Active Companies</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{companyStats.active}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-slate-400">Covered Members</p>
            <p className="text-2xl font-bold text-sky-700 mt-1">{companyStats.totalMembers}</p>
          </div>
          <button
            type="button"
            className="glass-card rounded-2xl p-4 text-left transition-all hover:bg-white/60"
            onClick={() => router.push("/admin/users?section=corporate&corporateFilter=expired_passport")}
          >
            <p className="text-xs uppercase tracking-widest text-slate-400">Expired Passports</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{effectiveMemberStats.expired}</p>
          </button>
        </div>
      </GlassCard>

      <ResponsiveDataView
        desktop={
          <GlassCard className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200/60">
              <h2 className="text-sm font-bold text-slate-800">Corporate Grid View</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr className="text-left text-xs uppercase tracking-widest text-slate-400">
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3">Company ID</th>
                    <th className="px-6 py-3">Registration</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((company) => (
                    <tr key={company.companyId} className={`border-t border-slate-100 ${activeCompanyId === company.companyId ? "bg-sky-50/60" : "hover:bg-slate-50/60"}`}>
                      <td className="px-6 py-4 font-semibold text-slate-800">{company.name}</td>
                      <td className="px-6 py-4 text-slate-500">{company.companyId}</td>
                      <td className="px-6 py-4 text-slate-500">
                        <div className="space-y-0.5">
                          <p>{company.registrationNoNew}</p>
                          <p className="text-[11px] text-slate-400">Old: {company.registrationNoOld || "—"}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${company.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {company.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <GlassButton
                            variant="ghost"
                            className="h-9 w-9 p-0 flex items-center justify-center text-sky-600 hover:text-sky-700"
                            title="Edit company"
                            onClick={() => {
                              setSelectedCompanyId(company.companyId);
                              setEditingCompanyId(company.companyId);
                              setCompanyModalView("details");
                              setCompanyForm(company);
                              setCompanyFormError("");
                              setIsCompanyModalOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </GlassButton>
                          <GlassButton
                            variant="ghost"
                            className="h-9 w-9 p-0 flex items-center justify-center"
                            title={company.status === "Active" ? "Disable company" : "Activate company"}
                            disabled={disableCompanyEditing}
                            onClick={async () => {
                              if (disableCompanyEditing) return;
                              const nextStatus: Company["status"] = company.status === "Active" ? "Disabled" : "Active";
                              const updated = { ...company, status: nextStatus };
                              updateSelectedCompany(updated);
                              if (editingCompanyId === company.companyId) {
                                setCompanyForm((prev) => ({ ...prev, status: nextStatus }));
                              }
                              await loadCompanies();
                              await logAdminAction(
                                `Changed company status: ${company.companyId} -> ${nextStatus}`,
                                "companies",
                                company.companyId
                              );
                            }}
                          >
                              <ShieldCheck className="w-4 h-4" />
                          </GlassButton>
                          <GlassButton
                            variant="ghost"
                            className="h-9 w-9 p-0 flex items-center justify-center"
                            title="Add member"
                            disabled={disableCompanyEditing}
                            onClick={() => {
                              setSelectedCompanyId(company.companyId);
                              setMemberForm(createEmptyMemberForm(company));
                              setMemberFormError("");
                              setIsMemberModalOpen(true);
                            }}
                          >
                            <UserPlus className="w-4 h-4" />
                          </GlassButton>
                          <GlassButton
                            variant="ghost"
                            className="h-9 w-9 p-0 flex items-center justify-center"
                            title="Bulk upload members (Excel)"
                            disabled={disableCompanyEditing}
                            onClick={() => {
                              setSelectedCompanyId(company.companyId);
                              setBulkImportFile(null);
                              setBulkImportError("");
                              setBulkImportPreview([]);
                              setIsBulkImportOpen(true);
                            }}
                          >
                            <Upload className="w-4 h-4" />
                          </GlassButton>
                            {canDeleteCompanies && (
                              <GlassButton
                                variant="ghost"
                                className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
                                title="Delete company"
                                onClick={async () => {
                                  const shouldDelete = window.confirm(`Delete ${company.name} and all its members?`);
                                  if (!shouldDelete) return;
                                  try {
                                    const supabase = createSupabaseBrowserClient();
                                    const { error } = await supabase
                                      .from("companies")
                                      .delete()
                                      .eq("company_id", company.companyId);
                                    if (error) throw error;
                                  } catch (error) {
                                    alert(normalizeSupabaseErrorMessage(error, "Failed to delete company."));
                                    return;
                                  }
                                  if (selectedCompanyId === company.companyId) {
                                    setSelectedCompanyId("");
                                  }
                                  if (editingCompanyId === company.companyId) {
                                    setIsCompanyModalOpen(false);
                                    setEditingCompanyId(null);
                                    setCompanyModalView("details");
                                  }
                                  setCompanies((prev) => prev.filter((entry) => entry.companyId !== company.companyId));
                                  setMembers([]);
                                  await loadCompanies();
                                  await logAdminAction(`Deleted company ${company.companyId}`, "companies", company.companyId);
                                }}
                              >
                                <XCircle className="w-4 h-4" />
                              </GlassButton>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredCompanies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400">No companies found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        }
        mobile={renderCompaniesCards()}
      />

      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              setIsCompanyModalOpen(false);
              setEditingCompanyId(null);
              setCompanyModalView("details");
              setCompanyFormError("");
            }}
          />
          <GlassCard className="w-full max-w-4xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-sky-600" />
                  {editingCompanyId ? "Edit Company" : "Add Company"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {editingCompanyId ? "Update corporate profile and contact details." : "Create corporate profile and contact details."}
                </p>
              </div>
              <button 
                onClick={() => {
                  setIsCompanyModalOpen(false);
                  setEditingCompanyId(null);
                  setCompanyModalView("details");
                  setCompanyFormError("");
                }}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            {editingCompanyId && (
              <div className="px-8 py-3 border-b border-slate-200/60 bg-white/80 backdrop-blur-md flex gap-2">
                <GlassButton
                  variant={companyModalView === "details" ? "primary" : "secondary"}
                  className="gap-2"
                  onClick={() => setCompanyModalView("details")}
                >
                  <Pencil className="w-4 h-4" />
                  Details
                </GlassButton>
                <GlassButton
                  variant={companyModalView === "info" ? "primary" : "secondary"}
                  className="gap-2"
                  onClick={() => setCompanyModalView("info")}
                >
                  <Info className="w-4 h-4" />
                  Info
                </GlassButton>
              </div>
            )}

            <div className="overflow-y-auto p-8 custom-scrollbar">
              {companyModalView === "details" ? (
                <fieldset disabled={disableCompanyEditing} className="space-y-8">
                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                      Company Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Company ID <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input
                            className={`w-full glass-input pl-10 pr-4 py-2.5 ${editingCompanyId ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}`}
                            placeholder="CMP-001"
                            value={companyForm.companyId}
                            onChange={(e) => setCompanyForm({ ...companyForm, companyId: e.target.value })}
                            required
                            disabled={!!editingCompanyId}
                            title={editingCompanyId ? "Company ID cannot be changed when editing." : ""}
                          />
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Company Name <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="Company Name"
                            value={companyForm.name}
                            onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                            required
                          />
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Registration No. (New) <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="Current registration number"
                            value={companyForm.registrationNoNew}
                            onChange={(e) => setCompanyForm({ ...companyForm, registrationNoNew: e.target.value })}
                            required
                          />
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Registration No. (Old)</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="Old registration number"
                            value={companyForm.registrationNoOld || ""}
                            onChange={(e) => setCompanyForm({ ...companyForm, registrationNoOld: e.target.value })}
                          />
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">Address Line 1</label>
                        <input
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="No / Building / Street"
                          value={companyForm.addressLine1 || ""}
                          onChange={(e) => setCompanyForm({ ...companyForm, addressLine1: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">Address Line 2</label>
                        <input
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="Area / District"
                          value={companyForm.addressLine2 || ""}
                          onChange={(e) => setCompanyForm({ ...companyForm, addressLine2: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">City</label>
                        <input
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="City"
                          value={companyForm.city || ""}
                          onChange={(e) => setCompanyForm({ ...companyForm, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">State</label>
                        <input
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="State"
                          value={companyForm.state || ""}
                          onChange={(e) => setCompanyForm({ ...companyForm, state: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Postal Code</label>
                        <input
                          className="w-full glass-input px-4 py-2.5"
                          placeholder="e.g. 50450"
                          value={companyForm.postalCode || ""}
                          onChange={(e) => setCompanyForm({ ...companyForm, postalCode: e.target.value })}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                      Registration & Compliance
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">TIN Number</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="TIN Number"
                            value={companyForm.tinNumber}
                            onChange={(e) => setCompanyForm({ ...companyForm, tinNumber: e.target.value })}
                          />
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">SST Number</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="SST Number"
                            value={companyForm.sstNumber}
                            onChange={(e) => setCompanyForm({ ...companyForm, sstNumber: e.target.value })}
                          />
                          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">SSM Upload</label>
                        <input
                          type="file"
                          className="w-full glass-input px-4 py-2.5 bg-white text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-100 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-slate-600 hover:file:bg-slate-200/80"
                          onChange={(e) => setCompanyForm({ ...companyForm, ssmFileName: e.target.files?.[0]?.name || "" })}
                        />
                        <p className="text-[10px] text-slate-400 pl-1">Upload company SSM certificate (PDF or image).</p>
                      </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">SSM Expiry Date</label>
                      <div className="relative">
                        <input
                          type="date"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          value={companyForm.ssmExpiryDate || ""}
                          onChange={(e) => setCompanyForm({ ...companyForm, ssmExpiryDate: e.target.value })}
                        />
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                      Contact Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">HR Name <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="HR representative"
                            value={companyForm.hrName}
                            onChange={(e) => setCompanyForm({ ...companyForm, hrName: e.target.value })}
                            required
                          />
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">HR Contact Email</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="hr@company.com"
                            value={companyForm.contactEmail}
                            onChange={(e) => setCompanyForm({ ...companyForm, contactEmail: e.target.value })}
                          />
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Contact Person Name</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="Person in charge"
                            value={companyForm.contactPhoneName || ""}
                            onChange={(e) => setCompanyForm({ ...companyForm, contactPhoneName: e.target.value })}
                          />
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Contact Number</label>
                        <div className="flex gap-3">
                          <div className="relative w-28 shrink-0">
                            <select
                              className="w-full glass-input px-3 py-2.5 bg-transparent"
                              value={companyPhoneParts.countryCode}
                              onChange={(e) =>
                                setCompanyForm({
                                  ...companyForm,
                                  contactPhone: joinPhoneNumber(e.target.value, companyPhoneParts.localNumber),
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
                            value={companyPhoneParts.localNumber}
                            onChange={(e) =>
                              setCompanyForm({
                                ...companyForm,
                                contactPhone: joinPhoneNumber(companyPhoneParts.countryCode, e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Second Contact Person Name</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="Person in charge"
                            value={companyForm.contactPhoneSecondaryName || ""}
                            onChange={(e) => setCompanyForm({ ...companyForm, contactPhoneSecondaryName: e.target.value })}
                          />
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">Second Contact Number</label>
                        <div className="flex gap-3">
                          <div className="relative w-28 shrink-0">
                            <select
                              className="w-full glass-input px-3 py-2.5 bg-transparent"
                              value={companyPhoneSecondaryParts.countryCode}
                              onChange={(e) =>
                                setCompanyForm({
                                  ...companyForm,
                                  contactPhoneSecondary: joinPhoneNumber(e.target.value, companyPhoneSecondaryParts.localNumber),
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
                            value={companyPhoneSecondaryParts.localNumber}
                            onChange={(e) =>
                              setCompanyForm({
                                ...companyForm,
                                contactPhoneSecondary: joinPhoneNumber(companyPhoneSecondaryParts.countryCode, e.target.value),
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </fieldset>
              ) : selectedCompany ? (
                <div className="space-y-6">
                  <GlassCard className="p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Building2 className="w-5 h-5 text-sky-500" />
                          {selectedCompany.name}
                        </h2>
                        <p className="text-xs text-slate-500">{selectedCompany.registrationNoNew}</p>
                      </div>
                      <GlassButton
                        className="gap-2"
                        disabled={disableCompanyEditing}
                        onClick={() => {
                          setMemberForm(createEmptyMemberForm(selectedCompany));
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
                          {selectedCompany.contactEmail}
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone className="w-4 h-4 text-slate-400" />
                          {selectedCompany.contactPhoneName
                            ? `${selectedCompany.contactPhoneName} • ${formatPhoneForDisplay(selectedCompany.contactPhone)}`
                            : formatPhoneForDisplay(selectedCompany.contactPhone)}
                        </div>
                        {selectedCompany.contactPhoneSecondary && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone className="w-4 h-4 text-slate-400" />
                            {selectedCompany.contactPhoneSecondaryName
                              ? `${selectedCompany.contactPhoneSecondaryName} • ${formatPhoneForDisplay(selectedCompany.contactPhoneSecondary)}`
                              : formatPhoneForDisplay(selectedCompany.contactPhoneSecondary)}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Address</p>
                        <p className="text-slate-600">{buildAddressLine(selectedCompany) || "Not provided"}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">Members Overview</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{effectiveMemberStats.total} total</span>
                        <GlassButton
                          variant="secondary"
                          className="h-9 px-4 text-xs gap-2"
                          disabled={disableCompanyEditing}
                          onClick={() => {
                            setBulkImportFile(null);
                            setBulkImportError("");
                            setBulkImportPreview([]);
                            setIsBulkImportOpen(true);
                          }}
                        >
                          <Upload className="w-4 h-4" />
                          Bulk Upload
                        </GlassButton>
                      </div>
                    </div>
                    {remoteMemberStatsError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {remoteMemberStatsError}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Total Members</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{effectiveMemberStats.total}</p>
                      </div>
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Active Members</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{effectiveMemberStats.active}</p>
                      </div>
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Inactive Members</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{effectiveMemberStats.inactive}</p>
                      </div>
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Expired Passports</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{effectiveMemberStats.expired}</p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-sky-500" />
                        Company Entitlements
                      </h3>
                      <GlassButton
                        variant="secondary"
                        className="gap-2"
                        onClick={() =>
                          downloadText(
                            `company-${selectedCompany.companyId}-plan.txt`,
                            JSON.stringify(selectedCompany.planConfig, null, 2)
                          )
                        }
                      >
                        <Download className="w-4 h-4" />
                        Export Plan
                      </GlassButton>
                    </div>
                    <fieldset disabled={disableCompanyEditing} className="space-y-4">
                      {Object.entries(selectedCompany.planConfig.categories).map(([key, category]) => (
                        <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                          <label className="text-sm text-slate-600">{category.label}</label>
                          <input
                            type="number"
                            className="glass-input px-3 py-2"
                            value={category.limit}
                            onChange={(e) => {
                              const updated = {
                                ...selectedCompany,
                                planConfig: {
                                  ...selectedCompany.planConfig,
                                  categories: {
                                    ...selectedCompany.planConfig.categories,
                                    [key]: { ...category, limit: Number(e.target.value) },
                                  },
                                },
                              };
                              updateSelectedCompany(updated);
                            }}
                          />
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={category.enabled}
                              onChange={(e) => {
                                const updated = {
                                  ...selectedCompany,
                                  planConfig: {
                                    ...selectedCompany.planConfig,
                                    categories: {
                                      ...selectedCompany.planConfig.categories,
                                      [key]: { ...category, enabled: e.target.checked },
                                    },
                                  },
                                };
                                updateSelectedCompany(updated);
                              }}
                            />
                            Enabled
                          </label>
                          {"requireReferral" in category && (
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={category.requireReferral}
                                onChange={(e) => {
                                  const updated = {
                                    ...selectedCompany,
                                    planConfig: {
                                      ...selectedCompany.planConfig,
                                      categories: {
                                        ...selectedCompany.planConfig.categories,
                                        [key]: { ...category, requireReferral: e.target.checked },
                                      },
                                    },
                                  };
                                  updateSelectedCompany(updated);
                                }}
                              />
                              Require Referral
                            </label>
                          )}
                          {"excludeScaling" in category && (
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={category.excludeScaling}
                                onChange={(e) => {
                                  const updated = {
                                    ...selectedCompany,
                                    planConfig: {
                                      ...selectedCompany.planConfig,
                                      categories: {
                                        ...selectedCompany.planConfig.categories,
                                        [key]: { ...category, excludeScaling: e.target.checked },
                                      },
                                    },
                                  };
                                  updateSelectedCompany(updated);
                                }}
                              />
                              Exclude Scaling
                            </label>
                          )}
                        </div>
                      ))}
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={selectedCompany.planConfig.autoDisablePassport}
                          onChange={(e) =>
                            updateSelectedCompany({
                              ...selectedCompany,
                              planConfig: {
                                ...selectedCompany.planConfig,
                                autoDisablePassport: e.target.checked,
                              },
                            })
                          }
                        />
                        Auto-disable members when passport expires
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center pt-2">
                        <label className="text-sm text-slate-600">Max Children</label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="glass-input px-3 py-2"
                          value={selectedCompany.planConfig.dependents.maxChildren}
                          onChange={(e) => {
                            const parsed = Number(e.target.value);
                            const nextValue =
                              Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : selectedCompany.planConfig.dependents.maxChildren;
                            updateSelectedCompany({
                              ...selectedCompany,
                              planConfig: {
                                ...selectedCompany.planConfig,
                                dependents: {
                                  ...selectedCompany.planConfig.dependents,
                                  maxChildren: nextValue,
                                },
                              },
                            });
                          }}
                        />
                        <div className="md:col-span-2 text-xs text-slate-500">
                          Company-level cap for Child dependents per primary member.
                        </div>
                      </div>
                    </fieldset>
                  </GlassCard>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a company to view details.</p>
              )}
            </div>

            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              {companyFormError && (
                <div className={`mr-auto text-sm font-semibold self-center px-4 py-2 rounded-lg ${
                  companyFormError.includes("successfully")
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {companyFormError.includes("successfully") ? "✓ " : "⚠ "}
                  {companyFormError}
                </div>
              )}
              <GlassButton
                variant="secondary"
                onClick={() => {
                  setIsCompanyModalOpen(false);
                  setEditingCompanyId(null);
                  setCompanyModalView("details");
                  setCompanyFormError("");
                }}
              >
                Cancel
              </GlassButton>
              {companyModalView === "details" && (
                <GlassButton
                  disabled={disableCompanyEditing}
                  onClick={async () => {
                    if (disableCompanyEditing) return;
                    if (!companyForm.companyId || !companyForm.name || !companyForm.registrationNoNew) {
                      setCompanyFormError("Please complete Company ID, Company Name, and Registration No. (New).");
                      return;
                    }
                    const isEditing = Boolean(editingCompanyId);
                    // Safety: prevent duplicate creation when editing
                    if (isEditing && companyForm.companyId !== editingCompanyId) {
                      setCompanyFormError("Form ID mismatch detected. Please close and re-open the editor.");
                      return;
                    }
                    const normalizedCompany = {
                      ...companyForm,
                      hrName: normalizeName(companyForm.hrName || ""),
                      contactPhoneName: normalizeName(companyForm.contactPhoneName || ""),
                      contactPhone: normalizePhoneInput(companyForm.contactPhone),
                      contactPhoneSecondaryName: normalizeName(companyForm.contactPhoneSecondaryName || ""),
                      contactPhoneSecondary: normalizePhoneInput(companyForm.contactPhoneSecondary || ""),
                    };
                    if (!normalizedCompany.hrName) {
                      setCompanyFormError("HR name is required.");
                      return;
                    }
                    if (!normalizedCompany.contactEmail || !isValidEmail(normalizedCompany.contactEmail)) {
                      setCompanyFormError("Please enter a valid HR contact email.");
                      return;
                    }
                    if (!normalizedCompany.contactPhoneName) {
                      setCompanyFormError("Primary contact person name is required.");
                      return;
                    }
                    if (!isValidPhone(normalizedCompany.contactPhone)) {
                      setCompanyFormError("Primary contact phone format is invalid.");
                      return;
                    }
                    if (normalizedCompany.contactPhoneSecondary && !normalizedCompany.contactPhoneSecondaryName) {
                      setCompanyFormError("Second contact person name is required when second contact number is filled.");
                      return;
                    }
                    if (normalizedCompany.contactPhoneSecondary && !isValidPhone(normalizedCompany.contactPhoneSecondary)) {
                      setCompanyFormError("Second contact phone format is invalid.");
                      return;
                    }
                    if (normalizedCompany.contactPhoneSecondaryName && !normalizedCompany.contactPhoneSecondary) {
                      setCompanyFormError("Second contact number is required when second contact person name is filled.");
                      return;
                    }
                    setCompanyFormError("");
                    try {
                      await upsertCompanyToSupabase(normalizedCompany);
                      await loadCompanies();
                      setSelectedCompanyId(normalizedCompany.companyId);
                      await logAdminAction(
                        `${isEditing ? "Updated" : "Created"} company ${normalizedCompany.companyId}`,
                        "companies",
                        normalizedCompany.companyId
                      );
                      // Show success feedback — stays visible longer for user confirmation
                      setCompanyFormError(`${isEditing ? "Updated" : "Created"} successfully ✓`);
                      setTimeout(() => {
                        setCompanyForm(createEmptyCompanyForm());
                        setEditingCompanyId(null);
                        setCompanyModalView("details");
                        setCompanyFormError("");
                        setIsCompanyModalOpen(false);
                      }, 3000);
                      return;
                    } catch (error) {
                      setCompanyFormError(normalizeSupabaseErrorMessage(error, "Failed to save company."));
                      return;
                    }
                  }}
                >
                  {isCompanyAccessPending ? "Checking Access..." : editingCompanyId ? "Update Company" : "Save Company"}
                </GlassButton>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {isMemberModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsMemberModalOpen(false)} />
          <GlassCard className="w-full max-w-4xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <User className="w-6 h-6 text-sky-600" />
                  Add Company Member
                </h2>
                <p className="text-sm text-slate-500 mt-1">Corporate member onboarding follows the same user-creation flow with profile + credentials.</p>
              </div>
              <button 
                onClick={() => setIsMemberModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar">
              <fieldset disabled={disableCompanyEditing} className="space-y-8">
                <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  Identity & Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="Full Name as per ID"
                        value={memberForm.fullName}
                        onChange={(e) => setMemberForm({ ...memberForm, fullName: e.target.value })}
                        onBlur={() => setMemberForm((prev) => ({ ...prev, fullName: normalizeName(prev.fullName) }))}
                        required
                      />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Nationality</label>
                    <div className="relative">
                      <select className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent" value={memberForm.nationality} onChange={(e) => setMemberForm({ ...memberForm, nationality: e.target.value, idType: e.target.value === "Malaysia" ? "NRIC" : "Passport" })}>
                        {NATIONALITIES.map((nationality) => (
                          <option key={nationality} value={nationality}>
                            {nationality}
                          </option>
                        ))}
                      </select>
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">ID Type <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                        value={memberForm.idType}
                        onChange={(e) => setMemberForm({ ...memberForm, idType: e.target.value as "NRIC" | "Passport", nricPassport: "", passportExpiry: "", passportFileName: "" })}
                      >
                        <option value="NRIC">NRIC</option>
                        <option value="Passport">Passport</option>
                      </select>
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">{memberForm.idType === "NRIC" ? "NRIC No." : "Passport No."} <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type="text" className="w-full glass-input pl-10 pr-4 py-2.5" placeholder="Key in number" value={memberForm.nricPassport} onChange={(e) => setMemberForm({ ...memberForm, nricPassport: e.target.value })} required />
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Date of Birth</label>
                    <div className="relative">
                      <input
                        type="date"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        value={memberForm.idType === "NRIC" ? inferDobFromNric(memberForm.nricPassport) || memberForm.dob : memberForm.dob}
                        onChange={(e) => setMemberForm({ ...memberForm, dob: e.target.value })}
                        disabled={memberForm.idType === "NRIC"}
                      />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                    <p className="text-[10px] text-slate-400 pl-1">
                      {memberForm.idType === "NRIC" ? "Auto-derived from NRIC." : "Manual entry for passport holders."}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Gender</label>
                    <div className="relative">
                      <select
                        className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                        value={memberForm.gender}
                        onChange={(e) => {
                          const nextGender = e.target.value as "Male" | "Female";
                          setMemberForm((prev) => ({
                            ...prev,
                            gender: nextGender,
                            dependents: prev.dependents.map((dep) =>
                              dep.relationship === "Spouse"
                                ? { ...dep, gender: getOppositeBinaryGender(nextGender) }
                                : dep
                            ),
                          }));
                        }}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  {memberForm.idType === "Passport" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Passport Expiry Date <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type="date" className="w-full glass-input pl-10 pr-4 py-2.5" value={memberForm.passportExpiry} onChange={(e) => setMemberForm({ ...memberForm, passportExpiry: e.target.value })} required />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  )}
                  {memberForm.idType === "Passport" && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Passport Upload <span className="text-red-500">*</span></label>
                    <input
                      type="file"
                      className="w-full glass-input px-4 py-2.5 bg-white text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-100 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-slate-600 hover:file:bg-slate-200/80"
                      onChange={(e) => setMemberForm({ ...memberForm, passportFileName: e.target.files?.[0]?.name || "" })}
                    />
                    <p className="text-[10px] text-slate-400 pl-1">Required when ID Type is Passport.</p>
                  </div>
                  )}
                </div>
                </section>

                <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Email <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type="email" className="w-full glass-input pl-10 pr-4 py-2.5" placeholder="member@email.com" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })} required />
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                    <p className="text-[10px] text-slate-400 pl-1">Required for password reset & notifications</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Contact Number</label>
                    <div className="flex gap-3">
                      <div className="relative w-28">
                        <select
                          className="w-full glass-input px-3 py-2.5 bg-transparent"
                          value={memberForm.phoneCountryCode}
                          onChange={(e) => setMemberForm({ ...memberForm, phoneCountryCode: e.target.value })}
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
                        value={memberForm.phone}
                        onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                </section>

                <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  Employment Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Company Name</label>
                    <div className="relative">
                      <input type="text" className="w-full glass-input pl-10 pr-4 py-2.5" value={selectedCompany.name} disabled />
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Company ID</label>
                    <div className="relative">
                      <input type="text" className="w-full glass-input pl-10 pr-4 py-2.5" value={selectedCompany.companyId} disabled />
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Staff ID <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type="text" className="w-full glass-input pl-10 pr-4 py-2.5" placeholder="e.g. STF-8823" value={memberForm.staffId} onChange={(e) => setMemberForm({ ...memberForm, staffId: e.target.value })} required />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Temporary Password</label>
                    <div className="relative">
                      <input type="text" className="w-full glass-input pl-10 pr-4 py-2.5" placeholder="Temp1234" value={memberForm.tempPassword} onChange={(e) => setMemberForm({ ...memberForm, tempPassword: e.target.value })} />
                      <Download className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                    <p className="pl-1 text-[10px] text-slate-400">
                      Member signs in with Company ID + Staff ID and must change this password on first login.
                    </p>
                  </div>
                </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                    Plan Configuration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        memberForm.planType === "lump_sum"
                          ? "border-sky-300 bg-sky-50 ring-2 ring-sky-200"
                          : "border-slate-200 bg-white/70 hover:border-slate-300"
                      }`}
                      onClick={() => setMemberForm((prev) => ({ ...prev, planType: "lump_sum" }))}
                    >
                      <p className="text-sm font-semibold text-slate-800">Lump Sum Limit</p>
                      <p className="mt-1 text-xs text-slate-500">Use one shared annual balance for all eligible claims.</p>
                    </button>
                    <button
                      type="button"
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        memberForm.planType === "category"
                          ? "border-sky-300 bg-sky-50 ring-2 ring-sky-200"
                          : "border-slate-200 bg-white/70 hover:border-slate-300"
                      }`}
                      onClick={() => setMemberForm((prev) => ({ ...prev, planType: "category" }))}
                    >
                      <p className="text-sm font-semibold text-slate-800">Categorized Limits</p>
                      <p className="mt-1 text-xs text-slate-500">Enable specific benefit categories and set member-level limits per category.</p>
                    </button>
                  </div>

                  {memberForm.planType === "lump_sum" ? (
                    <div className="rounded-2xl border border-slate-200 p-4 bg-white/70 space-y-4">
                      <div className="space-y-1.5 md:flex md:items-center md:gap-6 md:space-y-0">
                        <label className="text-sm font-medium text-slate-700 md:w-56 md:shrink-0">Member Lump Sum Limit</label>
                        <input
                          type="number"
                          min={0}
                          className="w-full md:w-64 glass-input px-4 py-2.5"
                          value={memberForm.lumpSumLimit}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setMemberForm((prev) => ({
                              ...prev,
                              lumpSumLimit: raw === "" ? "" : Number(raw),
                            }));
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        Company default: RM {selectedCompany.planConfig.lumpSumLimit.toLocaleString("en-MY")}
                      </p>

                      <div className="border-t border-slate-200 pt-3">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Covered Categories</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {Object.entries(selectedCompany.planConfig.categories).map(([key, category]) => {
                            const selected = memberForm.planSelection?.[key] ?? false;
                            return (
                              <div
                                key={key}
                                className={`rounded-xl border p-3 transition-all ${
                                  category.enabled ? "border-slate-200 bg-white/60" : "border-slate-100 bg-slate-50/60 opacity-60"
                                }`}
                              >
                                <label className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={!category.enabled}
                                    onChange={() =>
                                      setMemberForm((prev) => ({
                                        ...prev,
                                        planSelection: {
                                          ...prev.planSelection,
                                          [key]: !selected,
                                        },
                                      }))
                                    }
                                    className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-slate-700">{category.label}</div>
                                    <div className="text-xs text-slate-500">
                                      {category.enabled ? "Covered under lump sum" : "Not enabled in company plan"}
                                    </div>
                                  </div>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(selectedCompany.planConfig.categories).map(([key, category]) => {
                        const selected = memberForm.planSelection?.[key] ?? false;
                        return (
                          <div
                            key={key}
                            className={`rounded-xl border p-4 transition-all ${
                              category.enabled ? "border-slate-200 bg-white/60" : "border-slate-100 bg-slate-50/60 opacity-60"
                            }`}
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!category.enabled}
                                onChange={() =>
                                  setMemberForm((prev) => ({
                                    ...prev,
                                    planSelection: {
                                      ...prev.planSelection,
                                      [key]: !selected,
                                    },
                                  }))
                                }
                                className="mt-1 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              />
                              <div className="space-y-1">
                                <div className="text-sm font-semibold text-slate-700">{category.label}</div>
                                <div className="text-xs text-slate-500">
                                  Company Default Limit RM {category.limit.toLocaleString("en-MY")}
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                  <span className="text-[11px] text-slate-500">Member Limit</span>
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-32 glass-input px-2 py-1.5 text-xs"
                                    value={memberForm.planLimits?.[key] ?? category.limit}
                                    disabled={!selected || !category.enabled}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setMemberForm((prev) => ({
                                        ...prev,
                                        planLimits: {
                                          ...prev.planLimits,
                                          [key]: raw === "" ? "" : Number(raw),
                                        },
                                      }));
                                    }}
                                  />
                                </div>
                                {!category.enabled && <div className="text-[10px] text-slate-400">Not enabled in company plan</div>}
                              </div>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1 h-4 bg-amber-500 rounded-full"/>
                    Coverage Rules
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Foreign Worker Policy</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Company-level rule used when onboarding passport holders.
                        </p>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          checked={memberForm.autoDisablePassport}
                          onChange={(e) =>
                            setMemberForm((prev) => ({
                              ...prev,
                              autoDisablePassport: e.target.checked,
                            }))
                          }
                        />
                        <span className="text-sm text-slate-700">Auto-disable on passport expiry</span>
                      </label>
                    </div>
                    <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Dependent Coverage</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Choose how dependent claims should consume the configured family limit.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="member-dependent-limit"
                            checked={memberForm.dependentSharedLimit}
                            onChange={() => setMemberForm((prev) => ({ ...prev, dependentSharedLimit: true }))}
                            className="border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                          Share primary member limit
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name="member-dependent-limit"
                            checked={!memberForm.dependentSharedLimit}
                            onChange={() => setMemberForm((prev) => ({ ...prev, dependentSharedLimit: false }))}
                            className="border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                          Separate allocated amount
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                      Add Dependent
                    </h3>
                    <GlassButton
                      className="h-9 px-4 text-sm bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
                      onClick={(e) => {
                        e.preventDefault();
                        setMemberForm((prev) => ({
                          ...prev,
                          dependents: [
                            ...prev.dependents,
                            createEmptyDependentDraft(),
                          ],
                        }));
                      }}
                    >
                      + Add Dependent
                    </GlassButton>
                  </div>
                  {!memberForm.dependentSharedLimit && memberForm.planType === "lump_sum" && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Employee Remaining Limit</p>
                      <p className="mt-1 text-sm font-semibold text-purple-700">
                        RM {(getNumericLimit(memberForm.lumpSumLimit) - getDependentAllocatedLumpSum(memberForm.dependents)).toLocaleString("en-MY")}
                      </p>
                    </div>
                  )}
                  {!memberForm.dependentSharedLimit && memberForm.planType === "category" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(selectedCompany.planConfig.categories)
                        .filter(([key]) => memberForm.planSelection?.[key])
                        .map(([key, category]) => (
                          <div key={key} className="rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">{category.label}</p>
                            <p className="mt-1 text-sm font-semibold text-purple-700">
                              RM {Math.max(getNumericLimit(memberForm.planLimits?.[key]) - getDependentAllocatedCategoryLimit(memberForm.dependents, key), 0).toLocaleString("en-MY")}
                            </p>
                          </div>
                        ))}
                    </div>
                  )}
                  {memberForm.dependents.length === 0 && (
                    <p className="text-xs text-slate-500">No dependents added.</p>
                  )}
                  <div className="space-y-3">
                    {memberForm.dependents.map((dependent, index) => (
                      <div key={`dep-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Dependent Full Name <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <input
                                type="text"
                                className="w-full glass-input pl-10 pr-4 py-2.5"
                                placeholder="Full Name as per ID"
                                value={dependent.fullName}
                                onChange={(e) =>
                                  setMemberForm((prev) => ({
                                    ...prev,
                                    dependents: prev.dependents.map((item, i) =>
                                      i === index ? { ...item, fullName: e.target.value } : item
                                    ),
                                  }))
                                }
                                onBlur={() =>
                                  setMemberForm((prev) => ({
                                    ...prev,
                                    dependents: prev.dependents.map((item, i) =>
                                      i === index ? { ...item, fullName: normalizeName(item.fullName) } : item
                                    ),
                                  }))
                                }
                              />
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Dependent Relationship <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <select
                                className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                                value={dependent.relationship}
                                onChange={(e) =>
                                  setMemberForm((prev) => ({
                                    ...prev,
                                    dependents: prev.dependents.map((item, i) => {
                                      if (i !== index) return item;
                                      const nextRelationship = e.target.value as "Spouse" | "Child" | "Parent";
                                      return {
                                        ...item,
                                        relationship: nextRelationship,
                                        gender: nextRelationship === "Spouse" ? getOppositeBinaryGender(prev.gender) : item.gender,
                                      };
                                    }),
                                  }))
                                }
                              >
                                <option value="Spouse">Spouse</option>
                                <option value="Child">Child</option>
                                <option value="Parent">Parent</option>
                              </select>
                              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Dependent Gender <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <select
                                className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                                value={dependent.relationship === "Spouse" ? getOppositeBinaryGender(memberForm.gender) : dependent.gender}
                                disabled={dependent.relationship === "Spouse"}
                                onChange={(e) =>
                                  setMemberForm((prev) => ({
                                    ...prev,
                                    dependents: prev.dependents.map((item, i) =>
                                      i === index ? { ...item, gender: e.target.value as "Male" | "Female" } : item
                                    ),
                                  }))
                                }
                              >
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                              </select>
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">{memberForm.idType === "Passport" ? "Dependent Passport No." : "Dependent NRIC / Passport No."} <span className="text-red-500">*</span></label>
                            <div className="relative">
                              <input
                                type="text"
                                className="w-full glass-input pl-10 pr-4 py-2.5"
                                placeholder="Identity number"
                                value={dependent.nricPassport}
                                onChange={(e) =>
                                  setMemberForm((prev) => ({
                                    ...prev,
                                    dependents: prev.dependents.map((item, i) =>
                                      i === index ? { ...item, nricPassport: e.target.value } : item
                                    ),
                                  }))
                                }
                              />
                              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                            </div>
                          </div>
                          {memberForm.idType === "Passport" && (
                            <div className="space-y-1.5">
                              <label className="text-sm font-medium text-slate-700">Dependent Passport Expiry Date <span className="text-red-500">*</span></label>
                              <div className="relative">
                                <input
                                  type="date"
                                  className="w-full glass-input pl-10 pr-4 py-2.5"
                                  value={dependent.passportExpiry}
                                  onChange={(e) =>
                                    setMemberForm((prev) => ({
                                      ...prev,
                                      dependents: prev.dependents.map((item, i) =>
                                        i === index ? { ...item, passportExpiry: e.target.value } : item
                                      ),
                                    }))
                                  }
                                />
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                              </div>
                            </div>
                          )}
                        </div>
                        {!memberForm.dependentSharedLimit && (
                          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 space-y-3">
                            <p className="text-sm font-semibold text-slate-800">Dependent Allocation</p>
                            {memberForm.planType === "lump_sum" ? (
                              <div className="space-y-4">
                                <div className="space-y-1.5 md:flex md:items-center md:gap-6 md:space-y-0">
                                  <label className="text-sm font-medium text-slate-700 md:w-56 md:shrink-0">Allocated Lump Sum Amount</label>
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-full md:w-56 glass-input px-4 py-2.5"
                                    value={dependent.lumpSumLimit}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setMemberForm((prev) => ({
                                        ...prev,
                                        dependents: prev.dependents.map((item, i) =>
                                          i === index ? { ...item, lumpSumLimit: raw === "" ? "" : Number(raw) } : item
                                        ),
                                      }));
                                    }}
                                  />
                                </div>
                                <div className="border-t border-purple-200 pt-3">
                                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider mb-2">Covered Categories</p>
                                  <div className="grid grid-cols-1 gap-2">
                                    {Object.entries(selectedCompany.planConfig.categories).map(([key, category]) => {
                                      const selected = memberForm.planSelection?.[key] ?? false;
                                      return (
                                        <label key={key} className={`flex items-center gap-2 text-xs ${category.enabled ? "text-slate-600" : "text-slate-400"}`}>
                                          <span className={selected ? "text-emerald-600" : "text-slate-300"}>{selected ? "✓" : "—"}</span>
                                          {category.label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(selectedCompany.planConfig.categories)
                                  .filter(([key]) => memberForm.planSelection?.[key])
                                  .map(([key, category]) => (
                                    <div key={key} className="rounded-xl border border-white/70 bg-white/70 p-3 space-y-1.5">
                                      <p className="text-xs font-semibold text-slate-700">{category.label}</p>
                                      <input
                                        type="number"
                                        min={0}
                                        className="w-full glass-input px-3 py-2 text-sm"
                                        value={dependent.planLimits?.[key] ?? ""}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          setMemberForm((prev) => ({
                                            ...prev,
                                            dependents: prev.dependents.map((item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    planLimits: {
                                                      ...item.planLimits,
                                                      [key]: raw === "" ? "" : Number(raw),
                                                    },
                                                  }
                                                : item
                                            ),
                                          }));
                                        }}
                                      />
                                      <p className="text-[11px] text-slate-500">
                                        Family total: RM {getNumericLimit(memberForm.planLimits?.[key]).toLocaleString("en-MY")}
                                      </p>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex justify-end">
                          <GlassButton
                            variant="ghost"
                            className="h-8 px-3 text-xs text-rose-600 hover:text-rose-700"
                            onClick={(e) => {
                              e.preventDefault();
                              setMemberForm((prev) => ({
                                ...prev,
                                dependents: prev.dependents.filter((_, i) => i !== index),
                              }));
                            }}
                          >
                            Remove
                          </GlassButton>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500">If member ID Type is Passport, all dependents require passport number and passport expiry date.</p>
                </section>
              </fieldset>
            </div>
            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              {memberFormError && <p className="mr-auto text-xs text-red-500 font-medium self-center">{memberFormError}</p>}
              <GlassButton variant="secondary" onClick={() => setIsMemberModalOpen(false)}>Cancel</GlassButton>
              <GlassButton
                disabled={disableCompanyEditing}
                onClick={async () => {
                  if (disableCompanyEditing) return;
                  if (!memberForm.staffId || !memberForm.fullName || !memberForm.email) {
                    setMemberFormError("Please complete Staff ID, Full Name, and Email.");
                    return;
                  }
                  if (memberForm.planType === "lump_sum" && (typeof memberForm.lumpSumLimit !== "number" || memberForm.lumpSumLimit <= 0)) {
                    setMemberFormError("Please enter a valid lump sum limit.");
                    return;
                  }
                  if (!memberForm.nricPassport) {
                    setMemberFormError(`Please fill ${memberForm.idType === "NRIC" ? "NRIC No." : "Passport No."}.`);
                    return;
                  }
                  if (memberForm.idType === "Passport") {
                    const mainPassportValidation = validateDependentPassport({
                      nationality: memberForm.nationality,
                      passportNumber: memberForm.nricPassport,
                      passportExpiryDate: memberForm.passportExpiry,
                      passportFileName: memberForm.passportFileName,
                    });
                    if (!mainPassportValidation.valid) {
                      setMemberFormError(Object.values(mainPassportValidation.errors)[0] || "Passport details are required.");
                      return;
                    }
                  }
                  for (const dependent of memberForm.dependents) {
                    if (!dependent.fullName || !dependent.relationship || !dependent.gender || !dependent.nricPassport) {
                      setMemberFormError("Please complete all dependent details.");
                      return;
                    }
                    if (dependent.relationship === "Spouse" && dependent.gender === memberForm.gender) {
                      setMemberFormError("Spouse gender must be opposite to the member gender.");
                      return;
                    }
                    if (memberForm.idType === "Passport" && !dependent.passportExpiry) {
                      setMemberFormError("Dependent passport expiry date is required for foreigner member registration.");
                      return;
                    }
                  }
                  const draftedDependents: Array<{ relationship?: string; gender?: string }> = [];
                  for (const dependent of memberForm.dependents) {
                    const relationshipError = validateFamilyRelationshipCaps({
                      relationship: dependent.relationship,
                      gender: dependent.gender,
                      existingDependents: draftedDependents,
                      maxChildren: selectedCompany.planConfig.dependents.maxChildren,
                    });
                    if (relationshipError) {
                      setMemberFormError(relationshipError);
                      return;
                    }
                    draftedDependents.push({
                      relationship: dependent.relationship,
                      gender: dependent.gender,
                    });
                  }
                  const familyPlanLimits = Object.entries(memberForm.planLimits || {}).reduce<Record<string, number>>((acc, [key, value]) => {
                    if (memberForm.planType === "category" && memberForm.planSelection?.[key]) {
                      acc[key] = getNumericLimit(value);
                    }
                    return acc;
                  }, {});
                  const familyLumpSumLimit = memberForm.planType === "lump_sum" ? getNumericLimit(memberForm.lumpSumLimit) : undefined;
                  if (!memberForm.dependentSharedLimit) {
                    if (
                      memberForm.planType === "lump_sum" &&
                      typeof familyLumpSumLimit === "number" &&
                      getDependentAllocatedLumpSum(memberForm.dependents) > familyLumpSumLimit
                    ) {
                      setMemberFormError("Dependent allocated amount cannot exceed the member lump sum limit.");
                      return;
                    }
                    if (memberForm.planType === "category") {
                      for (const [key, limit] of Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>) {
                        if (getDependentAllocatedCategoryLimit(memberForm.dependents, key) > limit) {
                          const categoryLabel = selectedCompany.planConfig.categories[key]?.label || key;
                          setMemberFormError(`${categoryLabel} dependent allocation cannot exceed the member limit.`);
                          return;
                        }
                      }
                    }
                  }

                  const normalizedFullName = normalizeName(memberForm.fullName);
                  const primaryDob = memberForm.idType === "NRIC"
                    ? inferDobFromNric(memberForm.nricPassport) || memberForm.dob || undefined
                    : memberForm.dob || undefined;
                  const primaryPlanLimits = (Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>).reduce<Record<string, number>>((acc, [key, value]) => {
                    acc[key] = memberForm.dependentSharedLimit
                      ? value
                      : Math.max(value - getDependentAllocatedCategoryLimit(memberForm.dependents, key), 0);
                    return acc;
                  }, {});
                  const primaryLumpSumLimit =
                    memberForm.planType === "lump_sum" && typeof familyLumpSumLimit === "number"
                      ? memberForm.dependentSharedLimit
                        ? familyLumpSumLimit
                        : Math.max(familyLumpSumLimit - getDependentAllocatedLumpSum(memberForm.dependents), 0)
                      : undefined;

                  const updatedCompany: Company = {
                    ...selectedCompany,
                    planConfig: {
                      ...selectedCompany.planConfig,
                      autoDisablePassport: memberForm.autoDisablePassport,
                      dependents: {
                        ...selectedCompany.planConfig.dependents,
                        sharedLimit: memberForm.dependentSharedLimit,
                      },
                    },
                  };
                  updateSelectedCompany(updatedCompany);

                  const tempPassword = memberForm.tempPassword || "Temp1234";
                  const categoryEnabled = Object.keys(memberForm.planSelection || {}).reduce<Record<string, string>>(
                    (acc, key) => {
                      acc[key] = memberForm.planSelection?.[key] ? "true" : "false";
                      return acc;
                    },
                    {}
                  );
                  const categoryLimits = (Object.entries(primaryPlanLimits) as Array<[string, number]>).reduce<Record<string, string>>(
                    (acc, [key, value]) => {
                      acc[key] = String(value);
                      return acc;
                    },
                    {}
                  );

                  const rows: BulkImportMemberRow[] = [
                    {
                      rowNumber: 1,
                      type: "primary" as const,
                      staffId: memberForm.staffId,
                      fullName: normalizedFullName,
                      gender: memberForm.gender || "",
                      idType: memberForm.idType,
                      nricPassport: memberForm.nricPassport || "",
                      nationality: memberForm.nationality || "",
                      status: memberForm.status,
                      phoneCountryCode: memberForm.phoneCountryCode || "",
                      phone: memberForm.phone || "",
                      dob: primaryDob || "",
                      passportExpiry: memberForm.passportExpiry || "",
                      passportFileName: memberForm.passportFileName || "",
                      email: memberForm.email || "",
                      tempPassword,
                      planType: memberForm.planType,
                      lumpSumLimit: String(primaryLumpSumLimit || familyLumpSumLimit || ""),
                      categoryEnabled,
                      categoryLimits,
                    },
                    ...memberForm.dependents.map((dependent, index) => {
                      const dependentPlanLimits = (Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>).reduce<
                        Record<string, string>
                      >((acc, [key]) => {
                        const value = memberForm.dependentSharedLimit
                          ? familyPlanLimits[key]
                          : getNumericLimit(dependent.planLimits?.[key]);
                        acc[key] = String(value);
                        return acc;
                      }, {});

                      return {
                        rowNumber: index + 2,
                        type: "dependent" as const,
                        staffId: `${memberForm.staffId}-DEP-${index + 1}`,
                        parentStaffId: memberForm.staffId,
                        relationship: dependent.relationship,
                        fullName: normalizeName(dependent.fullName),
                        gender: dependent.gender || "",
                        idType: memberForm.idType,
                        nricPassport: dependent.nricPassport || "",
                        nationality: memberForm.nationality || "",
                        status: "Active",
                        phoneCountryCode: "",
                        phone: "",
                        dob: "",
                        passportExpiry: dependent.passportExpiry || "",
                        passportFileName: "",
                        planType: memberForm.planType,
                        lumpSumLimit: "",
                        categoryEnabled,
                        categoryLimits: dependentPlanLimits,
                      };
                    }),
                  ];

                  try {
                    await upsertCompanyToSupabase(updatedCompany);
                    const res = await fetch(withBasePath("/api/admin/members/bulk-import"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ companyId: selectedCompany.companyId, mode: "upsert", rows }),
                    });
                    const payload = (await res.json()) as { error?: string };
                    if (!res.ok) throw new Error(payload.error || "Failed to create member.");
                    await refreshRemoteMemberStats(selectedCompany.companyId);
                    await loadMembersForCompany(selectedCompany.companyId);
                    await loadCompanies();
                    await logAdminAction(
                      `Created member ${memberForm.staffId} in ${selectedCompany.companyId}`,
                      "members",
                      memberForm.staffId
                    );
                    setMemberForm(createEmptyMemberForm(selectedCompany));
                    setMemberFormError("");
                    setIsMemberModalOpen(false);
                  } catch (error) {
                    setMemberFormError(normalizeSupabaseErrorMessage(error, "Failed to create member."));
                  }
                }}
              >
                {isCompanyAccessPending ? "Checking Access..." : "Save Member"}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {isBulkImportOpen && selectedCompany && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeBulkImport} />
          <GlassCard className="w-full max-w-3xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Upload className="w-6 h-6 text-sky-600" />
                  Bulk Upload Members (Excel)
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Upload an Excel file to upsert members for {selectedCompany.name}.
                </p>
              </div>
              <button
                onClick={closeBulkImport}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  Use the template to ensure headers match the current plan configuration.
                </div>
                <GlassButton variant="secondary" className="gap-2" onClick={handleDownloadMemberTemplate}>
                  <Download className="w-4 h-4" />
                  Download Template
                </GlassButton>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Excel File</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="w-full glass-input px-4 py-2.5 bg-white text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-100 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-slate-600 hover:file:bg-slate-200/80"
                  disabled={disableCompanyEditing}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    handleBulkImportFile(file);
                  }}
                />
                {bulkImportFile && (
                  <p className="text-[11px] text-slate-500 pl-1">
                    Selected: {bulkImportFile.name}
                  </p>
                )}
              </div>

              {bulkImportPreview.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass-card rounded-2xl p-5">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Valid Rows</p>
                    <p className="text-3xl font-bold text-emerald-700 mt-2">{bulkImportStats.ok}</p>
                  </div>
                  <div className="glass-card rounded-2xl p-5">
                    <p className="text-xs uppercase tracking-widest text-slate-400">Rows With Errors</p>
                    <p className="text-3xl font-bold text-rose-700 mt-2">{bulkImportStats.error}</p>
                  </div>
                </div>
              )}

              {bulkImportPreview.some((row) => row.status === "error") && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 space-y-3">
                  <p className="text-sm font-semibold text-rose-700">Fix these errors</p>
                  <div className="space-y-2">
                    {bulkImportPreview
                      .filter((row): row is Extract<ImportRowResult, { status: "error" }> => row.status === "error")
                      .slice(0, 10)
                      .map((row) => (
                        <div key={`err-${row.rowNumber}`} className="text-xs text-rose-700">
                          Row {row.rowNumber}: {row.errors[0]}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {bulkImportPreview.some((row) => row.status === "ok") && (
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Preview</p>
                    <p className="text-xs text-slate-500">Showing up to 8 rows</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50/80">
                        <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                          <th className="px-4 py-2">Row</th>
                          <th className="px-4 py-2">Type</th>
                          <th className="px-4 py-2">Staff ID</th>
                          <th className="px-4 py-2">Name</th>
                          <th className="px-4 py-2">Ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkImportPreview
                          .filter((row): row is Extract<ImportRowResult, { status: "ok" }> => row.status === "ok")
                          .slice(0, 8)
                          .map((row) => (
                            <tr key={`ok-${row.rowNumber}`} className="border-t border-slate-100">
                              <td className="px-4 py-2 text-slate-500">{row.rowNumber}</td>
                              <td className="px-4 py-2 text-slate-500">{row.row.type}</td>
                              <td className="px-4 py-2 font-semibold text-slate-800">{row.row.staffId}</td>
                              <td className="px-4 py-2 text-slate-600">{row.row.fullName}</td>
                              <td className="px-4 py-2 text-slate-500">
                                {row.row.type === "primary" ? row.row.email : row.row.parentStaffId}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              {bulkImportError && (
                <p className="mr-auto text-xs text-red-500 font-medium self-center">{bulkImportError}</p>
              )}
              <GlassButton variant="secondary" onClick={closeBulkImport} disabled={bulkImportIsSubmitting}>
                Cancel
              </GlassButton>
              <GlassButton
                onClick={confirmBulkImport}
                disabled={
                  disableCompanyEditing ||
                  bulkImportIsSubmitting ||
                  !bulkImportFile ||
                  bulkImportPreview.length === 0 ||
                  bulkImportStats.ok === 0 ||
                  bulkImportStats.error > 0
                }
              >
                {isCompanyAccessPending
                  ? "Checking Access..."
                  : bulkImportIsSubmitting
                    ? "Importing..."
                    : `Import ${bulkImportStats.ok} Rows`}
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
