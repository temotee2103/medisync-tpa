export type Company = {
  companyId: string;
  name: string;
  registrationNoNew: string;
  registrationNoOld?: string;
  tinNumber?: string;
  sstNumber?: string;
  ssmFileName?: string;
  ssmExpiryDate?: string;
  industry: string;
  contactEmail: string;
  contactPhone: string;
  contactPhoneSecondary?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  status: "Active" | "Disabled";
  planConfig: CompanyPlanConfig;
};

const COMPANY_KEY = "company_directory";
const COMPANY_SEEDED_KEY = "company_seeded";

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

export const ensureCompanySeed = () => {
  if (typeof window === "undefined") return;
  if (!localStorage.getItem(COMPANY_SEEDED_KEY)) {
    const companies: Company[] = [
      {
        companyId: "CMP-001",
        name: "TechCorp Malaysia",
        registrationNoNew: "202301001234",
        registrationNoOld: "",
        tinNumber: "C20892054010",
        sstNumber: "B16-2001-12000001",
        ssmFileName: "techcorp-ssm.pdf",
        ssmExpiryDate: "2027-12-31",
        industry: "Technology / Software",
        contactEmail: "hr@techcorp.com",
        contactPhone: "+603-2100 8888",
        contactPhoneSecondary: "",
        addressLine1: "No. 12, Jalan Integrasi",
        addressLine2: "KL Eco City",
        city: "Kuala Lumpur",
        state: "Wilayah Persekutuan",
        postalCode: "59200",
        status: "Active",
        planConfig: createDefaultPlanConfig(),
      },
      {
        companyId: "CMP-002",
        name: "LogiTrans Global",
        registrationNoNew: "201901009876",
        registrationNoOld: "",
        tinNumber: "C20892388110",
        sstNumber: "B16-2001-13000077",
        ssmFileName: "logitrans-ssm.pdf",
        ssmExpiryDate: "2028-06-30",
        industry: "Logistics",
        contactEmail: "people@logitrans.com",
        contactPhone: "+603-2788 9911",
        contactPhoneSecondary: "",
        addressLine1: "Lot 8, Jalan Perusahaan",
        addressLine2: "Bukit Raja",
        city: "Shah Alam",
        state: "Selangor",
        postalCode: "40150",
        status: "Active",
        planConfig: createDefaultPlanConfig(),
      },
    ];
    localStorage.setItem(COMPANY_KEY, JSON.stringify(companies));
    localStorage.setItem(COMPANY_SEEDED_KEY, "true");
  }
};

export const getCompanies = () => {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(COMPANY_KEY);
  const companies = raw ? (JSON.parse(raw) as Company[]) : [];
  return companies.map((company) => ({
    ...company,
    registrationNoNew:
      company.registrationNoNew || (company as unknown as { registrationNo?: string }).registrationNo || "",
    planConfig: normalizeCompanyPlanConfig(company.planConfig),
  }));
};

export const saveCompany = (company: Company) => {
  if (typeof window === "undefined") return;
  const companies = getCompanies().filter((entry) => entry.companyId !== company.companyId);
  companies.push(company);
  localStorage.setItem(COMPANY_KEY, JSON.stringify(companies));
};

export const deleteCompany = (companyId: string) => {
  if (typeof window === "undefined") return;
  const companies = getCompanies().filter((entry) => entry.companyId !== companyId);
  localStorage.setItem(COMPANY_KEY, JSON.stringify(companies));
};
