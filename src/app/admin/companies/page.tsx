"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
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
  User,
  Pencil,
  UserPlus,
  Info,
  MapPin,
  CreditCard,
  Calendar,
  XCircle
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Company,
  createDefaultPlanConfig,
  deleteCompany,
  ensureCompanySeed,
  getCompanies,
  saveCompany,
  type CompanyPlanCategoryKey,
  type CompanyPlanType,
} from "@/lib/companyStore";
import {
  ensureMemberSeed,
  getMembersByCompany,
  removeMembersByCompany,
  saveMemberAccount,
  saveMemberDirectoryEntry,
} from "@/lib/memberSession";
import { sha256 } from "@/lib/hash";
import { downloadText } from "@/lib/download";
import { getAdminSession } from "@/lib/adminSession";
import { buildAddressLine, formatPhoneForDisplay, normalizeName, normalizePhone, validateDependentPassport } from "@/lib/formats";

const EMPTY_COMPANIES: Company[] = [];
let companySnapshot: Company[] | null = null;
const companyListeners = new Set<() => void>();
const TODAY_KEY = new Date().toISOString().slice(0, 10);

const getCompanySnapshot = () => {
  if (typeof window === "undefined") return EMPTY_COMPANIES;
  if (companySnapshot) return companySnapshot;
  ensureCompanySeed();
  ensureMemberSeed();
  companySnapshot = getCompanies();
  return companySnapshot;
};

const subscribeCompanyStore = (listener: () => void) => {
  companyListeners.add(listener);
  return () => companyListeners.delete(listener);
};

const refreshCompanySnapshot = () => {
  if (typeof window === "undefined") return;
  companySnapshot = getCompanies();
  companyListeners.forEach((listener) => listener());
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
  registrationNoNew: "",
  registrationNoOld: "",
  tinNumber: "",
  sstNumber: "",
  ssmFileName: "",
  ssmExpiryDate: "",
  industry: "",
  contactEmail: "",
  contactPhone: "",
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
  const logAdminAction = (action: string) => {
    if (typeof window === "undefined") return;
    const logs = JSON.parse(localStorage.getItem("admin_audit_logs") || "[]");
    logs.push({ action, createdAt: new Date().toISOString() });
    localStorage.setItem("admin_audit_logs", JSON.stringify(logs));
  };
  const companies = useSyncExternalStore(
    subscribeCompanyStore,
    getCompanySnapshot,
    () => EMPTY_COMPANIES
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyModalView, setCompanyModalView] = useState<"details" | "info">("details");
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [companyForm, setCompanyForm] = useState<Company>(createEmptyCompanyForm);
  const adminRole = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => getAdminSession()?.role ?? "staff",
    () => "staff"
  );
  const isSuperAdmin = adminRole === "super_admin";
  const [memberForm, setMemberForm] = useState<MemberFormDraft>(() => createEmptyMemberForm(null));
  const [memberFormError, setMemberFormError] = useState("");


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

  const members = useMemo(() => {
    if (!activeCompanyId) return [];
    return getMembersByCompany(activeCompanyId);
  }, [activeCompanyId]);

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
  const companyStats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter((company) => company.status === "Active").length;
    const totalMembers = companies.reduce((sum, company) => {
      return sum + getMembersByCompany(company.companyId).length;
    }, 0);
    return { total, active, inactive: total - active, totalMembers };
  }, [companies]);

  const updateSelectedCompany = (updated: Company) => {
    saveCompany(updated);
    refreshCompanySnapshot();
    logAdminAction(`Updated company plan config: ${updated.companyId}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Corporate Management</h1>
          <p className="text-slate-500">Create companies and manage their member rosters.</p>
        </div>
        <GlassButton
          className="gap-2"
          onClick={() => {
            setEditingCompanyId(null);
            setCompanyModalView("details");
            setCompanyForm(createEmptyCompanyForm());
            setIsCompanyModalOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Add Company
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
            <p className="text-2xl font-bold text-amber-700 mt-1">{memberStats.expired}</p>
          </button>
        </div>
      </GlassCard>

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
                          setIsCompanyModalOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        className="h-9 w-9 p-0 flex items-center justify-center"
                          title={company.status === "Active" ? "Disable company" : "Activate company"}
                        onClick={() => {
                            const nextStatus = company.status === "Active" ? "Disabled" : "Active";
                            saveCompany({
                              ...company,
                              status: nextStatus,
                            });
                            if (editingCompanyId === company.companyId) {
                              setCompanyForm((prev) => ({ ...prev, status: nextStatus }));
                            }
                            refreshCompanySnapshot();
                            logAdminAction(`Changed company status: ${company.companyId} -> ${nextStatus}`);
                        }}
                      >
                          <ShieldCheck className="w-4 h-4" />
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        className="h-9 w-9 p-0 flex items-center justify-center"
                        title="Add member"
                        onClick={() => {
                          setSelectedCompanyId(company.companyId);
                          setMemberForm(createEmptyMemberForm(company));
                          setMemberFormError("");
                          setIsMemberModalOpen(true);
                        }}
                      >
                        <UserPlus className="w-4 h-4" />
                      </GlassButton>
                        {isSuperAdmin && (
                          <GlassButton
                            variant="ghost"
                            className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
                            title="Delete company"
                            onClick={() => {
                              const shouldDelete = window.confirm(`Delete ${company.name} and all its members?`);
                              if (!shouldDelete) return;
                              deleteCompany(company.companyId);
                              removeMembersByCompany(company.companyId);
                              if (selectedCompanyId === company.companyId) {
                                setSelectedCompanyId("");
                              }
                              if (editingCompanyId === company.companyId) {
                                setIsCompanyModalOpen(false);
                                setEditingCompanyId(null);
                                setCompanyModalView("details");
                              }
                              refreshCompanySnapshot();
                              logAdminAction(`Deleted company ${company.companyId}`);
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

      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              setIsCompanyModalOpen(false);
              setEditingCompanyId(null);
              setCompanyModalView("details");
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
                <form className="space-y-8">
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
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="CMP-001"
                            value={companyForm.companyId}
                            onChange={(e) => setCompanyForm({ ...companyForm, companyId: e.target.value })}
                            required
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
                        <label className="text-sm font-medium text-slate-700">Contact Number</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="+60..."
                            value={companyForm.contactPhone}
                            onChange={(e) => setCompanyForm({ ...companyForm, contactPhone: e.target.value })}
                          />
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Second Contact Number</label>
                        <div className="relative">
                          <input
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            placeholder="+60..."
                            value={companyForm.contactPhoneSecondary || ""}
                            onChange={(e) => setCompanyForm({ ...companyForm, contactPhoneSecondary: e.target.value })}
                          />
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                    </div>
                  </section>
                </form>
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
                          {formatPhoneForDisplay(selectedCompany.contactPhone)}
                        </div>
                        {selectedCompany.contactPhoneSecondary && (
                          <div className="flex items-center gap-2 text-slate-600">
                            <Phone className="w-4 h-4 text-slate-400" />
                            {formatPhoneForDisplay(selectedCompany.contactPhoneSecondary)}
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
                      <span className="text-xs text-slate-500">{memberStats.total} total</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                      <div className="glass-card rounded-2xl p-5">
                        <p className="text-xs uppercase tracking-widest text-slate-400">Expired Passports</p>
                        <p className="text-3xl font-bold text-slate-800 mt-2">{memberStats.expired}</p>
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
                    <div className="space-y-4">
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
                    </div>
                  </GlassCard>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a company to view details.</p>
              )}
            </div>

            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              <GlassButton
                variant="secondary"
                onClick={() => {
                  setIsCompanyModalOpen(false);
                  setEditingCompanyId(null);
                  setCompanyModalView("details");
                }}
              >
                Cancel
              </GlassButton>
              {companyModalView === "details" && (
                <GlassButton
                  onClick={() => {
                    if (!companyForm.companyId || !companyForm.name || !companyForm.registrationNoNew) return;
                    const isEditing = Boolean(editingCompanyId);
                    saveCompany({
                      ...companyForm,
                      contactPhone: normalizePhone(companyForm.contactPhone),
                      contactPhoneSecondary: normalizePhone(companyForm.contactPhoneSecondary || ""),
                    });
                    refreshCompanySnapshot();
                    setSelectedCompanyId(companyForm.companyId);
                    logAdminAction(`${isEditing ? "Updated" : "Created"} company ${companyForm.companyId}`);
                    setCompanyForm(createEmptyCompanyForm());
                    setEditingCompanyId(null);
                    setCompanyModalView("details");
                    setIsCompanyModalOpen(false);
                  }}
                >
                  {editingCompanyId ? "Update Company" : "Save Company"}
                </GlassButton>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {isMemberModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
              <form className="space-y-8">
                <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  Identity & Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input type="text" className="w-full glass-input pl-10 pr-4 py-2.5" placeholder="Full Name as per ID" value={memberForm.fullName} onChange={(e) => setMemberForm({ ...memberForm, fullName: normalizeName(e.target.value) })} required />
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
                    <div className="rounded-2xl border border-slate-200 p-4 bg-white/70 space-y-3">
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
                                      i === index ? { ...item, fullName: normalizeName(e.target.value) } : item
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
              </form>
            </div>
            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              {memberFormError && <p className="mr-auto text-xs text-red-500 font-medium self-center">{memberFormError}</p>}
              <GlassButton variant="secondary" onClick={() => setIsMemberModalOpen(false)}>Cancel</GlassButton>
              <GlassButton
                onClick={() => {
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

                  const phoneCombined = memberForm.phone
                    ? `${memberForm.phoneCountryCode} ${memberForm.phone}`
                    : memberForm.phoneCountryCode;
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

                  saveCompany({
                    ...selectedCompany,
                    planConfig: {
                      ...selectedCompany.planConfig,
                      autoDisablePassport: memberForm.autoDisablePassport,
                      dependents: {
                        ...selectedCompany.planConfig.dependents,
                        sharedLimit: memberForm.dependentSharedLimit,
                      },
                    },
                  });

                  saveMemberDirectoryEntry({
                    companyId: selectedCompany.companyId,
                    staffId: memberForm.staffId,
                    fullName: normalizedFullName,
                    email: memberForm.email,
                    memberType: "primary",
                    dob: primaryDob,
                    gender: memberForm.gender,
                    relationship: "Employee",
                    phone: normalizePhone(phoneCombined) || undefined,
                    status: memberForm.status,
                    passportExpiry: memberForm.idType === "Passport" ? memberForm.passportExpiry || undefined : undefined,
                    passportNo: memberForm.idType === "Passport" ? memberForm.nricPassport || undefined : undefined,
                    nationality: memberForm.nationality || undefined,
                    nricPassport: memberForm.nricPassport || undefined,
                    passportFileName: memberForm.idType === "Passport" ? memberForm.passportFileName || undefined : undefined,
                    planType: memberForm.planType,
                    lumpSumLimit: primaryLumpSumLimit,
                    familyLumpSumLimit: familyLumpSumLimit,
                    planSelection: memberForm.planSelection,
                    planLimits: primaryPlanLimits,
                    familyPlanLimits: familyPlanLimits,
                  });
                  memberForm.dependents.forEach((dependent, index) => {
                    const dependentPlanLimits = (Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>).reduce<Record<string, number>>((acc, [key]) => {
                      acc[key] = memberForm.dependentSharedLimit ? familyPlanLimits[key] : getNumericLimit(dependent.planLimits?.[key]);
                      return acc;
                    }, {});
                    saveMemberDirectoryEntry({
                      companyId: selectedCompany.companyId,
                      staffId: `${memberForm.staffId}-DEP-${index + 1}`,
                      fullName: normalizeName(dependent.fullName),
                      email: `${memberForm.staffId.toLowerCase()}-dep${index + 1}@placeholder.local`,
                      memberType: "dependent",
                      parentStaffId: memberForm.staffId,
                      dob: undefined,
                      gender: dependent.gender,
                      relationship: dependent.relationship,
                      status: "Active",
                      passportExpiry: memberForm.idType === "Passport" ? dependent.passportExpiry || undefined : undefined,
                      passportNo: memberForm.idType === "Passport" ? dependent.nricPassport || undefined : undefined,
                      nationality: memberForm.nationality || undefined,
                      nricPassport: dependent.nricPassport || undefined,
                      planType: memberForm.planType,
                      lumpSumLimit:
                        memberForm.planType === "lump_sum"
                          ? memberForm.dependentSharedLimit
                            ? familyLumpSumLimit
                            : getNumericLimit(dependent.lumpSumLimit)
                          : undefined,
                      planSelection: memberForm.planSelection,
                      planLimits: dependentPlanLimits,
                    });
                  });
                  const tempPassword = memberForm.tempPassword || "Temp1234";
                  sha256(tempPassword).then((passwordHash) => {
                    saveMemberAccount({
                      companyId: selectedCompany.companyId,
                      staffId: memberForm.staffId,
                      passwordHash,
                      mustChangePassword: true,
                    });
                  });
                  logAdminAction(`Created member ${memberForm.staffId} in ${selectedCompany.companyId}`);
                  setMemberForm(createEmptyMemberForm(selectedCompany));
                  setMemberFormError("");
                  refreshCompanySnapshot();
                  setIsMemberModalOpen(false);
                }}
              >
                Save Member
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
