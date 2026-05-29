import { withBasePath } from "@/lib/basePath";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type Company = {
  companyId: string;
  name: string;
  hrName: string;
  registrationNoNew: string;
  registrationNoOld?: string;
  tinNumber?: string;
  sstNumber?: string;
  ssmFileName?: string;
  ssmExpiryDate?: string;
  industry: string;
  contactEmail: string;
  contactPhoneName?: string;
  contactPhone: string;
  contactPhoneSecondaryName?: string;
  contactPhoneSecondary?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  status: "Active" | "Disabled";
  planConfig: CompanyPlanConfig;
};

export type CompanyPlanType = "lump_sum" | "category";

export type CompanyPlanCategoryKey = "op" | "ip" | "ahs" | "dental" | "sp" | "tmc" | "glasses" | "others";

export type CompanyPlanConfig = {
  type: CompanyPlanType;
  lumpSumLimit: number;
  categories: {
    op: { label: string; limit: number; enabled: boolean };
    ip: { label: string; limit: number; enabled: boolean };
    ahs: { label: string; limit: number; enabled: boolean };
    dental: { label: string; limit: number; enabled: boolean; excludeScaling: boolean; coverExtraction: boolean };
    sp: { label: string; limit: number; enabled: boolean; requireReferral: boolean };
    tmc: { label: string; limit: number; enabled: boolean };
    glasses: { label: string; limit: number; enabled: boolean };
    others: { label: string; limit: number; enabled: boolean };
  };
  autoDisablePassport: boolean;
  dependents: {
    sharedLimit: boolean;
    maxChildren: number;
  };
};

export const createDefaultPlanConfig = (): CompanyPlanConfig => ({
  type: "category",
  lumpSumLimit: 50000,
  categories: {
    op: { label: "Outpatient (OP)", limit: 2000, enabled: true },
    ip: { label: "Rehabilitation", limit: 20000, enabled: true },
    ahs: { label: "Annual Health Screening (AHS)", limit: 1000, enabled: true },
    dental: { label: "Dental", limit: 500, enabled: true, excludeScaling: true, coverExtraction: true },
    sp: { label: "Specialist (SP)", limit: 3000, enabled: true, requireReferral: true },
    tmc: { label: "TCM / Alternate Medicine", limit: 500, enabled: false },
    glasses: { label: "Optical / Glasses", limit: 300, enabled: false },
    others: { label: "Others", limit: 1000, enabled: false },
  },
  autoDisablePassport: true,
  dependents: {
    sharedLimit: true,
    maxChildren: 10,
  },
});

export const normalizeCompanyPlanConfig = (planConfig?: Partial<CompanyPlanConfig> | null): CompanyPlanConfig => {
  const defaults = createDefaultPlanConfig();
  const incoming = planConfig || {};

  return {
    type: incoming.type === "lump_sum" ? "lump_sum" : "category",
    lumpSumLimit:
      typeof incoming.lumpSumLimit === "number" && Number.isFinite(incoming.lumpSumLimit)
        ? incoming.lumpSumLimit
        : defaults.lumpSumLimit,
    categories: {
      op: { ...defaults.categories.op, ...incoming.categories?.op },
      ip: { ...defaults.categories.ip, ...incoming.categories?.ip },
      ahs: { ...defaults.categories.ahs, ...incoming.categories?.ahs },
      dental: { ...defaults.categories.dental, ...incoming.categories?.dental },
      sp: { ...defaults.categories.sp, ...incoming.categories?.sp },
      tmc: { ...defaults.categories.tmc, ...incoming.categories?.tmc },
      glasses: { ...defaults.categories.glasses, ...incoming.categories?.glasses },
      others: { ...defaults.categories.others, ...incoming.categories?.others },
    },
    autoDisablePassport:
      typeof incoming.autoDisablePassport === "boolean"
        ? incoming.autoDisablePassport
        : defaults.autoDisablePassport,
    dependents: {
      sharedLimit:
        typeof incoming.dependents?.sharedLimit === "boolean"
          ? incoming.dependents.sharedLimit
          : defaults.dependents.sharedLimit,
      maxChildren:
        typeof incoming.dependents?.maxChildren === "number" && Number.isFinite(incoming.dependents.maxChildren)
          ? Math.max(0, Math.floor(incoming.dependents.maxChildren))
          : defaults.dependents.maxChildren,
    },
  };
};

type CompanyDbRow = {
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

let companiesSnapshot: Company[] = [];
let companiesInitialized = false;
const companiesListeners = new Set<() => void>();
const COMPANIES_SERVER_SNAPSHOT: Company[] = [];

const notifyCompaniesListeners = () => {
  companiesListeners.forEach((listener) => listener());
};

const mapCompanyDbRow = (row: CompanyDbRow): Company => ({
  companyId: String(row.company_id || ""),
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
});

export const subscribeCompanies = (listener: () => void) => {
  companiesListeners.add(listener);
  return () => companiesListeners.delete(listener);
};

export const getCompaniesSnapshot = () => companiesSnapshot;

export const getCompaniesServerSnapshot = () => COMPANIES_SERVER_SNAPSHOT;

export const refreshCompaniesSnapshot = async () => {
  if (typeof window === "undefined") return;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("companies")
      .select(
        "company_id, name, hr_name, status, registration_no, registration_no_old, tin_number, sst_number, ssm_file_name, ssm_expiry_date, industry, contact_email, contact_phone_name, contact_phone, contact_phone_secondary_name, contact_phone_secondary, address_line1, address_line2, city, state, postal_code, plan_config"
      )
      .order("company_id");
    if (error) throw error;
    companiesSnapshot = ((data as CompanyDbRow[] | null) || []).map(mapCompanyDbRow);
  } catch {
    companiesSnapshot = [];
  } finally {
    notifyCompaniesListeners();
  }
};

export const ensureCompaniesStore = () => {
  if (typeof window === "undefined") return;
  if (companiesInitialized) return;
  companiesInitialized = true;
  void refreshCompaniesSnapshot();
};

export const resetCompaniesStore = () => {
  companiesSnapshot = [];
  companiesInitialized = false;
  notifyCompaniesListeners();
};

export const upsertCompany = async (company: Company) => {
  const res = await fetch(withBasePath("/api/admin/companies/upsert"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(company),
  });
  const payload = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(payload.error || "Failed to save company.");
  await refreshCompaniesSnapshot();
};

export const deleteCompanyByCompanyId = async (companyId: string) => {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("companies").delete().eq("company_id", companyId);
  if (error) throw error;
  await refreshCompaniesSnapshot();
};
