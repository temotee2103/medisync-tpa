"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { 
  UserPlus, 
  Search, 
  ShieldCheck, 
  User, 
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  Lock,
  CreditCard,
  Calendar,
  Pencil,
  KeyRound,
  Upload,
  Users,
  Building2,
  Stethoscope
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ensureMemberSeed,
  getDependentsByParent,
  getMemberDirectory,
  isPrimaryMember,
  MemberDirectoryEntry,
  removeMemberDirectoryEntry,
  saveMemberAccount,
  saveMemberDirectoryEntry,
} from "@/lib/memberSession";
import {
  ensureProviderSeed,
  getProviderDirectory,
  getVendorMemberAccounts,
  getVendorMembers,
  VendorMemberDirectoryEntry,
  saveVendorMember,
  saveVendorMemberAccount,
} from "@/lib/providerSession";
import { ensureAdminSeed, getAdminDirectory, AdminDirectoryEntry, saveAdminAccount, saveAdminDirectoryEntry } from "@/lib/adminSession";
import { sha256 } from "@/lib/hash";
import {
  DIAL_CODES,
  formatDateDisplay,
  formatPhoneForDisplay,
  joinPhoneNumber,
  normalizeName,
  normalizePhone,
  splitPhoneNumber,
} from "@/lib/formats";
import { ensureCompanySeed, getCompanies, saveCompany, type Company, type CompanyPlanCategoryKey, type CompanyPlanType } from "@/lib/companyStore";
import {
  countConfiguredPlanLimits,
  countSelectedPlanBenefits,
  formatPlanTypeLabel,
  resolveMemberPlan,
} from "@/lib/memberPlan";

const EMPTY_CORPORATE_MEMBERS: MemberDirectoryEntry[] = [];
const EMPTY_VENDOR_MEMBERS: VendorMemberDirectoryEntry[] = [];
const EMPTY_ADMIN_MEMBERS: AdminDirectoryEntry[] = [];
const EMPTY_COMPANIES: Company[] = [];
const TODAY_KEY = new Date().toISOString().slice(0, 10);
const PASSPORT_RENEWAL_KEY = "passport_renewal_requests";
const NATIONALITIES = ["Malaysia", "Singapore", "Indonesia", "Thailand", "China", "India", "Japan", "Australia", "United Kingdom", "United States", "Other"];

type PassportRenewalRequest = {
  id: string;
  companyId: string;
  staffId: string;
  fullName: string;
  currentExpiry: string;
  newExpiry: string;
  fileName: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

const getPassportRenewalRequests = () => {
  if (typeof window === "undefined") return [] as PassportRenewalRequest[];
  const raw = localStorage.getItem(PASSPORT_RENEWAL_KEY);
  return raw ? (JSON.parse(raw) as PassportRenewalRequest[]) : [];
};

const savePassportRenewalRequests = (requests: PassportRenewalRequest[]) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(PASSPORT_RENEWAL_KEY, JSON.stringify(requests));
};

const getOppositeBinaryGender = (gender: "Male" | "Female") => {
  return gender === "Male" ? "Female" : "Male";
};

const getNumericLimit = (value: number | "" | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

type EditingDependent = {
  staffId: string;
  fullName: string;
  relationship: "Spouse" | "Child" | "Parent";
  gender: "Male" | "Female";
  nricPassport: string;
  passportExpiry: string;
  lumpSumLimit: number | "";
  planLimits: Record<string, number | "">;
};

const createEmptyEditingDependent = (): EditingDependent => ({
  staffId: "",
  fullName: "",
  relationship: "Child",
  gender: "Male",
  nricPassport: "",
  passportExpiry: "",
  lumpSumLimit: "",
  planLimits: {},
});

const getDependentAllocatedLumpSum = (dependents: Array<{ lumpSumLimit?: number | "" }>) =>
  dependents.reduce((sum, dependent) => sum + getNumericLimit(dependent.lumpSumLimit), 0);

const getDependentAllocatedCategoryLimit = (
  dependents: Array<{ planLimits?: Record<string, number | ""> }>,
  key: string
) =>
  dependents.reduce((sum, dependent) => sum + getNumericLimit(dependent.planLimits?.[key]), 0);

let corporateSnapshot: MemberDirectoryEntry[] = EMPTY_CORPORATE_MEMBERS;
let vendorSnapshot: VendorMemberDirectoryEntry[] = EMPTY_VENDOR_MEMBERS;
let adminSnapshot: AdminDirectoryEntry[] = EMPTY_ADMIN_MEMBERS;
let companySnapshot: Company[] = EMPTY_COMPANIES;

const corporateListeners = new Set<() => void>();
const vendorListeners = new Set<() => void>();
const adminListeners = new Set<() => void>();
const companyListeners = new Set<() => void>();

const subscribeCorporateMembers = (listener: () => void) => {
  corporateListeners.add(listener);
  return () => corporateListeners.delete(listener);
};

const subscribeVendorMembers = (listener: () => void) => {
  vendorListeners.add(listener);
  return () => vendorListeners.delete(listener);
};

const subscribeAdminMembers = (listener: () => void) => {
  adminListeners.add(listener);
  return () => adminListeners.delete(listener);
};

const subscribeCompanies = (listener: () => void) => {
  companyListeners.add(listener);
  return () => companyListeners.delete(listener);
};

const getCorporateSnapshot = () => corporateSnapshot;
const getVendorSnapshot = () => vendorSnapshot;
const getAdminSnapshot = () => adminSnapshot;
const getCompanySnapshot = () => companySnapshot;

const refreshCorporateSnapshot = () => {
  if (typeof window === "undefined") return;
  ensureMemberSeed();
  corporateSnapshot = getMemberDirectory().filter((entry) => isPrimaryMember(entry));
  corporateListeners.forEach((listener) => listener());
};

const refreshVendorSnapshot = () => {
  if (typeof window === "undefined") return;
  ensureProviderSeed();
  vendorSnapshot = getVendorMembers();
  vendorListeners.forEach((listener) => listener());
};

const refreshAdminSnapshot = () => {
  if (typeof window === "undefined") return;
  ensureAdminSeed();
  adminSnapshot = getAdminDirectory();
  adminListeners.forEach((listener) => listener());
};

const refreshCompanySnapshot = () => {
  if (typeof window === "undefined") return;
  ensureCompanySeed();
  companySnapshot = getCompanies();
  companyListeners.forEach((listener) => listener());
};

function UserManagementPageContent() {
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get("section");
  const initialSection =
    sectionParam === "corporate" || sectionParam === "vendor" || sectionParam === "admin"
      ? sectionParam
      : "corporate";
  const corporateFilterParam = searchParams.get("corporateFilter");
  const initialCorporateFilter =
    corporateFilterParam === "all" ||
    corporateFilterParam === "active" ||
    corporateFilterParam === "inactive" ||
    corporateFilterParam === "expired_passport"
      ? corporateFilterParam
      : "all";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCorporateCompanyId, setSelectedCorporateCompanyId] = useState("all");
  const [selectedVendorScopeId, setSelectedVendorScopeId] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMemberEditModalOpen, setIsMemberEditModalOpen] = useState(false);
  const [editingMemberType, setEditingMemberType] = useState<"corporate" | "vendor">("corporate");
  const [editingMemberDraft, setEditingMemberDraft] = useState({
    companyId: "",
    vendorId: "",
    staffId: "",
    memberId: "",
    fullName: "",
    email: "",
    phone: "",
    nationality: "Malaysia",
    idType: "NRIC" as "NRIC" | "Passport",
    nricPassport: "",
    dob: "",
    gender: "Male" as "Male" | "Female",
    relationship: "Employee" as "Employee" | "Spouse" | "Child" | "Parent",
    role: "",
    status: "Active" as "Active" | "Disabled",
    passportExpiry: "",
    passportFileName: "",
  });
  const [memberEditError, setMemberEditError] = useState("");
  const [editingDependents, setEditingDependents] = useState<EditingDependent[]>([]);
  const [editingPlanSelection, setEditingPlanSelection] = useState<Record<string, boolean>>({});
  const [editingPlanLimits, setEditingPlanLimits] = useState<Record<string, number | "">>({});
  const [editingPlanType, setEditingPlanType] = useState<CompanyPlanType>("category");
  const [editingLumpSumLimit, setEditingLumpSumLimit] = useState<number | "">("");
  const [editingAutoDisablePassport, setEditingAutoDisablePassport] = useState(true);
  const [editingDependentSharedLimit, setEditingDependentSharedLimit] = useState(true);
  const [editingVendorCredential, setEditingVendorCredential] = useState({
    password: "",
    hasExistingAccount: false,
  });
  const [passportRenewMember, setPassportRenewMember] = useState<MemberDirectoryEntry | null>(null);
  const [passportRenewDraft, setPassportRenewDraft] = useState({
    expiryDate: "",
    fileName: "",
  });
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<
    | { type: "corporate"; member: MemberDirectoryEntry }
    | { type: "vendor"; member: VendorMemberDirectoryEntry }
    | null
  >(null);
  const [passportRenewals, setPassportRenewals] = useState<PassportRenewalRequest[]>(() => getPassportRenewalRequests());
  const [activeSection, setActiveSection] = useState<"corporate" | "vendor" | "admin">(initialSection);
  const [corporateFilter, setCorporateFilter] = useState<"all" | "active" | "inactive" | "expired_passport">(initialCorporateFilter);
  const [vendorFilter, setVendorFilter] = useState<"all" | "active" | "inactive">("all");
  const [adminFilter, setAdminFilter] = useState<"all" | "active" | "inactive">("all");
  const [newAdminForm, setNewAdminForm] = useState({
    adminId: "",
    fullName: "",
    email: "",
    role: "staff" as "super_admin" | "admin" | "staff",
    position: "",
    tier: "Tier 1" as "Tier 1" | "Tier 2",
    contactPhone: "",
    contactPhoneSecondary: "",
    password: "",
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
  const corporateMembers = useSyncExternalStore(
    subscribeCorporateMembers,
    getCorporateSnapshot,
    () => EMPTY_CORPORATE_MEMBERS
  );
  const vendorMembers = useSyncExternalStore(
    subscribeVendorMembers,
    getVendorSnapshot,
    () => EMPTY_VENDOR_MEMBERS
  );
  const adminMembers = useSyncExternalStore(
    subscribeAdminMembers,
    getAdminSnapshot,
    () => EMPTY_ADMIN_MEMBERS
  );
  const companies = useSyncExternalStore(
    subscribeCompanies,
    getCompanySnapshot,
    () => EMPTY_COMPANIES
  );
  const providerDirectory = useMemo(() => {
    ensureProviderSeed();
    return getProviderDirectory();
  }, []);

  useEffect(() => {
    refreshCorporateSnapshot();
    refreshVendorSnapshot();
    refreshAdminSnapshot();
    refreshCompanySnapshot();
  }, []);

  const corporateStats = useMemo(() => {
    const total = corporateMembers.length;
    const active = corporateMembers.filter((member) => member.status === "Active").length;
    const disabled = total - active;
    const expiredPassport = corporateMembers.filter((member) => {
      if (!member.passportExpiry) return false;
      if (member.passportExpiry.length < 10) return false;
      return member.passportExpiry < TODAY_KEY;
    }).length;
    return { total, active, disabled, expiredPassport };
  }, [corporateMembers]);

  const vendorStats = useMemo(() => {
    const total = vendorMembers.length;
    const active = vendorMembers.filter((member) => member.status === "Active").length;
    const disabled = total - active;
    return { total, active, disabled };
  }, [vendorMembers]);

  const adminStats = useMemo(() => {
    const total = adminMembers.length;
    const active = adminMembers.filter((member) => member.status === "Active").length;
    const disabled = total - active;
    return { total, active, disabled };
  }, [adminMembers]);

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'super_admin': return <ShieldCheck className="w-4 h-4 text-purple-500" />;
      case 'admin': return <UserCog className="w-4 h-4 text-sky-500" />;
      case 'staff': return <UserCog className="w-4 h-4 text-emerald-500" />;
      default: return <User className="w-4 h-4 text-slate-500" />;
    }
  };

  const filteredAdminMembers = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return adminMembers;
    return adminMembers.filter((member) => {
      return (
        member.fullName.toLowerCase().includes(normalized) ||
        member.adminId.toLowerCase().includes(normalized) ||
        member.role.toLowerCase().includes(normalized)
      );
    });
  }, [adminMembers, searchTerm]);

  const filteredCorporateMembers = useMemo(() => {
    let base = corporateMembers;
    if (selectedCorporateCompanyId !== "all") {
      base = base.filter((member) => member.companyId === selectedCorporateCompanyId);
    }
    if (corporateFilter === "active") {
      return base.filter((member) => member.status === "Active");
    }
    if (corporateFilter === "inactive") {
      return base.filter((member) => member.status === "Disabled");
    }
    if (corporateFilter === "expired_passport") {
      return base.filter((member) => {
        if (!member.passportExpiry) return false;
        if (member.passportExpiry.length < 10) return false;
        return member.passportExpiry < TODAY_KEY;
      });
    }
    return base;
  }, [corporateMembers, corporateFilter, selectedCorporateCompanyId]);

  const filteredVendorMembers = useMemo(() => {
    let base = vendorMembers;
    if (selectedVendorScopeId !== "all") {
      base = base.filter((member) => member.vendorId === selectedVendorScopeId);
    }
    if (vendorFilter === "active") {
      return base.filter((member) => member.status === "Active");
    }
    if (vendorFilter === "inactive") {
      return base.filter((member) => member.status === "Disabled");
    }
    return base;
  }, [vendorMembers, vendorFilter, selectedVendorScopeId]);

  const filteredAdminMembersByStatus = useMemo(() => {
    if (adminFilter === "active") {
      return filteredAdminMembers.filter((member) => member.status === "Active");
    }
    if (adminFilter === "inactive") {
      return filteredAdminMembers.filter((member) => member.status === "Disabled");
    }
    return filteredAdminMembers;
  }, [filteredAdminMembers, adminFilter]);

  const vendorScopeOptions = useMemo(
    () => Array.from(new Set(vendorMembers.map((member) => member.vendorId))).sort(),
    [vendorMembers]
  );
  const vendorScopeLabels = useMemo(() => {
    return vendorScopeOptions.map((vendorId) => {
      const vendor = providerDirectory.find((entry) => entry.vendorId === vendorId);
      return {
        vendorId,
        label: vendor ? `${vendor.providerName} (${vendor.vendorId})` : vendorId,
      };
    });
  }, [providerDirectory, vendorScopeOptions]);
  const selectedCorporateCompany = useMemo(
    () =>
      selectedMemberProfile?.type === "corporate"
        ? companies.find((company) => company.companyId === selectedMemberProfile.member.companyId) || null
        : null,
    [companies, selectedMemberProfile]
  );
  const selectedVendorProvider = useMemo(
    () =>
      selectedMemberProfile?.type === "vendor"
        ? providerDirectory.find((provider) => provider.vendorId === selectedMemberProfile.member.vendorId) || null
        : null,
    [providerDirectory, selectedMemberProfile]
  );
  const selectedMemberDependents = useMemo(() => {
    if (selectedMemberProfile?.type !== "corporate") return [];
    return getDependentsByParent(selectedMemberProfile.member.companyId, selectedMemberProfile.member.staffId);
  }, [selectedMemberProfile]);
  const selectedCorporatePlan = useMemo(() => {
    if (selectedMemberProfile?.type !== "corporate") return null;
    return resolveMemberPlan(selectedMemberProfile.member, selectedCorporateCompany);
  }, [selectedCorporateCompany, selectedMemberProfile]);
  const editingCompany = useMemo(
    () => companies.find((entry) => entry.companyId === editingMemberDraft.companyId) || null,
    [companies, editingMemberDraft.companyId]
  );
  const editingMemberPhoneParts = splitPhoneNumber(editingMemberDraft.phone);
  const newAdminContactPhoneParts = splitPhoneNumber(newAdminForm.contactPhone);
  const newAdminSecondaryPhoneParts = splitPhoneNumber(newAdminForm.contactPhoneSecondary);

  const saveNewAdminAccount = async () => {
    if (!newAdminForm.adminId || !newAdminForm.fullName || !newAdminForm.password) return;
    const passwordHash = await sha256(newAdminForm.password);
    saveAdminDirectoryEntry({
      adminId: newAdminForm.adminId,
      fullName: normalizeName(newAdminForm.fullName),
      role: newAdminForm.role,
      status: "Active",
      position: newAdminForm.position || undefined,
      tier: newAdminForm.tier,
      contactPhone: normalizePhone(newAdminForm.contactPhone) || undefined,
      contactPhoneSecondary: normalizePhone(newAdminForm.contactPhoneSecondary) || undefined,
    });
    saveAdminAccount({
      adminId: newAdminForm.adminId,
      passwordHash,
    });
    refreshAdminSnapshot();
    setNewAdminForm({
      adminId: "",
      fullName: "",
      email: "",
      role: "staff",
      position: "",
      tier: "Tier 1",
      contactPhone: "",
      contactPhoneSecondary: "",
      password: "",
    });
    setIsModalOpen(false);
  };

  const toggleCorporateMemberStatus = (member: MemberDirectoryEntry) => {
    const nextStatus = member.status === "Active" ? "Disabled" : "Active";
    saveMemberDirectoryEntry({
      ...member,
      status: nextStatus,
    });
    refreshCorporateSnapshot();
  };

  const toggleVendorMemberStatus = (member: VendorMemberDirectoryEntry) => {
    const nextStatus = member.status === "Active" ? "Disabled" : "Active";
    saveVendorMember({
      ...member,
      status: nextStatus,
    });
    refreshVendorSnapshot();
  };

  const isPassportExpired = (member: MemberDirectoryEntry) => {
    if (!member.passportExpiry || member.passportExpiry.length < 10) return false;
    return member.passportExpiry < TODAY_KEY;
  };

  const openCorporateEditModal = (member: MemberDirectoryEntry) => {
    const company = companies.find((entry) => entry.companyId === member.companyId);
    const resolvedPlan = resolveMemberPlan(member, company);
    const companyPlanConfig = company?.planConfig;
    const defaultPlanSelection = Object.fromEntries(
      resolvedPlan.categories.map((category) => [category.key, category.selected])
    );
    const defaultPlanLimits = Object.fromEntries(
      resolvedPlan.categories.map((category) => [category.key, category.limit])
    );
    const dependentRows: EditingDependent[] = getDependentsByParent(member.companyId, member.staffId)
      .map((entry) => {
        const dependentPlan = resolveMemberPlan(entry, company);
        return {
          staffId: entry.staffId,
          fullName: entry.fullName,
          relationship: (entry.relationship as "Spouse" | "Child" | "Parent") || "Child",
          gender: (entry.gender as "Male" | "Female") || "Male",
          nricPassport: entry.nricPassport || entry.passportNo || "",
          passportExpiry: entry.passportExpiry || "",
          lumpSumLimit: dependentPlan.type === "lump_sum" ? dependentPlan.lumpSumLimit : "",
          planLimits:
            dependentPlan.type === "category"
              ? Object.fromEntries(dependentPlan.categories.map((category) => [category.key, category.limit]))
              : {},
        };
      });
    const familyPlanSelection = member.planSelection || defaultPlanSelection;
    const familyPlanLimits =
      resolvedPlan.type === "category"
        ? Object.fromEntries(
            resolvedPlan.categories.map((category) => [
              category.key,
              member.familyPlanLimits?.[category.key] ??
                category.limit,
            ])
          )
        : {};
    const familyLumpSumLimit =
      resolvedPlan.type === "lump_sum"
        ? member.familyLumpSumLimit ??
          resolvedPlan.lumpSumLimit
        : 0;
    setEditingMemberType("corporate");
    setEditingMemberDraft({
      companyId: member.companyId,
      vendorId: "",
      staffId: member.staffId,
      memberId: "",
      fullName: member.fullName,
      email: member.email,
      phone: member.phone || "",
      nationality: member.nationality || "Malaysia",
      idType: member.passportNo ? "Passport" : "NRIC",
      nricPassport: member.nricPassport || member.passportNo || "",
      dob: member.dob || "",
      gender: member.gender || "Male",
      relationship: member.relationship || "Employee",
      role: "",
      status: member.status,
      passportExpiry: member.passportExpiry || "",
      passportFileName: member.passportFileName || "",
    });
    setEditingDependents(dependentRows);
    setEditingPlanType(resolvedPlan.type);
    setEditingLumpSumLimit(familyLumpSumLimit);
    setEditingPlanSelection(familyPlanSelection);
    setEditingPlanLimits(
      resolvedPlan.type === "category"
        ? familyPlanLimits
        : defaultPlanLimits
    );
    setEditingAutoDisablePassport(companyPlanConfig?.autoDisablePassport ?? true);
    setEditingDependentSharedLimit(companyPlanConfig?.dependents.sharedLimit ?? true);
    setMemberEditError("");
    setIsMemberEditModalOpen(true);
  };

  const openVendorEditModal = (member: VendorMemberDirectoryEntry) => {
    const account = getVendorMemberAccounts().find(
      (entry) => entry.vendorId === member.vendorId && entry.memberId === member.memberId
    );
    setEditingMemberType("vendor");
    setEditingMemberDraft({
      companyId: "",
      vendorId: member.vendorId,
      staffId: "",
      memberId: member.memberId,
      fullName: member.fullName,
      email: member.email,
      phone: member.phone || "",
      nationality: "Malaysia",
      idType: "NRIC",
      nricPassport: "",
      dob: "",
      gender: "Male",
      relationship: "Employee",
      role: member.role || "",
      status: member.status,
      passportExpiry: "",
      passportFileName: "",
    });
    setEditingDependents([]);
    setEditingPlanType("category");
    setEditingLumpSumLimit("");
    setEditingPlanSelection({});
    setEditingPlanLimits({});
    setEditingAutoDisablePassport(true);
    setEditingDependentSharedLimit(true);
    setEditingVendorCredential({
      password: "",
      hasExistingAccount: !!account,
    });
    setMemberEditError("");
    setIsMemberEditModalOpen(true);
  };

  const saveMemberEdit = async () => {
    if (editingMemberType === "corporate") {
      if (!editingMemberDraft.staffId || !editingMemberDraft.fullName || !editingMemberDraft.email) {
        setMemberEditError("Please complete Staff ID, Full Name, and Email.");
        return;
      }
      if (!editingMemberDraft.nricPassport) {
        setMemberEditError(`Please fill ${editingMemberDraft.idType === "NRIC" ? "NRIC No." : "Passport No."}.`);
        return;
      }
      if (editingMemberDraft.idType === "Passport" && !editingMemberDraft.passportExpiry) {
        setMemberEditError("Passport expiry date is required when ID Type is Passport.");
        return;
      }
      if (editingPlanType === "lump_sum" && (typeof editingLumpSumLimit !== "number" || editingLumpSumLimit <= 0)) {
        setMemberEditError("Please enter a valid lump sum limit.");
        return;
      }
      if (editingPlanType === "category") {
        const hasSelectedCategory = Object.entries(editingPlanSelection).some(([, selected]) => selected);
        if (!hasSelectedCategory) {
          setMemberEditError("Please enable at least one benefit category for categorized limits.");
          return;
        }
      }
      for (const dependent of editingDependents) {
        if (!dependent.fullName || !dependent.nricPassport) {
          setMemberEditError("Please complete dependent details before saving.");
          return;
        }
        if (editingMemberDraft.idType === "Passport" && !dependent.passportExpiry) {
          setMemberEditError("Dependent passport expiry date is required for foreigner member registration.");
          return;
        }
      }
      const familyPlanLimits =
        editingPlanType === "category"
          ? (Object.entries(editingPlanLimits) as Array<[CompanyPlanCategoryKey, number | ""]>).reduce<Record<string, number>>((acc, [key, value]) => {
              if (editingPlanSelection?.[key]) {
                acc[key] = getNumericLimit(value);
              }
              return acc;
            }, {})
          : {};
      const familyLumpSumLimit = editingPlanType === "lump_sum" ? getNumericLimit(editingLumpSumLimit) : undefined;
      if (!editingDependentSharedLimit) {
        if (
          editingPlanType === "lump_sum" &&
          typeof familyLumpSumLimit === "number" &&
          getDependentAllocatedLumpSum(editingDependents) > familyLumpSumLimit
        ) {
          setMemberEditError("Dependent allocated amount cannot exceed the member lump sum limit.");
          return;
        }
        if (editingPlanType === "category") {
          for (const [key, limit] of Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>) {
            if (getDependentAllocatedCategoryLimit(editingDependents, key) > limit) {
              const categoryLabel = editingCompany?.planConfig.categories[key]?.label || key;
              setMemberEditError(`${categoryLabel} dependent allocation cannot exceed the member limit.`);
              return;
            }
          }
        }
      }
      const nextStatus =
        editingAutoDisablePassport &&
        editingMemberDraft.idType === "Passport" &&
        !!editingMemberDraft.passportExpiry &&
        editingMemberDraft.passportExpiry < TODAY_KEY
          ? "Disabled"
          : editingMemberDraft.status;
      const primaryPlanLimits =
        editingPlanType === "category"
          ? (Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>).reduce<Record<string, number>>((acc, [key, value]) => {
              acc[key] = editingDependentSharedLimit
                ? value
                : Math.max(value - getDependentAllocatedCategoryLimit(editingDependents, key), 0);
              return acc;
            }, {})
          : {};
      const primaryLumpSumLimit =
        editingPlanType === "lump_sum" && typeof familyLumpSumLimit === "number"
          ? editingDependentSharedLimit
            ? familyLumpSumLimit
            : Math.max(familyLumpSumLimit - getDependentAllocatedLumpSum(editingDependents), 0)
          : undefined;
      if (editingCompany) {
        saveCompany({
          ...editingCompany,
          planConfig: {
            ...editingCompany.planConfig,
            autoDisablePassport: editingAutoDisablePassport,
            dependents: {
              ...editingCompany.planConfig.dependents,
              sharedLimit: editingDependentSharedLimit,
            },
          },
        });
        refreshCompanySnapshot();
      }
      saveMemberDirectoryEntry({
        companyId: editingMemberDraft.companyId,
        staffId: editingMemberDraft.staffId,
        fullName: normalizeName(editingMemberDraft.fullName),
        email: editingMemberDraft.email,
        memberType: "primary",
        phone: normalizePhone(editingMemberDraft.phone) || undefined,
        nationality: editingMemberDraft.nationality || undefined,
        nricPassport: editingMemberDraft.nricPassport || undefined,
        dob: editingMemberDraft.dob || undefined,
        gender: editingMemberDraft.gender,
        relationship: editingMemberDraft.relationship,
        passportExpiry: editingMemberDraft.idType === "Passport" ? editingMemberDraft.passportExpiry || undefined : undefined,
        passportNo: editingMemberDraft.idType === "Passport" ? editingMemberDraft.nricPassport || undefined : undefined,
        passportFileName: editingMemberDraft.idType === "Passport" ? editingMemberDraft.passportFileName || undefined : undefined,
        planType: editingPlanType,
        lumpSumLimit: primaryLumpSumLimit,
        familyLumpSumLimit: familyLumpSumLimit,
        planSelection:
          editingPlanType === "category"
            ? editingPlanSelection
            : {},
        planLimits: primaryPlanLimits,
        familyPlanLimits: familyPlanLimits,
        status: nextStatus,
      });
      const existingDependentIds = getDependentsByParent(editingMemberDraft.companyId, editingMemberDraft.staffId)
        .map((entry) => entry.staffId);
      existingDependentIds.forEach((staffId) => {
        if (!editingDependents.some((dep) => dep.staffId === staffId)) {
          removeMemberDirectoryEntry(editingMemberDraft.companyId, staffId);
        }
      });
      editingDependents.forEach((dependent, index) => {
        const dependentStaffId = dependent.staffId || `${editingMemberDraft.staffId}-DEP-${index + 1}`;
        const dependentPlanLimits =
          editingPlanType === "category"
            ? (Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>).reduce<Record<string, number>>((acc, [key]) => {
                acc[key] = editingDependentSharedLimit ? familyPlanLimits[key] : getNumericLimit(dependent.planLimits?.[key]);
                return acc;
              }, {})
            : {};
        saveMemberDirectoryEntry({
          companyId: editingMemberDraft.companyId,
          staffId: dependentStaffId,
          fullName: normalizeName(dependent.fullName),
          email: `${editingMemberDraft.staffId.toLowerCase()}-dep${index + 1}@placeholder.local`,
          memberType: "dependent",
          parentStaffId: editingMemberDraft.staffId,
          status:
            editingAutoDisablePassport &&
            editingMemberDraft.idType === "Passport" &&
            !!dependent.passportExpiry &&
            dependent.passportExpiry < TODAY_KEY
              ? "Disabled"
              : "Active",
          gender: dependent.gender,
          relationship: dependent.relationship,
          nricPassport: dependent.nricPassport,
          passportNo: editingMemberDraft.idType === "Passport" ? dependent.nricPassport : undefined,
          passportExpiry: editingMemberDraft.idType === "Passport" ? dependent.passportExpiry || undefined : undefined,
          nationality: editingMemberDraft.nationality || undefined,
          planType: editingPlanType,
          lumpSumLimit:
            editingPlanType === "lump_sum"
              ? editingDependentSharedLimit
                ? familyLumpSumLimit
                : getNumericLimit(dependent.lumpSumLimit)
              : undefined,
          planSelection:
            editingPlanType === "category"
              ? editingPlanSelection
              : {},
          planLimits: dependentPlanLimits,
        });
      });
      refreshCorporateSnapshot();
    } else {
      if (!editingMemberDraft.role || !["Admin", "Doctor"].includes(editingMemberDraft.role)) {
        setMemberEditError("Vendor member role must be Admin or Doctor.");
        return;
      }
      saveVendorMember({
        vendorId: editingMemberDraft.vendorId,
        memberId: editingMemberDraft.memberId,
        fullName: normalizeName(editingMemberDraft.fullName),
        email: editingMemberDraft.email,
        phone: normalizePhone(editingMemberDraft.phone) || undefined,
        role: editingMemberDraft.role || undefined,
        status: editingMemberDraft.status,
      });
      const existingAccount = getVendorMemberAccounts().find(
        (entry) => entry.vendorId === editingMemberDraft.vendorId && entry.memberId === editingMemberDraft.memberId
      );
      if (!editingVendorCredential.password && !existingAccount) {
        setMemberEditError("Login password is required because this member has no existing login account.");
        return;
      }
      const passwordHash = editingVendorCredential.password
        ? await sha256(editingVendorCredential.password)
        : existingAccount?.passwordHash || "";
      if (!passwordHash) {
        setMemberEditError("Unable to save vendor member login password.");
        return;
      }
      saveVendorMemberAccount({
        vendorId: editingMemberDraft.vendorId,
        memberId: editingMemberDraft.memberId,
        username: editingMemberDraft.memberId,
        passwordHash,
        mustChangePassword: editingVendorCredential.password
          ? true
          : existingAccount?.mustChangePassword ?? false,
      });
      refreshVendorSnapshot();
    }
    setEditingDependents([]);
    setEditingPlanType("category");
    setEditingLumpSumLimit("");
    setEditingPlanSelection({});
    setEditingPlanLimits({});
    setEditingVendorCredential({
      password: "",
      hasExistingAccount: false,
    });
    setMemberEditError("");
    setIsMemberEditModalOpen(false);
  };

  const resetCorporateMemberPassword = async (member: MemberDirectoryEntry) => {
    const tempPassword = `Temp${Math.floor(100000 + Math.random() * 900000)}`;
    const passwordHash = await sha256(tempPassword);
    saveMemberAccount({
      companyId: member.companyId,
      staffId: member.staffId,
      passwordHash,
      mustChangePassword: true,
    });
    window.alert(`Temporary password for ${member.staffId}: ${tempPassword}`);
  };

  const resetVendorMemberPassword = async (member: VendorMemberDirectoryEntry) => {
    const tempPassword = `Temp${Math.floor(100000 + Math.random() * 900000)}`;
    const existingAccount = getVendorMemberAccounts().find(
      (entry) => entry.vendorId === member.vendorId && entry.memberId === member.memberId
    );
    const passwordHash = await sha256(tempPassword);
    saveVendorMemberAccount({
      vendorId: member.vendorId,
      memberId: member.memberId,
      username: existingAccount?.username || member.memberId,
      passwordHash,
      mustChangePassword: true,
    });
    window.alert(`Temporary password for ${member.memberId}: ${tempPassword}`);
  };

  const openPassportRenewModal = (member: MemberDirectoryEntry) => {
    setPassportRenewMember(member);
    setPassportRenewDraft({
      expiryDate: member.passportExpiry || "",
      fileName: member.passportFileName || "",
    });
  };

  const submitPassportRenewal = () => {
    if (!passportRenewMember || !passportRenewDraft.expiryDate || !passportRenewDraft.fileName) return;
    const existing = getPassportRenewalRequests();
    const next: PassportRenewalRequest[] = [
      {
        id: `PR-${Date.now()}`,
        companyId: passportRenewMember.companyId,
        staffId: passportRenewMember.staffId,
        fullName: passportRenewMember.fullName,
        currentExpiry: passportRenewMember.passportExpiry || "",
        newExpiry: passportRenewDraft.expiryDate,
        fileName: passportRenewDraft.fileName,
        submittedAt: new Date().toISOString(),
        status: "pending",
      },
      ...existing,
    ];
    savePassportRenewalRequests(next);
    setPassportRenewals(next);
    setPassportRenewMember(null);
    setPassportRenewDraft({ expiryDate: "", fileName: "" });
  };

  const reviewPassportRenewal = (requestId: string, status: "approved" | "rejected") => {
    const requests = getPassportRenewalRequests();
    const target = requests.find((request) => request.id === requestId);
    if (!target) return;
    const reviewedAt = new Date().toISOString();
    const nextRequests = requests.map((request) =>
      request.id === requestId
        ? {
            ...request,
            status,
            reviewedAt,
            reviewedBy: "Admin",
            reviewNote: status === "approved" ? "Passport renewal approved" : "Passport renewal rejected",
          }
        : request
    );
    if (status === "approved") {
      const member = getMemberDirectory().find(
        (entry) => entry.companyId === target.companyId && entry.staffId === target.staffId
      );
      if (member) {
        saveMemberDirectoryEntry({
          ...member,
          passportExpiry: target.newExpiry,
          passportFileName: target.fileName,
          status: "Active",
        });
        refreshCorporateSnapshot();
      }
    }
    savePassportRenewalRequests(nextRequests);
    setPassportRenewals(nextRequests);
  };

  const renderCorporateActions = (member: MemberDirectoryEntry) => (
    <>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-sky-600 hover:text-sky-700"
        title="Edit Member"
        onClick={() => openCorporateEditModal(member)}
      >
        <Pencil className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-indigo-600 hover:text-indigo-700"
        title="Reset Password"
        onClick={() => resetCorporateMemberPassword(member)}
      >
        <KeyRound className="w-4 h-4" />
      </GlassButton>
      {isPassportExpired(member) && (
        <GlassButton
          variant="ghost"
          className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
          title="Renew Passport"
          onClick={() => openPassportRenewModal(member)}
        >
          <Upload className="w-4 h-4" />
        </GlassButton>
      )}
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-amber-600 hover:text-amber-700"
        title={member.status === "Active" ? "Disable Member" : "Activate Member"}
        onClick={() => toggleCorporateMemberStatus(member)}
      >
        {member.status === "Active" ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
      </GlassButton>
    </>
  );

  const renderVendorActions = (member: VendorMemberDirectoryEntry) => (
    <>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-sky-600 hover:text-sky-700"
        title="Edit Member"
        onClick={() => openVendorEditModal(member)}
      >
        <Pencil className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-indigo-600 hover:text-indigo-700"
        title="Reset Password"
        onClick={() => resetVendorMemberPassword(member)}
      >
        <KeyRound className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-amber-600 hover:text-amber-700"
        title={member.status === "Active" ? "Disable Member" : "Activate Member"}
        onClick={() => toggleVendorMemberStatus(member)}
      >
        {member.status === "Active" ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
      </GlassButton>
    </>
  );

  const renderAdminActions = () => (
    <>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-indigo-600 hover:text-indigo-700"
        title="Reset Password"
      >
        <UserCog className="w-4 h-4" />
      </GlassButton>
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
        title="Disable Account"
      >
        <XCircle className="w-4 h-4" />
      </GlassButton>
    </>
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500">Monitor corporate, vendor, and admin access from one place.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <GlassButton
          className={cn(
            "gap-2 px-4 py-2",
            activeSection === "corporate"
              ? "bg-sky-500 hover:bg-sky-600 text-white border-transparent shadow-lg shadow-sky-500/20"
              : "bg-white/40 hover:bg-white/60 text-sky-900 border-white/50"
          )}
          onClick={() => setActiveSection("corporate")}
        >
          <Building2 className="w-4 h-4" />
          Corporate Members
        </GlassButton>
        <GlassButton
          className={cn(
            "gap-2 px-4 py-2",
            activeSection === "vendor"
              ? "bg-emerald-500 hover:bg-emerald-600 text-white border-transparent shadow-lg shadow-emerald-500/20"
              : "bg-white/40 hover:bg-white/60 text-emerald-900 border-white/50"
          )}
          onClick={() => setActiveSection("vendor")}
        >
          <Stethoscope className="w-4 h-4" />
          Vendor Members
        </GlassButton>
        <GlassButton
          className={cn(
            "gap-2 px-4 py-2",
            activeSection === "admin"
              ? "bg-indigo-500 hover:bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-500/20"
              : "bg-white/40 hover:bg-white/60 text-indigo-900 border-white/50"
          )}
          onClick={() => setActiveSection("admin")}
        >
          <ShieldCheck className="w-4 h-4" />
          Admin Members
        </GlassButton>
      </div>

      {activeSection === "corporate" && (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-500" />
              Corporate Members
            </h2>
            <p className="text-sm text-slate-500">Employees tied to corporate plans and benefits.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              corporateFilter === "all" ? "ring-2 ring-sky-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setCorporateFilter("all")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Total Members</p>
              <p className="text-2xl font-bold text-slate-800">{corporateStats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              corporateFilter === "active" ? "ring-2 ring-emerald-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setCorporateFilter("active")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Active Members</p>
              <p className="text-2xl font-bold text-slate-800">{corporateStats.active}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              corporateFilter === "inactive" ? "ring-2 ring-slate-400/40" : "hover:bg-white/60"
            )}
            onClick={() => setCorporateFilter("inactive")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Inactive Members</p>
              <p className="text-2xl font-bold text-slate-800">{corporateStats.disabled}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              corporateFilter === "expired_passport" ? "ring-2 ring-rose-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setCorporateFilter("expired_passport")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Expired Passport</p>
              <p className="text-2xl font-bold text-slate-800">{corporateStats.expiredPassport}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </button>
        </div>
        <ResponsiveDataView
          desktop={
            <GlassCard className="overflow-hidden p-0 border-white/40">
              <div className="px-6 py-4 border-b border-white/60 bg-white/40 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Passport Renewal Review</h3>
                <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-1 rounded-full">
                  {passportRenewals.filter((item) => item.status === "pending").length} Pending
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/30 border-b border-white/50">
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Current Expiry</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Requested Expiry</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">File</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/20">
                    {passportRenewals.slice(0, 8).map((request) => (
                      <tr key={request.id} className="hover:bg-white/30 transition-colors">
                        <td className="px-6 py-3">
                          <div className="text-sm font-semibold text-slate-700">{request.fullName}</div>
                          <div className="text-xs text-slate-500">{request.staffId}</div>
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600">{request.currentExpiry || "—"}</td>
                        <td className="px-6 py-3 text-sm font-semibold text-slate-700">{request.newExpiry}</td>
                        <td className="px-6 py-3 text-xs text-slate-500 max-w-44 truncate">{request.fileName}</td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                              request.status === "pending"
                                ? "bg-amber-100 text-amber-700"
                                : request.status === "approved"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-rose-100 text-rose-700"
                            )}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          {request.status === "pending" ? (
                            <div className="flex justify-end gap-2">
                              <GlassButton variant="ghost" className="h-8 px-3 text-emerald-700 hover:text-emerald-800" onClick={() => reviewPassportRenewal(request.id, "approved")}>Approve</GlassButton>
                              <GlassButton variant="ghost" className="h-8 px-3 text-rose-700 hover:text-rose-800" onClick={() => reviewPassportRenewal(request.id, "rejected")}>Reject</GlassButton>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">{request.reviewedAt ? request.reviewedAt.slice(0, 10) : "—"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {passportRenewals.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-400">No passport renewal requests yet.</td>
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
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Passport Renewal Review</h3>
                <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-1 rounded-full">
                  {passportRenewals.filter((item) => item.status === "pending").length} Pending
                </span>
              </div>
              {passportRenewals.slice(0, 8).map((request) => (
                <MobileRecordCard
                  key={request.id}
                  title={request.fullName}
                  subtitle={request.staffId}
                  badge={<span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", request.status === "pending" ? "bg-amber-100 text-amber-700" : request.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{request.status}</span>}
                  footer={request.status === "pending" ? <div className="flex justify-end gap-2"><GlassButton variant="ghost" className="h-8 px-3 text-emerald-700 hover:text-emerald-800" onClick={() => reviewPassportRenewal(request.id, "approved")}>Approve</GlassButton><GlassButton variant="ghost" className="h-8 px-3 text-rose-700 hover:text-rose-800" onClick={() => reviewPassportRenewal(request.id, "rejected")}>Reject</GlassButton></div> : <div className="text-right text-xs text-slate-400">{request.reviewedAt ? request.reviewedAt.slice(0, 10) : "—"}</div>}
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Expiry</p>
                    <p className="mt-1 text-sm text-slate-700">{request.currentExpiry || "—"}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requested Expiry</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{request.newExpiry}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">File</p>
                    <p className="mt-1 text-sm text-slate-700 break-words">{request.fileName}</p>
                  </div>
                </MobileRecordCard>
              ))}
            </div>
          }
        />
        <GlassCard className="overflow-hidden p-0 border-white/40">
          <div className="px-6 py-4 border-b border-white/60 bg-white/40">
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-3">Corporate Scope</label>
            <select
              className="glass-input px-3 py-2 bg-transparent text-sm w-full mt-3 md:mt-0 md:w-auto md:min-w-72"
              value={selectedCorporateCompanyId}
              onChange={(e) => setSelectedCorporateCompanyId(e.target.value)}
            >
              <option value="all">All Companies</option>
              {companies.map((company) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.companyId} - {company.name}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveDataView
            desktop={<div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/40 border-b border-white/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Staff ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Passport Expiry</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {filteredCorporateMembers.map((member) => (
                  <tr key={`${member.companyId}-${member.staffId}`} className="hover:bg-white/30 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        className="font-semibold text-slate-700 hover:text-sky-700 transition-colors"
                        onClick={() => setSelectedMemberProfile({ type: "corporate", member })}
                      >
                        {member.fullName}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{member.staffId}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                        member.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {member.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{member.passportExpiry || "—"}</td>
                    <td className="px-6 py-4 text-right"><div className="flex justify-end gap-2">{renderCorporateActions(member)}</div></td>
                  </tr>
                ))}
                {filteredCorporateMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">No corporate members yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>}
            mobile={<div className="p-4 space-y-3">
              {filteredCorporateMembers.map((member) => (
                <MobileRecordCard
                  key={`${member.companyId}-${member.staffId}`}
                  title={<button type="button" className="text-left hover:text-sky-700 transition-colors" onClick={() => setSelectedMemberProfile({ type: "corporate", member })}>{member.fullName}</button>}
                  subtitle={member.staffId}
                  badge={<span className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", member.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{member.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{member.status}</span>}
                  footer={<div className="flex flex-wrap justify-end gap-2">{renderCorporateActions(member)}</div>}
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Company</p>
                    <p className="mt-1 text-sm text-slate-700">{companies.find((company) => company.companyId === member.companyId)?.name || member.companyId}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Passport Expiry</p>
                    <p className="mt-1 text-sm text-slate-700">{formatDateDisplay(member.passportExpiry || "") || member.passportExpiry || "—"}</p>
                  </div>
                </MobileRecordCard>
              ))}
              {filteredCorporateMembers.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No corporate members yet.</div>}
            </div>}
          />
        </GlassCard>
      </section>
      )}

      {activeSection === "vendor" && (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-emerald-500" />
              Vendor Members
            </h2>
            <p className="text-sm text-slate-500">Staff accounts tied to provider vendors.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              vendorFilter === "all" ? "ring-2 ring-emerald-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setVendorFilter("all")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Total Members</p>
              <p className="text-2xl font-bold text-slate-800">{vendorStats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              vendorFilter === "active" ? "ring-2 ring-emerald-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setVendorFilter("active")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Active Members</p>
              <p className="text-2xl font-bold text-slate-800">{vendorStats.active}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100/70 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              vendorFilter === "inactive" ? "ring-2 ring-slate-400/40" : "hover:bg-white/60"
            )}
            onClick={() => setVendorFilter("inactive")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Inactive Members</p>
              <p className="text-2xl font-bold text-slate-800">{vendorStats.disabled}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </button>
        </div>
        <GlassCard className="overflow-hidden p-0 border-white/40">
          <div className="px-6 py-4 border-b border-white/60 bg-white/40">
            <label className="text-xs uppercase tracking-wider text-slate-500 font-semibold mr-3">Vendor Scope</label>
            <select
              className="glass-input px-3 py-2 bg-transparent text-sm w-full mt-3 md:mt-0 md:w-auto md:min-w-72"
              value={selectedVendorScopeId}
              onChange={(e) => setSelectedVendorScopeId(e.target.value)}
            >
              <option value="all">All Vendors</option>
              {vendorScopeLabels.map((vendor) => (
                <option key={vendor.vendorId} value={vendor.vendorId}>
                  {vendor.label}
                </option>
              ))}
            </select>
          </div>
          <ResponsiveDataView
            desktop={<div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/40 border-b border-white/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vendor ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {filteredVendorMembers.map((member) => (
                  <tr key={`${member.vendorId}-${member.memberId}`} className="hover:bg-white/30 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        className="font-semibold text-slate-700 hover:text-sky-700 transition-colors"
                        onClick={() => setSelectedMemberProfile({ type: "vendor", member })}
                      >
                        {member.fullName}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{member.vendorId}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{member.role || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                        member.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {member.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {member.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right"><div className="flex justify-end gap-2">{renderVendorActions(member)}</div></td>
                  </tr>
                ))}
                {filteredVendorMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">No vendor members yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>}
            mobile={<div className="p-4 space-y-3">
              {filteredVendorMembers.map((member) => (
                <MobileRecordCard
                  key={`${member.vendorId}-${member.memberId}`}
                  title={<button type="button" className="text-left hover:text-sky-700 transition-colors" onClick={() => setSelectedMemberProfile({ type: "vendor", member })}>{member.fullName}</button>}
                  subtitle={providerDirectory.find((provider) => provider.vendorId === member.vendorId)?.providerName || member.vendorId}
                  badge={<span className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", member.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{member.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{member.status}</span>}
                  footer={<div className="flex flex-wrap justify-end gap-2">{renderVendorActions(member)}</div>}
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendor ID</p>
                    <p className="mt-1 text-sm text-slate-700">{member.vendorId}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</p>
                    <p className="mt-1 text-sm text-slate-700">{member.role || "—"}</p>
                  </div>
                </MobileRecordCard>
              ))}
              {filteredVendorMembers.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No vendor members yet.</div>}
            </div>}
          />
        </GlassCard>
      </section>
      )}

      {activeSection === "admin" && (
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              Admin Members
            </h2>
            <p className="text-sm text-slate-500">Internal console access for Medisync staff.</p>
          </div>
          <GlassButton onClick={() => setIsModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Create Admin User
          </GlassButton>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              adminFilter === "all" ? "ring-2 ring-indigo-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setAdminFilter("all")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Total Admins</p>
              <p className="text-2xl font-bold text-slate-800">{adminStats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              adminFilter === "active" ? "ring-2 ring-emerald-500/40" : "hover:bg-white/60"
            )}
            onClick={() => setAdminFilter("active")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Active Admins</p>
              <p className="text-2xl font-bold text-slate-800">{adminStats.active}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </button>
          <button
            className={cn(
              "glass-card rounded-2xl p-4 flex items-center justify-between text-left transition-all",
              adminFilter === "inactive" ? "ring-2 ring-slate-400/40" : "hover:bg-white/60"
            )}
            onClick={() => setAdminFilter("inactive")}
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Inactive Admins</p>
              <p className="text-2xl font-bold text-slate-800">{adminStats.disabled}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </button>
        </div>
        <GlassCard className="flex flex-col md:flex-row gap-4 p-4">
          <div className="relative flex-1">
            <input 
              type="text" 
              placeholder="Search by name, admin ID, or role..." 
              className="w-full pl-10 pr-4 py-2 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
          </div>
          <div className="flex gap-2">
            <select className="glass-input px-4 py-2 bg-transparent outline-none">
              <option>All Roles</option>
              <option>Super Admin</option>
              <option>Admin</option>
              <option>Staff</option>
            </select>
          </div>
        </GlassCard>
        <ResponsiveDataView
          desktop={<GlassCard className="overflow-hidden p-0 border-white/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/40 border-b border-white/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Admin</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Login</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {filteredAdminMembersByStatus.map((user) => (
                  <tr key={user.adminId} className="hover:bg-white/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                          {user.fullName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-700">{user.fullName}</div>
                          <div className="text-xs text-slate-500">{user.adminId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(user.role)}
                        <span className="text-sm text-slate-600 capitalize">{user.role.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                        user.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {user.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">—</td>
                    <td className="px-6 py-4 text-right"><div className="flex justify-end gap-2">{renderAdminActions()}</div></td>
                  </tr>
                ))}
                {filteredAdminMembersByStatus.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">No admin users yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>}
          mobile={<div className="space-y-3">
            {filteredAdminMembersByStatus.map((user) => (
              <MobileRecordCard
                key={user.adminId}
                title={user.fullName}
                subtitle={user.adminId}
                badge={<span className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", user.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{user.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{user.status}</span>}
                footer={<div className="flex flex-wrap justify-end gap-2">{renderAdminActions()}</div>}
              >
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</p>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                    {getRoleIcon(user.role)}
                    <span className="capitalize">{user.role.replace("_", " ")}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Login</p>
                  <p className="mt-1 text-sm text-slate-700">—</p>
                </div>
              </MobileRecordCard>
            ))}
            {filteredAdminMembersByStatus.length === 0 && <GlassCard className="p-6 text-center text-sm text-slate-400">No admin users yet.</GlassCard>}
          </div>}
        />
      </section>
      )}

      {selectedMemberProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setSelectedMemberProfile(null)} />
          <GlassCard className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border border-slate-200 bg-white/95 p-0 shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  {selectedMemberProfile.type === "corporate" ? "Member Information" : "Vendor Member Information"}
                </h3>
                <p className="text-sm text-slate-500">
                  {selectedMemberProfile.type === "corporate" ? "Corporate member record overview." : "Vendor member record overview."}
                </p>
              </div>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-4">
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-sky-200/30 blur-2xl" />
                <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-emerald-200/30 blur-2xl" />
                <div className="relative flex flex-col gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-sky-600 shadow-sm border border-sky-100">
                      <span className="text-lg font-bold">
                        {selectedMemberProfile.member.fullName
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xl font-bold text-slate-800 truncate">{selectedMemberProfile.member.fullName}</h4>
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          {selectedMemberProfile.member.status}
                        </span>
                        {selectedMemberProfile.type === "corporate" && (
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200">
                            {selectedMemberProfile.member.relationship || "Employee"}
                          </span>
                        )}
                        {selectedMemberProfile.type === "vendor" && selectedMemberProfile.member.role && (
                          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200">
                            {selectedMemberProfile.member.role}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 truncate">{selectedMemberProfile.member.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedMemberProfile.type === "corporate" ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                          <CreditCard className="h-3.5 w-3.5" />
                          {selectedMemberProfile.member.staffId}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                          <Building2 className="h-3.5 w-3.5" />
                          {selectedCorporateCompany?.name || selectedMemberProfile.member.companyId}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {selectedMemberProfile.member.nationality || "Nationality Pending"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                          <CreditCard className="h-3.5 w-3.5" />
                          {selectedMemberProfile.member.memberId}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                          <Building2 className="h-3.5 w-3.5" />
                          {selectedVendorProvider?.providerName || selectedMemberProfile.member.vendorId}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-4">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                        {selectedMemberProfile.type === "corporate" ? "Member Profile" : "Vendor Member Profile"}
                      </h4>
                      <span className="text-[11px] font-medium text-slate-400">Read-only</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Email</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800 break-words">{selectedMemberProfile.member.email}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Contact Number</span>
                        </div>
                        <p className="text-sm font-medium text-slate-800">
                          {formatPhoneForDisplay(selectedMemberProfile.member.phone) || "—"}
                        </p>
                      </div>
                      {selectedMemberProfile.type === "corporate" ? (
                        <>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Date of Birth</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800">{formatDateDisplay(selectedMemberProfile.member.dob || "") || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Gender</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800">{selectedMemberProfile.member.gender || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                              <CreditCard className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">NRIC / Passport</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800">{selectedMemberProfile.member.nricPassport || selectedMemberProfile.member.passportNo || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Passport Expiry</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800">{formatDateDisplay(selectedMemberProfile.member.passportExpiry || "") || "—"}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                              <Stethoscope className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Role</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800">{selectedMemberProfile.member.role || "—"}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-center gap-2 text-slate-400 mb-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Vendor ID</span>
                            </div>
                            <p className="text-sm font-medium text-slate-800">{selectedMemberProfile.member.vendorId}</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {selectedMemberProfile.type === "corporate" && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-sky-500" />
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Dependent Details</h4>
                      </div>
                      {selectedMemberDependents.length > 0 ? (
                        <div className="space-y-3">
                          {selectedMemberDependents.map((dependent) => (
                            <div key={dependent.staffId} className="rounded-xl bg-slate-50/80 border border-slate-100 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{dependent.fullName}</p>
                                  <p className="text-xs text-slate-500">{dependent.relationship || "Dependent"}</p>
                                </div>
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                  {dependent.status}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gender</p>
                                  <p className="mt-0.5">{dependent.gender || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Birth</p>
                                  <p className="mt-0.5">{formatDateDisplay(dependent.dob || "") || dependent.dob || "—"}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-slate-50/80 border border-slate-100 p-4">
                          <p className="text-sm font-medium text-slate-700">No dependent records linked.</p>
                          <p className="mt-1 text-xs text-slate-500">No dependent details are available for this member in the current mock data.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                        {selectedMemberProfile.type === "corporate" ? "Membership Summary" : "Access Summary"}
                      </h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Status</p>
                        <p className="mt-1 text-xs font-bold text-emerald-700">{selectedMemberProfile.member.status}</p>
                      </div>
                      <div className="rounded-xl bg-sky-50 border border-sky-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-500">
                          {selectedMemberProfile.type === "corporate" ? "Relationship" : "Member Type"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-sky-700">
                          {selectedMemberProfile.type === "corporate"
                            ? selectedMemberProfile.member.relationship || "Employee"
                            : "Vendor Staff"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-violet-500">
                          {selectedMemberProfile.type === "corporate" ? "Selected Benefits" : "Provider Name"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-violet-700">
                          {selectedMemberProfile.type === "corporate"
                            ? selectedCorporatePlan
                              ? countSelectedPlanBenefits(selectedCorporatePlan).toString()
                              : "0"
                            : selectedVendorProvider?.providerName || "Unknown"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">
                          {selectedMemberProfile.type === "corporate" ? "Configured Limits" : "Login ID"}
                        </p>
                        <p className="mt-1 text-xs font-bold text-amber-700">
                          {selectedMemberProfile.type === "corporate"
                            ? selectedCorporatePlan
                              ? countConfiguredPlanLimits(selectedCorporatePlan).toString()
                              : "0"
                            : selectedMemberProfile.member.memberId}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedMemberProfile.type === "corporate" && selectedCorporatePlan && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-sky-500" />
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Plan Configuration</h4>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 border border-sky-100">
                          {formatPlanTypeLabel(selectedCorporatePlan.type)}
                        </span>
                      </div>

                      {selectedCorporatePlan.type === "lump_sum" ? (
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Configured Limit</p>
                          <p className="mt-1 text-lg font-bold text-slate-800">
                            RM {selectedCorporatePlan.lumpSumLimit.toLocaleString("en-MY")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">All eligible claims draw down from one shared annual member balance.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selectedCorporatePlan.categories
                            .filter((category) => category.selected)
                            .map((category) => (
                              <div key={category.key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                                <div>
                                  <p className="text-sm font-semibold text-slate-800">{category.label}</p>
                                  <p className="text-[11px] text-slate-500">Company default RM {category.companyLimit.toLocaleString("en-MY")}</p>
                                </div>
                                <p className="text-sm font-bold text-slate-800">RM {category.limit.toLocaleString("en-MY")}</p>
                              </div>
                            ))}
                          {selectedCorporatePlan.categories.every((category) => !category.selected) && (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                              <p className="text-sm font-medium text-slate-700">No category limits selected for this member.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedMemberProfile.type === "corporate" && selectedCorporateCompany && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-amber-500" />
                        <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Coverage Rules</h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Foreigner Policy</p>
                          <p className="mt-1 text-xs font-bold text-amber-700">
                            {selectedCorporateCompany.planConfig.autoDisablePassport
                              ? "Auto-disable on passport expiry"
                              : "Manual passport review"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-purple-50 border border-purple-100 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Dependent Coverage</p>
                          <p className="mt-1 text-xs font-bold text-purple-700">
                            {selectedCorporateCompany.planConfig.dependents.sharedLimit
                              ? "Share primary member limit"
                              : "Separate dependent allocation"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end">
              <GlassButton variant="secondary" onClick={() => setSelectedMemberProfile(null)}>Close</GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Create User Modal (Redesigned) */}
      {passportRenewMember && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-0" onClick={() => setPassportRenewMember(null)} />
          <GlassCard className="w-full max-w-xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Upload className="w-6 h-6 text-rose-600" />
                  Renew Passport
                </h2>
                <p className="text-sm text-slate-500 mt-1">{passportRenewMember.fullName} • {passportRenewMember.staffId}</p>
              </div>
              <button
                onClick={() => setPassportRenewMember(null)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">New Passport Expiry Date</label>
                <input
                  type="date"
                  className="w-full glass-input px-4 py-2.5"
                  value={passportRenewDraft.expiryDate}
                  onChange={(e) => setPassportRenewDraft((prev) => ({ ...prev, expiryDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Passport Upload</label>
                <label className="glass-input px-3 py-2.5 cursor-pointer flex items-center justify-between text-sm text-slate-700 rounded-xl border border-slate-200/70 bg-white/80 shadow-sm hover:bg-white">
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) =>
                      setPassportRenewDraft((prev) => ({ ...prev, fileName: e.target.files?.[0]?.name || "" }))
                    }
                  />
                  <span className="font-medium truncate">{passportRenewDraft.fileName || "Choose file"}</span>
                  <span className="text-xs uppercase tracking-wider text-slate-400">Browse</span>
                </label>
                <input
                  type="text"
                  className="w-full glass-input px-3 py-2 bg-slate-50 text-slate-500 cursor-not-allowed"
                  placeholder="passport-document.pdf"
                  value={passportRenewDraft.fileName}
                  readOnly
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setPassportRenewMember(null)}>Cancel</GlassButton>
              <GlassButton
                className="bg-rose-600 hover:bg-rose-700 text-white border-transparent"
                disabled={!passportRenewDraft.expiryDate || !passportRenewDraft.fileName}
                onClick={submitPassportRenewal}
              >
                Save Renewal
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {isMemberEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-0" onClick={() => setIsMemberEditModalOpen(false)} />
          <GlassCard className="w-full max-w-4xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Pencil className="w-6 h-6 text-sky-600" />
                  Edit Member
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {editingMemberType === "corporate" ? "Update corporate member profile details." : "Update vendor member profile details."}
                </p>
              </div>
              <button
                onClick={() => setIsMemberEditModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="overflow-y-auto p-8 custom-scrollbar">
              <form className="space-y-8">
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1 h-4 bg-sky-500 rounded-full" />
                    Identity & Contact
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {editingMemberType === "corporate" && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Staff ID</label>
                        <input
                          type="text"
                          className="w-full glass-input px-4 py-2.5"
                          value={editingMemberDraft.staffId}
                          onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, staffId: e.target.value }))}
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Full Name</label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="Member full name"
                          value={editingMemberDraft.fullName}
                          onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, fullName: normalizeName(e.target.value) }))}
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Email</label>
                      <div className="relative">
                        <input
                          type="email"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="member@email.com"
                          value={editingMemberDraft.email}
                          onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, email: e.target.value }))}
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
                            value={editingMemberPhoneParts.countryCode}
                            onChange={(e) =>
                              setEditingMemberDraft((prev) => ({
                                ...prev,
                                phone: joinPhoneNumber(e.target.value, editingMemberPhoneParts.localNumber),
                              }))
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
                          value={editingMemberPhoneParts.localNumber}
                          onChange={(e) =>
                            setEditingMemberDraft((prev) => ({
                              ...prev,
                              phone: joinPhoneNumber(editingMemberPhoneParts.countryCode, e.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>
                    {editingMemberType === "corporate" && (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">Nationality</label>
                          <select
                            className="w-full glass-input px-4 py-2.5 bg-transparent"
                            value={editingMemberDraft.nationality}
                            onChange={(e) =>
                              setEditingMemberDraft((prev) => ({
                                ...prev,
                                nationality: e.target.value,
                                idType: e.target.value === "Malaysia" ? "NRIC" : "Passport",
                              }))
                            }
                          >
                            {NATIONALITIES.map((nationality) => (
                              <option key={nationality} value={nationality}>
                                {nationality}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">ID Type</label>
                          <select
                            className="w-full glass-input px-4 py-2.5 bg-transparent"
                            value={editingMemberDraft.idType}
                            onChange={(e) =>
                              setEditingMemberDraft((prev) => ({
                                ...prev,
                                idType: e.target.value as "NRIC" | "Passport",
                                nricPassport: "",
                                passportExpiry: "",
                                passportFileName: "",
                              }))
                            }
                          >
                            <option value="NRIC">NRIC</option>
                            <option value="Passport">Passport</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">{editingMemberDraft.idType === "NRIC" ? "NRIC No." : "Passport No."}</label>
                          <input
                            type="text"
                            className="w-full glass-input px-4 py-2.5"
                            value={editingMemberDraft.nricPassport}
                            onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, nricPassport: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">Date of Birth</label>
                          <input
                            type="date"
                            className="w-full glass-input px-4 py-2.5"
                            value={
                              editingMemberDraft.idType === "NRIC"
                                ? inferDobFromNric(editingMemberDraft.nricPassport) || editingMemberDraft.dob
                                : editingMemberDraft.dob
                            }
                            onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, dob: e.target.value }))}
                            disabled={editingMemberDraft.idType === "NRIC"}
                          />
                          <p className="text-[10px] text-slate-400 pl-1">
                            {editingMemberDraft.idType === "NRIC" ? "Auto-derived from NRIC." : "Manual entry for passport holders."}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">Gender</label>
                          <select
                            className="w-full glass-input px-4 py-2.5 bg-transparent"
                            value={editingMemberDraft.gender}
                            onChange={(e) => {
                              const nextGender = e.target.value as "Male" | "Female";
                              setEditingMemberDraft((prev) => ({ ...prev, gender: nextGender }));
                              setEditingDependents((prev) =>
                                prev.map((dep) =>
                                  dep.relationship === "Spouse"
                                    ? { ...dep, gender: getOppositeBinaryGender(nextGender) }
                                    : dep
                                )
                              );
                            }}
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">Relationship</label>
                          <input
                            type="text"
                            className="w-full glass-input px-4 py-2.5"
                            value="Employee"
                            disabled
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>

                {(editingMemberType === "vendor" || editingMemberDraft.idType === "Passport") && (
                  <section className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-1 h-4 bg-sky-500 rounded-full" />
                      Membership Settings
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {editingMemberType === "vendor" ? (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Role</label>
                            <div className="relative">
                              <select
                                className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                                value={editingMemberDraft.role}
                                onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, role: e.target.value }))}
                              >
                                <option value="">Select role</option>
                                <option value="Admin">Admin</option>
                                <option value="Doctor">Doctor</option>
                              </select>
                              <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Temporary Password</label>
                            <div className="relative">
                              <input
                                type="password"
                                className="w-full glass-input pl-10 pr-4 py-2.5"
                                placeholder={editingVendorCredential.hasExistingAccount ? "Leave blank to keep existing password" : "Set temporary password"}
                                value={editingVendorCredential.password}
                                onChange={(e) =>
                                  setEditingVendorCredential((prev) => ({
                                    ...prev,
                                    password: e.target.value,
                                  }))
                                }
                              />
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                            </div>
                            <p className="pl-1 text-[10px] text-slate-400">
                              Vendor members sign in with Member ID and must change this password on first login.
                            </p>
                          </div>
                        </>
                      ) : null}
                      {editingMemberType === "corporate" && editingMemberDraft.idType === "Passport" ? (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Passport Expiry Date</label>
                            <input
                              type="date"
                              className="w-full glass-input px-4 py-2.5"
                              value={editingMemberDraft.passportExpiry}
                              onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, passportExpiry: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700">Passport Upload</label>
                            <input
                              type="file"
                              className="w-full glass-input px-4 py-2.5 bg-white text-sm"
                              onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, passportFileName: e.target.files?.[0]?.name || "" }))}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  </section>
                )}
                {editingMemberType === "corporate" && (
                  <>
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-1 h-4 bg-sky-500 rounded-full" />
                        Plan Configuration
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          type="button"
                          className={cn(
                            "rounded-2xl border p-4 text-left transition-all",
                            editingPlanType === "lump_sum"
                              ? "border-sky-300 bg-sky-50 ring-2 ring-sky-200"
                              : "border-slate-200 bg-white/70 hover:border-slate-300"
                          )}
                          onClick={() => setEditingPlanType("lump_sum")}
                        >
                          <p className="text-sm font-semibold text-slate-800">Lump Sum Limit</p>
                          <p className="mt-1 text-xs text-slate-500">Use one shared annual balance for all eligible claims.</p>
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-2xl border p-4 text-left transition-all",
                            editingPlanType === "category"
                              ? "border-sky-300 bg-sky-50 ring-2 ring-sky-200"
                              : "border-slate-200 bg-white/70 hover:border-slate-300"
                          )}
                          onClick={() => setEditingPlanType("category")}
                        >
                          <p className="text-sm font-semibold text-slate-800">Categorized Limits</p>
                          <p className="mt-1 text-xs text-slate-500">Enable specific benefit categories and set member-level limits per category.</p>
                        </button>
                      </div>

                      {editingPlanType === "lump_sum" ? (
                        <div className="rounded-2xl border border-slate-200 p-4 bg-white/70 space-y-3">
                          <div className="space-y-1.5 md:flex md:items-center md:gap-6 md:space-y-0">
                            <label className="text-sm font-medium text-slate-700 md:w-56 md:shrink-0">Member Lump Sum Limit</label>
                            <input
                              type="number"
                              min={0}
                              className="w-full md:w-64 glass-input px-4 py-2.5"
                              value={editingLumpSumLimit}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setEditingLumpSumLimit(raw === "" ? "" : Number(raw));
                              }}
                            />
                          </div>
                          <p className="text-xs text-slate-500">
                            Company default: RM {(editingCompany?.planConfig.lumpSumLimit || 0).toLocaleString("en-MY")}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Object.entries(editingCompany?.planConfig.categories || {}).map(([key, category]) => {
                            const selected = editingPlanSelection?.[key] ?? false;
                            return (
                              <div key={key} className="rounded-xl border border-slate-200 p-4 bg-white/70 space-y-2">
                                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    disabled={!category.enabled}
                                    onChange={() =>
                                      setEditingPlanSelection((prev) => ({
                                        ...prev,
                                        [key]: !selected,
                                      }))
                                    }
                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                  />
                                  {category.label}
                                </label>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">Member Limit</span>
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-32 glass-input px-2 py-1.5 text-xs"
                                    value={editingPlanLimits?.[key] ?? category.limit}
                                    disabled={!selected || !category.enabled}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      setEditingPlanLimits((prev) => ({
                                        ...prev,
                                        [key]: raw === "" ? "" : Number(raw),
                                      }));
                                    }}
                                  />
                                </div>
                                <p className="text-[11px] text-slate-500">
                                  Company default: RM {category.limit.toLocaleString("en-MY")}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-1 h-4 bg-amber-500 rounded-full" />
                        Coverage Rules
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">Foreign Worker Policy</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Applies at company level for all members under this corporate account.
                            </p>
                          </div>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                              checked={editingAutoDisablePassport}
                              onChange={(e) => setEditingAutoDisablePassport(e.target.checked)}
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
                                name="edit-dependent-limit"
                                checked={editingDependentSharedLimit}
                                onChange={() => setEditingDependentSharedLimit(true)}
                                className="border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                              Share primary member limit
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="radio"
                                name="edit-dependent-limit"
                                checked={!editingDependentSharedLimit}
                                onChange={() => setEditingDependentSharedLimit(false)}
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
                          <span className="w-1 h-4 bg-sky-500 rounded-full" />
                          Add Dependent
                        </h3>
                        <GlassButton
                          className="h-9 px-4 text-sm bg-emerald-500 hover:bg-emerald-600 text-white border-transparent"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditingDependents((prev) => [
                              ...prev,
                              createEmptyEditingDependent(),
                            ]);
                          }}
                        >
                          + Add Dependent
                        </GlassButton>
                      </div>
                      {!editingDependentSharedLimit && editingPlanType === "lump_sum" && (
                        <div className="rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Employee Remaining Limit</p>
                          <p className="mt-1 text-sm font-semibold text-purple-700">
                            RM {(getNumericLimit(editingLumpSumLimit) - getDependentAllocatedLumpSum(editingDependents)).toLocaleString("en-MY")}
                          </p>
                        </div>
                      )}
                      {!editingDependentSharedLimit && editingPlanType === "category" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {Object.entries(editingCompany?.planConfig.categories || {})
                            .filter(([key]) => editingPlanSelection?.[key])
                            .map(([key, category]) => (
                              <div key={key} className="rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">{category.label}</p>
                                <p className="mt-1 text-sm font-semibold text-purple-700">
                                  RM {Math.max(getNumericLimit(editingPlanLimits?.[key]) - getDependentAllocatedCategoryLimit(editingDependents, key), 0).toLocaleString("en-MY")}
                                </p>
                              </div>
                            ))}
                        </div>
                      )}
                      {editingDependents.length === 0 && (
                        <p className="text-xs text-slate-500">No dependents added.</p>
                      )}
                      <div className="space-y-3">
                        {editingDependents.map((dependent, index) => (
                          <div key={`${dependent.staffId || "new"}-${index}`} className="rounded-2xl border border-slate-200 p-5 bg-white space-y-4 shadow-sm">
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
                                      setEditingDependents((prev) =>
                                        prev.map((item, i) =>
                                          i === index ? { ...item, fullName: normalizeName(e.target.value) } : item
                                        )
                                      )
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
                                      setEditingDependents((prev) =>
                                        prev.map((item, i) => {
                                          if (i !== index) return item;
                                          const nextRelationship = e.target.value as "Spouse" | "Child" | "Parent";
                                          return {
                                            ...item,
                                            relationship: nextRelationship,
                                            gender: nextRelationship === "Spouse" ? getOppositeBinaryGender(editingMemberDraft.gender) : item.gender,
                                          };
                                        })
                                      )
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
                                    disabled={dependent.relationship === "Spouse"}
                                    value={dependent.relationship === "Spouse" ? getOppositeBinaryGender(editingMemberDraft.gender) : dependent.gender}
                                    onChange={(e) =>
                                      setEditingDependents((prev) =>
                                        prev.map((item, i) =>
                                          i === index ? { ...item, gender: e.target.value as "Male" | "Female" } : item
                                        )
                                      )
                                    }
                                  >
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                  </select>
                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-sm font-medium text-slate-700">
                                  {editingMemberDraft.idType === "Passport" ? "Dependent Passport No." : "Dependent NRIC / Passport No."} <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    className="w-full glass-input pl-10 pr-4 py-2.5"
                                    placeholder="Identity number"
                                    value={dependent.nricPassport}
                                    onChange={(e) =>
                                      setEditingDependents((prev) =>
                                        prev.map((item, i) =>
                                          i === index ? { ...item, nricPassport: e.target.value } : item
                                        )
                                      )
                                    }
                                  />
                                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                                </div>
                              </div>
                              {editingMemberDraft.idType === "Passport" && (
                                <div className="space-y-1.5">
                                  <label className="text-sm font-medium text-slate-700">Dependent Passport Expiry Date <span className="text-red-500">*</span></label>
                                  <div className="relative">
                                    <input
                                      type="date"
                                      className="w-full glass-input pl-10 pr-4 py-2.5"
                                      value={dependent.passportExpiry}
                                      onChange={(e) =>
                                        setEditingDependents((prev) =>
                                          prev.map((item, i) =>
                                            i === index ? { ...item, passportExpiry: e.target.value } : item
                                          )
                                        )
                                      }
                                    />
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                                  </div>
                                </div>
                              )}
                            </div>
                            {!editingDependentSharedLimit && (
                              <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 space-y-3">
                                <p className="text-sm font-semibold text-slate-800">Dependent Allocation</p>
                                {editingPlanType === "lump_sum" ? (
                                  <div className="space-y-1.5 md:flex md:items-center md:gap-6 md:space-y-0">
                                    <label className="text-sm font-medium text-slate-700 md:w-56 md:shrink-0">Allocated Lump Sum Amount</label>
                                    <input
                                      type="number"
                                      min={0}
                                      className="w-full md:w-56 glass-input px-4 py-2.5"
                                      value={dependent.lumpSumLimit}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        setEditingDependents((prev) =>
                                          prev.map((item, i) =>
                                            i === index ? { ...item, lumpSumLimit: raw === "" ? "" : Number(raw) } : item
                                          )
                                        );
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.entries(editingCompany?.planConfig.categories || {})
                                      .filter(([key]) => editingPlanSelection?.[key])
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
                                              setEditingDependents((prev) =>
                                                prev.map((item, i) =>
                                                  i === index
                                                    ? {
                                                        ...item,
                                                        planLimits: {
                                                          ...item.planLimits,
                                                          [key]: raw === "" ? "" : Number(raw),
                                                        },
                                                      }
                                                    : item
                                                )
                                              );
                                            }}
                                          />
                                          <p className="text-[11px] text-slate-500">
                                            Family total: RM {getNumericLimit(editingPlanLimits?.[key]).toLocaleString("en-MY")}
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
                                  setEditingDependents((prev) => prev.filter((_, i) => i !== index));
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
                  </>
                )}
              </form>
            </div>
            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3">
              {memberEditError && <p className="mr-auto text-xs text-red-500 font-medium self-center">{memberEditError}</p>}
              <GlassButton variant="secondary" onClick={() => setIsMemberEditModalOpen(false)}>Cancel</GlassButton>
              <GlassButton onClick={saveMemberEdit}>Save Member</GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)} />
          <GlassCard className="w-full max-w-4xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <UserPlus className="w-6 h-6 text-sky-600" />
                  Create Admin Account
                </h2>
                <p className="text-sm text-slate-500 mt-1">Configure user access and profile details.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto p-8 custom-scrollbar">
              <form className="space-y-8">
                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                    Admin Profile
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Username <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="admin_user"
                          required
                          value={newAdminForm.adminId}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, adminId: e.target.value }))}
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Full Name</label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="Admin Name"
                          value={newAdminForm.fullName}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, fullName: normalizeName(e.target.value) }))}
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Email <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <input
                          type="email"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="admin@medisync.com"
                          required
                          value={newAdminForm.email}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, email: e.target.value }))}
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
                            value={newAdminContactPhoneParts.countryCode}
                            onChange={(e) =>
                              setNewAdminForm((prev) => ({
                                ...prev,
                                contactPhone: joinPhoneNumber(e.target.value, newAdminContactPhoneParts.localNumber),
                              }))
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
                          value={newAdminContactPhoneParts.localNumber}
                          onChange={(e) =>
                            setNewAdminForm((prev) => ({
                              ...prev,
                              contactPhone: joinPhoneNumber(newAdminContactPhoneParts.countryCode, e.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Second Contact Number</label>
                      <div className="flex gap-3">
                        <div className="relative w-28 shrink-0">
                          <select
                            className="w-full glass-input px-3 py-2.5 bg-transparent"
                            value={newAdminSecondaryPhoneParts.countryCode}
                            onChange={(e) =>
                              setNewAdminForm((prev) => ({
                                ...prev,
                                contactPhoneSecondary: joinPhoneNumber(e.target.value, newAdminSecondaryPhoneParts.localNumber),
                              }))
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
                          value={newAdminSecondaryPhoneParts.localNumber}
                          onChange={(e) =>
                            setNewAdminForm((prev) => ({
                              ...prev,
                              contactPhoneSecondary: joinPhoneNumber(newAdminSecondaryPhoneParts.countryCode, e.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Role <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <select
                          className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                          required
                          value={newAdminForm.role}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, role: e.target.value as "super_admin" | "admin" | "staff" }))}
                        >
                          <option value="super_admin">Super Admin</option>
                          <option value="admin">Admin</option>
                          <option value="staff">Staff</option>
                        </select>
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Position</label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full glass-input pl-10 pr-4 py-2.5"
                          placeholder="Operations Lead"
                          value={newAdminForm.position}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, position: e.target.value }))}
                        />
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700">Tier</label>
                      <div className="relative">
                        <select
                          className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                          value={newAdminForm.tier}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, tier: e.target.value as "Tier 1" | "Tier 2" }))}
                        >
                          <option value="Tier 1">Tier 1</option>
                          <option value="Tier 2">Tier 2</option>
                        </select>
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                    Security
                  </h3>
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <label className="text-sm font-bold text-slate-800">Initial Password Setup</label>
                      <div className="relative">
                        <input
                          type="password"
                          className="w-full bg-white border border-amber-200 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                          placeholder="••••••••"
                          required
                          value={newAdminForm.password}
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, password: e.target.value }))}
                        />
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      </div>
                      <p className="text-xs text-amber-700">
                        System will require a password change upon first login.
                      </p>
                    </div>
                  </div>
                </section>
              </form>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3 z-20">
              <GlassButton variant="secondary" onClick={() => setIsModalOpen(false)} className="px-6 hover:bg-slate-200 border-slate-300">Cancel</GlassButton>
              <GlassButton className="px-8 shadow-lg shadow-sky-500/20 bg-sky-600 hover:bg-sky-700 text-white border-none" onClick={saveNewAdminAccount}>Create Account</GlassButton>
            </div>

          </GlassCard>
        </div>
      )}

    </div>
  );
}

export default function UserManagementPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading users...</div>}>
      <UserManagementPageContent />
    </Suspense>
  );
}

// Subcomponent for role icon
function UserCog({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v1"/><path d="M19 12v1"/><path d="M21 10h-1"/><path d="M17 10h-1"/>
    </svg>
  );
}
