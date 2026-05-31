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
  UserCog,
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
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/basePath";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ensureMemberSeed,
  getDependentsByParent,
  getMemberDirectorySnapshot,
  isPrimaryMember,
  MemberDirectoryEntry,
  removeMemberDirectoryEntry,
  saveMemberDirectoryEntry,
  subscribeMemberDirectory,
} from "@/lib/memberSession";
import {
  getProviderDirectoryServerSnapshot,
  getProviderDirectorySnapshot,
  getVendorMembersSnapshot,
  normalizeProviderUserRole,
  refreshProviderDirectorySnapshot,
  refreshVendorMembersSnapshot,
  subscribeProviderDirectory,
  subscribeVendorMembers as subscribeProviderMembers,
  VendorMemberDirectoryEntry,
  saveVendorMember,
} from "@/lib/providerSession";
import {
  fetchAdminDirectory,
  fetchAdminSession,
  type AdminDirectoryEntry,
  type AdminRole,
} from "@/lib/adminSession";
import {
  canDeleteAdminResource,
  canOperateAdminPage,
  isAdminReadOnly,
} from "@/lib/adminPermissions";
import {
  DIAL_CODES,
  formatDateDisplay,
  formatPhoneForDisplay,
  joinPhoneNumber,
  normalizeName,
  normalizePhone,
  splitPhoneNumber,
} from "@/lib/formats";
import {
  ensureCompaniesStore,
  getCompaniesServerSnapshot,
  getCompaniesSnapshot,
  refreshCompaniesSnapshot,
  subscribeCompanies,
  upsertCompany,
  type CompanyPlanCategoryKey,
  type CompanyPlanType,
} from "@/lib/companyStore";
import {
  countConfiguredPlanLimits,
  countSelectedPlanBenefits,
  formatPlanTypeLabel,
  resolveMemberPlan,
} from "@/lib/memberPlan";

const EMPTY_CORPORATE_MEMBERS: MemberDirectoryEntry[] = [];
const EMPTY_VENDOR_MEMBERS: VendorMemberDirectoryEntry[] = [];
const EMPTY_ADMIN_MEMBERS: AdminDirectoryEntry[] = [];
const TODAY_KEY = new Date().toISOString().slice(0, 10);
const ADMIN_USERS_ROUTE = "/admin/users";
const NATIONALITIES = ["Malaysia", "Singapore", "Indonesia", "Thailand", "China", "India", "Japan", "Australia", "United Kingdom", "United States", "Other"];

const toVendorRoleLabel = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("doctor")) return "Doctor";
  if (normalized.includes("admin") || normalized.includes("owner")) return "Admin";
  return "";
};

const toVendorRoleDisplay = (value?: string | null) => {
  const label = toVendorRoleLabel(value);
  return label || value || "—";
};

type PassportRenewalRequest = {
  id: string;
  staffId: string;
  fullName: string;
  currentExpiry: string;
  newExpiry: string;
  fileName: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: string;
  reviewNote?: string;
  memberProfileId?: string;
  memberId?: string;
  companyUuid?: string;
};

type PassportRenewalRow = {
  id?: string | null;
  staff_id?: string | null;
  full_name?: string | null;
  current_expiry?: string | null;
  new_expiry?: string | null;
  file_name?: string | null;
  created_at?: string | null;
  status?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  member_profile_id?: string | null;
  member_id?: string | null;
  company_id?: string | null;
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

type ActionFeedback = {
  tone: "success" | "error";
  message: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

let adminSnapshot: AdminDirectoryEntry[] = EMPTY_ADMIN_MEMBERS;

const adminListeners = new Set<() => void>();

const subscribeAdminMembers = (listener: () => void) => {
  adminListeners.add(listener);
  return () => adminListeners.delete(listener);
};

const getAdminSnapshot = () => adminSnapshot;

const refreshAdminSnapshot = async () => {
  if (typeof window === "undefined") return;
  adminSnapshot = await fetchAdminDirectory();
  adminListeners.forEach((listener) => listener());
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
  const [currentAdminRole, setCurrentAdminRole] = useState<AdminRole | null>(null);
  const [adminRoleResolved, setAdminRoleResolved] = useState(false);
  const [usersDataLoaded, setUsersDataLoaded] = useState(false);
  const [passportRenewDraft, setPassportRenewDraft] = useState({
    expiryDate: "",
    fileName: "",
  });
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<
    | { type: "corporate"; member: MemberDirectoryEntry }
    | { type: "vendor"; member: VendorMemberDirectoryEntry }
    | null
  >(null);
  const [passportRenewals, setPassportRenewals] = useState<PassportRenewalRequest[]>([]);
  const [activeSection, setActiveSection] = useState<"corporate" | "vendor" | "admin">(initialSection);
  const [corporateFilter, setCorporateFilter] = useState<"all" | "active" | "inactive" | "expired_passport">(initialCorporateFilter);
  const [vendorFilter, setVendorFilter] = useState<"all" | "active" | "inactive">("all");
  const [adminFilter, setAdminFilter] = useState<"all" | "active" | "inactive">("all");
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [pendingAdminDeletion, setPendingAdminDeletion] = useState<AdminDirectoryEntry | null>(null);
  const [pendingPasswordReset, setPendingPasswordReset] = useState<AdminDirectoryEntry | null>(null);
  const [pendingMemberPasswordReset, setPendingMemberPasswordReset] = useState<{ type: "corporate"; member: MemberDirectoryEntry } | { type: "vendor"; member: VendorMemberDirectoryEntry } | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [newAdminForm, setNewAdminForm] = useState({
    adminId: "",
    fullName: "",
    email: "",
    role: "accountant" as AdminRole,
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
  const memberDirectory = useSyncExternalStore(subscribeMemberDirectory, getMemberDirectorySnapshot, () => EMPTY_CORPORATE_MEMBERS);
  const corporateMembers = useMemo(
    () => memberDirectory.filter((entry) => isPrimaryMember(entry)),
    [memberDirectory]
  );
  const providerDirectory = useSyncExternalStore(
    subscribeProviderDirectory,
    getProviderDirectorySnapshot,
    getProviderDirectoryServerSnapshot
  );
  const vendorMembers = useSyncExternalStore(
    subscribeProviderMembers,
    getVendorMembersSnapshot,
    () => EMPTY_VENDOR_MEMBERS
  );
  const adminMembers = useSyncExternalStore(
    subscribeAdminMembers,
    getAdminSnapshot,
    () => EMPTY_ADMIN_MEMBERS
  );
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const resolvedAdminRole = currentAdminRole ?? "accountant";
  const isUsersPageReadOnly = adminRoleResolved ? isAdminReadOnly(resolvedAdminRole, ADMIN_USERS_ROUTE) : false;
  const canOperateUsersPage = adminRoleResolved ? canOperateAdminPage(resolvedAdminRole, ADMIN_USERS_ROUTE) : false;
  const canDeleteUsersResource = adminRoleResolved ? canDeleteAdminResource(resolvedAdminRole) : false;
  const isUsersDataLoading = !usersDataLoaded;
  const showActionFeedback = useCallback((message: string, tone: ActionFeedback["tone"] = "success") => {
    setActionFeedback({ tone, message });
  }, []);

  const refreshPassportRenewals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("passport_renewal_requests")
        .select(
          "id,member_profile_id,member_id,company_id,staff_id,full_name,current_expiry,new_expiry,file_name,status,created_at,reviewed_at,review_note"
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const next = ((data as PassportRenewalRow[] | null) || []).map((row) => ({
        id: String(row.id || ""),
        staffId: String(row.staff_id || ""),
        fullName: String(row.full_name || ""),
        currentExpiry: row.current_expiry ? String(row.current_expiry) : "",
        newExpiry: row.new_expiry ? String(row.new_expiry) : "",
        fileName: String(row.file_name || ""),
        submittedAt: row.created_at ? String(row.created_at) : "",
        status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
        reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
        reviewNote: row.review_note ? String(row.review_note) : undefined,
        memberProfileId: row.member_profile_id ? String(row.member_profile_id) : undefined,
        memberId: row.member_id ? String(row.member_id) : undefined,
        companyUuid: row.company_id ? String(row.company_id) : undefined,
      })) as PassportRenewalRequest[];
      setPassportRenewals(next);
    } catch {
      setPassportRenewals([]);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    ensureCompaniesStore();
    void Promise.allSettled([
      ensureMemberSeed(true),
      refreshProviderDirectorySnapshot(),
      refreshVendorMembersSnapshot(),
      refreshAdminSnapshot(),
      refreshCompaniesSnapshot(),
      refreshPassportRenewals(),
    ]).finally(() => {
      if (!cancelled) setUsersDataLoaded(true);
    });
    void (async () => {
      try {
        const session = await fetchAdminSession();
        if (!cancelled) setCurrentAdminRole(session?.role || "accountant");
      } catch {
        if (!cancelled) setCurrentAdminRole("accountant");
      } finally {
        if (!cancelled) setAdminRoleResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPassportRenewals]);

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
  const formatUsersMetric = (value: string | number) =>
    isUsersDataLoading ? "Loading..." : String(value);
  const passportPendingSummary = isUsersDataLoading
    ? "Loading..."
    : `${passportRenewals.filter((item) => item.status === "pending").length} Pending`;

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'super_admin': return <ShieldCheck className="w-4 h-4 text-purple-500" />;
      case 'admin': return <UserCog className="w-4 h-4 text-sky-500" />;
      case 'accountant': return <UserCog className="w-4 h-4 text-emerald-500" />;
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
    if (!canOperateUsersPage) return;
    if (!newAdminForm.adminId || !newAdminForm.fullName || !newAdminForm.email || !newAdminForm.password) return;
    try {
      const response = await fetch(withBasePath("/api/admin/admin-users/create-user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId: newAdminForm.adminId,
          fullName: normalizeName(newAdminForm.fullName),
          email: newAdminForm.email,
          password: newAdminForm.password,
          role: newAdminForm.role,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to create admin user.");
      }
      await refreshAdminSnapshot();
      setNewAdminForm({
        adminId: "",
        fullName: "",
        email: "",
        role: "accountant",
        contactPhone: "",
        contactPhoneSecondary: "",
        password: "",
      });
      setIsModalOpen(false);
      showActionFeedback(`Admin account ${newAdminForm.adminId} created successfully.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to create admin user."), "error");
    }
  };

  const toggleCorporateMemberStatus = async (member: MemberDirectoryEntry) => {
    const nextStatus = member.status === "Active" ? "Disabled" : "Active";
    try {
      await saveMemberDirectoryEntry({
        ...member,
        status: nextStatus,
      });
      showActionFeedback(`${member.staffId} is now ${nextStatus}.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to update member status."), "error");
    }
  };

  const toggleVendorMemberStatus = async (member: VendorMemberDirectoryEntry) => {
    const nextStatus = member.status === "Active" ? "Disabled" : "Active";
    try {
      await saveVendorMember({
        ...member,
        status: nextStatus,
      });
      showActionFeedback(`${member.memberId} is now ${nextStatus}.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to update vendor member status."), "error");
    }
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
      role: toVendorRoleLabel(member.role),
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
      hasExistingAccount: !!member.profileId,
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
        await upsertCompany({
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
      }
      await saveMemberDirectoryEntry({
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
      const removedDependentIds = existingDependentIds.filter(
        (staffId) => !editingDependents.some((dep) => dep.staffId === staffId)
      );
      await Promise.all(removedDependentIds.map((staffId) => removeMemberDirectoryEntry(editingMemberDraft.companyId, staffId)));

      for (let index = 0; index < editingDependents.length; index++) {
        const dependent = editingDependents[index];
        const dependentStaffId = dependent.staffId || `${editingMemberDraft.staffId}-DEP-${index + 1}`;
        const dependentPlanLimits =
          editingPlanType === "category"
            ? (Object.entries(familyPlanLimits) as Array<[CompanyPlanCategoryKey, number]>).reduce<Record<string, number>>((acc, [key]) => {
                acc[key] = editingDependentSharedLimit ? familyPlanLimits[key] : getNumericLimit(dependent.planLimits?.[key]);
                return acc;
              }, {})
            : {};
        await saveMemberDirectoryEntry({
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
      }
    } else {
      if (!editingMemberDraft.role || !["Admin", "Doctor"].includes(editingMemberDraft.role)) {
        setMemberEditError("Vendor member role must be Admin or Doctor.");
        return;
      }
      if (!editingVendorCredential.password && !editingVendorCredential.hasExistingAccount) {
        setMemberEditError("Login password is required because this member has no existing login account.");
        return;
      }
      const requestPayload: Record<string, unknown> = {
        vendorId: editingMemberDraft.vendorId,
        memberCode: editingMemberDraft.memberId,
        fullName: normalizeName(editingMemberDraft.fullName),
        email: editingMemberDraft.email,
        phone: normalizePhone(editingMemberDraft.phone) || undefined,
        role: normalizeProviderUserRole(editingMemberDraft.role) || editingMemberDraft.role || "provider_user",
        status: editingMemberDraft.status === "Disabled" ? "disabled" : "active",
      };
      if (editingVendorCredential.password) requestPayload.password = editingVendorCredential.password;

      const response = await fetch(withBasePath("/api/admin/providers/create-user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setMemberEditError(payload.error || "Unable to save vendor member login.");
        return;
      }
      await refreshVendorMembersSnapshot();
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
    showActionFeedback(
      editingMemberType === "corporate"
        ? `Member ${editingMemberDraft.staffId} updated successfully.`
        : `Vendor member ${editingMemberDraft.memberId} updated successfully.`
    );
  };

  const resetCorporateMemberPassword = async (member: MemberDirectoryEntry, newPassword: string) => {
    try {
      const response = await fetch(withBasePath("/api/admin/members/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: member.companyId, staffId: member.staffId, newPassword }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to reset member password.");
      }
      showActionFeedback(`Password for ${member.staffId} has been reset. Please inform the user of their new password.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to reset member password."), "error");
    }
  };

  const resetVendorMemberPassword = async (member: VendorMemberDirectoryEntry, newPassword: string) => {
    try {
      const response = await fetch(withBasePath("/api/admin/providers/create-user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: member.vendorId,
          memberCode: member.memberId,
          fullName: normalizeName(member.fullName),
          email: member.email,
          password: newPassword,
          phone: normalizePhone(member.phone) || undefined,
          role: normalizeProviderUserRole(member.role) || member.role || "provider_user",
          status: member.status === "Disabled" ? "disabled" : "active",
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to reset vendor member password.");
      }
      showActionFeedback(`Password for ${member.memberId} has been reset. Please inform the user of their new password.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to reset vendor member password."), "error");
    }
  };

  const resetAdminMemberPassword = async (member: AdminDirectoryEntry, newPassword: string) => {
    if (!canOperateUsersPage) {
      showActionFeedback("You do not have permission to reset passwords.", "error");
      return;
    }
    if (!member.profileId) {
      showActionFeedback("Admin profile is missing.", "error");
      return;
    }
    try {
      const response = await fetch(withBasePath("/api/admin/admin-users/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: member.profileId, newPassword }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to reset admin password.");
      }
      showActionFeedback(`Password for ${member.adminId} has been reset. Please inform the user of their new password.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to reset admin password."), "error");
    }
  };

  const confirmResetPassword = async () => {
    if (!pendingPasswordReset) return;
    if (!resetPasswordValue.trim()) {
      showActionFeedback("Enter a new password.", "error");
      return;
    }
    if (resetPasswordValue !== resetPasswordConfirm) {
      showActionFeedback("Passwords do not match.", "error");
      return;
    }
    await resetAdminMemberPassword(pendingPasswordReset, resetPasswordValue);
    setPendingPasswordReset(null);
    setResetPasswordValue("");
    setResetPasswordConfirm("");
  };

  const openPasswordResetModal = (member: AdminDirectoryEntry) => {
    setPendingPasswordReset(member);
    setResetPasswordValue("");
    setResetPasswordConfirm("");
  };

  const confirmMemberPasswordReset = async () => {
    if (!pendingMemberPasswordReset) return;
    if (!resetPasswordValue.trim()) {
      showActionFeedback("Enter a new password.", "error");
      return;
    }
    if (resetPasswordValue !== resetPasswordConfirm) {
      showActionFeedback("Passwords do not match.", "error");
      return;
    }
    if (pendingMemberPasswordReset.type === "corporate") {
      await resetCorporateMemberPassword(pendingMemberPasswordReset.member, resetPasswordValue);
    } else {
      await resetVendorMemberPassword(pendingMemberPasswordReset.member, resetPasswordValue);
    }
    setPendingMemberPasswordReset(null);
    setResetPasswordValue("");
    setResetPasswordConfirm("");
  };

  const openMemberPasswordResetModal = (member: { type: "corporate"; member: MemberDirectoryEntry } | { type: "vendor"; member: VendorMemberDirectoryEntry }) => {
    setPendingMemberPasswordReset(member);
    setResetPasswordValue("");
    setResetPasswordConfirm("");
  };

  const deleteAdminMember = async (member: AdminDirectoryEntry) => {
    if (!canDeleteUsersResource) return;
    if (!member.profileId) {
      showActionFeedback("Admin profile is missing.", "error");
      return;
    }
    setPendingAdminDeletion(member);
  };

  const confirmDeleteAdminMember = async () => {
    if (!pendingAdminDeletion?.profileId) {
      setPendingAdminDeletion(null);
      showActionFeedback("Admin profile is missing.", "error");
      return;
    }
    try {
      const response = await fetch(withBasePath("/api/admin/admin-users/delete-user"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: pendingAdminDeletion.profileId, adminId: pendingAdminDeletion.adminId }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to delete admin user.");
      }
      await refreshAdminSnapshot();
      showActionFeedback(`Admin account ${pendingAdminDeletion.adminId} deleted successfully.`);
      setPendingAdminDeletion(null);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to delete admin user."), "error");
    }
  };

  const openPassportRenewModal = (member: MemberDirectoryEntry) => {
    setPassportRenewMember(member);
    setPassportRenewDraft({
      expiryDate: member.passportExpiry || "",
      fileName: member.passportFileName || "",
    });
  };

  const submitPassportRenewal = async () => {
    if (!passportRenewMember || !passportRenewDraft.expiryDate || !passportRenewDraft.fileName) return;
    if (!passportRenewMember.profileId) {
      showActionFeedback("Member profile is missing. Create member Auth/profile first before submitting a passport renewal request.", "error");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        member_profile_id: passportRenewMember.profileId,
        member_id: passportRenewMember.memberUuid || null,
        company_id: passportRenewMember.companyUuid || null,
        staff_id: passportRenewMember.staffId,
        full_name: passportRenewMember.fullName,
        current_expiry: passportRenewMember.passportExpiry || null,
        new_expiry: passportRenewDraft.expiryDate,
        file_name: passportRenewDraft.fileName,
        status: "pending",
      };
      const { error } = await supabase.from("passport_renewal_requests").insert(payload);
      if (error) throw error;
      await refreshPassportRenewals();
      setPassportRenewMember(null);
      setPassportRenewDraft({ expiryDate: "", fileName: "" });
      showActionFeedback(`Passport renewal request submitted for ${passportRenewMember.staffId}.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to submit passport renewal request."), "error");
    }
  };

  const reviewPassportRenewal = async (requestId: string, status: "approved" | "rejected") => {
    const target = passportRenewals.find((request) => request.id === requestId);
    if (!target) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reviewerProfileId = sessionData.session?.user?.id ? String(sessionData.session.user.id) : null;
      const reviewedAt = new Date().toISOString();

      const { error } = await supabase
        .from("passport_renewal_requests")
        .update({
          status,
          reviewed_at: reviewedAt,
          reviewed_by_profile_id: reviewerProfileId,
          review_note: status === "approved" ? "Passport renewal approved" : "Passport renewal rejected",
          updated_at: reviewedAt,
        })
        .eq("id", requestId);
      if (error) throw error;

      if (status === "approved" && target.companyUuid && target.staffId) {
        const { error: memberError } = await supabase
          .from("members")
          .update({
            passport_expiry: target.newExpiry || null,
            passport_file_path: target.fileName || null,
            status: "active",
          })
          .eq("company_id", target.companyUuid)
          .eq("staff_id", target.staffId);
        if (memberError) throw memberError;
        await ensureMemberSeed(true);
      }

      await refreshPassportRenewals();
      showActionFeedback(`${target.staffId} passport renewal ${status === "approved" ? "approved" : "rejected"}.`);
    } catch (error) {
      showActionFeedback(getErrorMessage(error, "Unable to review passport renewal request."), "error");
    }
  };

  const renderCorporateActions = (member: MemberDirectoryEntry) => {
    if (isUsersPageReadOnly) return null;
    return (
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
        onClick={() => openMemberPasswordResetModal({ type: "corporate", member })}
      >
        <KeyRound className="w-4 h-4" />
      </GlassButton>
      {isPassportExpired(member) && member.memberType !== "dependent" && (
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
  };

  const renderVendorActions = (member: VendorMemberDirectoryEntry) => {
    if (isUsersPageReadOnly) return null;
    return (
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
        onClick={() => openMemberPasswordResetModal({ type: "vendor", member })}
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
  };

  const renderAdminActions = (member: AdminDirectoryEntry) => {
    if (isUsersPageReadOnly) return null;
    return (
    <>
      {canOperateUsersPage && (
      <GlassButton
        variant="ghost"
        className="h-9 w-9 p-0 flex items-center justify-center text-indigo-600 hover:text-indigo-700"
        title="Reset Password"
        onClick={() => openPasswordResetModal(member)}
      >
        <UserCog className="w-4 h-4" />
      </GlassButton>
      )}
      {canDeleteUsersResource && (
        <GlassButton
          variant="ghost"
          className="h-9 w-9 p-0 flex items-center justify-center text-rose-600 hover:text-rose-700"
          title="Delete Account"
          onClick={() => void deleteAdminMember(member)}
        >
          <XCircle className="w-4 h-4" />
        </GlassButton>
      )}
    </>
    );
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">User Management</h1>
          <p className="text-slate-500">Monitor corporate, vendor, and admin access from one place.</p>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3 flex items-start justify-between gap-3",
            actionFeedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          )}
          role={actionFeedback.tone === "error" ? "alert" : "status"}
        >
          <div className="flex items-start gap-3">
            {actionFeedback.tone === "success" ? (
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 mt-0.5 shrink-0" />
            )}
            <p className="text-sm font-medium">{actionFeedback.message}</p>
          </div>
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-wide opacity-70 hover:opacity-100"
            onClick={() => setActionFeedback(null)}
          >
            Dismiss
          </button>
        </div>
      )}

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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(corporateStats.total)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(corporateStats.active)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(corporateStats.disabled)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(corporateStats.expiredPassport)}</p>
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
                  {passportPendingSummary}
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
                    {!isUsersDataLoading && passportRenewals.slice(0, 8).map((request) => (
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
                    {isUsersDataLoading && (
                      <tr>
                        <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-400">Loading passport renewal requests...</td>
                      </tr>
                    )}
                    {!isUsersDataLoading && passportRenewals.length === 0 && (
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
                  {passportPendingSummary}
                </span>
              </div>
              {!isUsersDataLoading && passportRenewals.slice(0, 8).map((request) => (
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
              {isUsersDataLoading && <div className="py-6 text-center text-sm text-slate-400">Loading passport renewal requests...</div>}
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
                {!isUsersDataLoading && filteredCorporateMembers.map((member) => (
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
                {isUsersDataLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">Loading corporate members...</td>
                  </tr>
                )}
                {!isUsersDataLoading && filteredCorporateMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">No corporate members yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>}
            mobile={<div className="p-4 space-y-3">
              {!isUsersDataLoading && filteredCorporateMembers.map((member) => (
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
              {isUsersDataLoading && <div className="py-6 text-center text-sm text-slate-400">Loading corporate members...</div>}
              {!isUsersDataLoading && filteredCorporateMembers.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No corporate members yet.</div>}
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(vendorStats.total)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(vendorStats.active)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(vendorStats.disabled)}</p>
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
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {!isUsersDataLoading && filteredVendorMembers.map((member) => (
                  <tr key={`${member.vendorId}-${member.memberId}`} className="hover:bg-white/30 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        className="font-semibold text-slate-700 hover:text-sky-700 transition-colors"
                        onClick={() => setSelectedMemberProfile({ type: "vendor", member })}
                      >
                        {member.fullName}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">{member.vendorId}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{member.memberId}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{toVendorRoleDisplay(member.role)}</td>
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
                {isUsersDataLoading && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">Loading vendor members...</td>
                  </tr>
                )}
                {!isUsersDataLoading && filteredVendorMembers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-sm text-slate-400">No vendor members yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>}
            mobile={<div className="p-4 space-y-3">
              {!isUsersDataLoading && filteredVendorMembers.map((member) => (
                <MobileRecordCard
                  key={`${member.vendorId}-${member.memberId}`}
                  title={<button type="button" className="text-left hover:text-sky-700 transition-colors" onClick={() => setSelectedMemberProfile({ type: "vendor", member })}>{member.fullName}</button>}
                  subtitle={`${member.memberId} • ${providerDirectory.find((provider) => provider.vendorId === member.vendorId)?.providerName || member.vendorId}`}
                  badge={<span className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", member.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{member.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{member.status}</span>}
                  footer={<div className="flex flex-wrap justify-end gap-2">{renderVendorActions(member)}</div>}
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendor ID</p>
                    <p className="mt-1 text-sm text-slate-700">{member.vendorId}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</p>
                    <p className="mt-1 text-sm text-slate-700">{toVendorRoleDisplay(member.role)}</p>
                  </div>
                </MobileRecordCard>
              ))}
              {isUsersDataLoading && <div className="py-6 text-center text-sm text-slate-400">Loading vendor members...</div>}
              {!isUsersDataLoading && filteredVendorMembers.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No vendor members yet.</div>}
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
            <p className="text-sm text-slate-500">Internal console access for Medisync admins and accountants.</p>
          </div>
          {canOperateUsersPage && (
            <GlassButton onClick={() => setIsModalOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Create Admin User
            </GlassButton>
          )}
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(adminStats.total)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(adminStats.active)}</p>
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
              <p className="text-2xl font-bold text-slate-800">{formatUsersMetric(adminStats.disabled)}</p>
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
              <option>Accountant</option>
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
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Username</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Login</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {!isUsersDataLoading && filteredAdminMembersByStatus.map((user) => (
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
                      <span className="text-sm font-mono text-slate-700">{user.adminId}</span>
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
                    <td className="px-6 py-4 text-right"><div className="flex justify-end gap-2">{renderAdminActions(user)}</div></td>
                  </tr>
                ))}
                {isUsersDataLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-400">Loading admin users...</td>
                  </tr>
                )}
                {!isUsersDataLoading && filteredAdminMembersByStatus.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-400">No admin users yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>}
          mobile={<div className="space-y-3">
            {!isUsersDataLoading && filteredAdminMembersByStatus.map((user) => (
              <MobileRecordCard
                key={user.adminId}
                title={user.fullName}
                subtitle={user.adminId}
                badge={<span className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", user.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{user.status === "Active" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{user.status}</span>}
                footer={<div className="flex flex-wrap justify-end gap-2">{renderAdminActions(user)}</div>}
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
            {isUsersDataLoading && <GlassCard className="p-6 text-center text-sm text-slate-400">Loading admin users...</GlassCard>}
            {!isUsersDataLoading && filteredAdminMembersByStatus.length === 0 && <GlassCard className="p-6 text-center text-sm text-slate-400">No admin users yet.</GlassCard>}
          </div>}
        />
      </section>
      )}

      {selectedMemberProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm transition-all duration-300">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm transition-all duration-300">
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
                          onChange={(e) => setEditingMemberDraft((prev) => ({ ...prev, fullName: e.target.value }))}
                          onBlur={() => setEditingMemberDraft((prev) => ({ ...prev, fullName: normalizeName(prev.fullName) }))}
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
                                          i === index ? { ...item, fullName: e.target.value } : item
                                        )
                                      )
                                    }
                                    onBlur={() =>
                                      setEditingDependents((prev) =>
                                        prev.map((item, i) =>
                                          i === index ? { ...item, fullName: normalizeName(item.fullName) } : item
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

      {canOperateUsersPage && isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm transition-all duration-300">
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
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, fullName: e.target.value }))}
                          onBlur={() => setNewAdminForm((prev) => ({ ...prev, fullName: normalizeName(prev.fullName) }))}
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
                          onChange={(e) => setNewAdminForm((prev) => ({ ...prev, role: e.target.value as AdminRole }))}
                        >
                          <option value="super_admin">Super Admin</option>
                          <option value="admin">Admin</option>
                          <option value="accountant">Accountant</option>
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

      {pendingPasswordReset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => { setPendingPasswordReset(null); setResetPasswordValue(""); setResetPasswordConfirm(""); }} />
          <GlassCard className="relative w-full max-w-md border-white/80 bg-white/95 shadow-2xl">
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">Reset Password</h2>
              <p className="text-sm text-slate-600">
                Set a new password for <span className="font-semibold text-slate-800">{pendingPasswordReset.adminId}</span>.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 ml-1">New Password</label>
                <input
                  type="password"
                  className="w-full glass-input px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/50"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 ml-1">Confirm Password</label>
                <input
                  type="password"
                  className="w-full glass-input px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/50"
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <GlassButton
                variant="secondary"
                onClick={() => { setPendingPasswordReset(null); setResetPasswordValue(""); setResetPasswordConfirm(""); }}
                className="px-5 hover:bg-slate-200 border-slate-300"
              >
                Cancel
              </GlassButton>
              <GlassButton
                onClick={() => void confirmResetPassword()}
                className="px-5 bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-none"
              >
                Reset Password
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {pendingMemberPasswordReset && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => { setPendingMemberPasswordReset(null); setResetPasswordValue(""); setResetPasswordConfirm(""); }} />
          <GlassCard className="relative w-full max-w-md border-white/80 bg-white/95 shadow-2xl">
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800">Reset Password</h2>
              <p className="text-sm text-slate-600">
                Set a new password for{" "}
                <span className="font-semibold text-slate-800">
                  {pendingMemberPasswordReset.type === "corporate"
                    ? pendingMemberPasswordReset.member.staffId
                    : pendingMemberPasswordReset.member.memberId}
                </span>.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 ml-1">New Password</label>
                <input
                  type="password"
                  className="w-full glass-input px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/50"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500 ml-1">Confirm Password</label>
                <input
                  type="password"
                  className="w-full glass-input px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/50"
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <GlassButton
                variant="secondary"
                onClick={() => { setPendingMemberPasswordReset(null); setResetPasswordValue(""); setResetPasswordConfirm(""); }}
                className="px-5 hover:bg-slate-200 border-slate-300"
              >
                Cancel
              </GlassButton>
              <GlassButton
                onClick={() => void confirmMemberPasswordReset()}
                className="px-5 bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-none"
              >
                Reset Password
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {pendingAdminDeletion && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setPendingAdminDeletion(null)} />
          <GlassCard className="relative w-full max-w-md border-white/80 bg-white/95 shadow-2xl">
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-slate-800">Delete Admin Account?</h2>
              <p className="text-sm text-slate-600">
                {pendingAdminDeletion.adminId} will lose console access permanently. This action cannot be undone.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <GlassButton
                variant="secondary"
                onClick={() => setPendingAdminDeletion(null)}
                className="px-5 hover:bg-slate-200 border-slate-300"
              >
                Cancel
              </GlassButton>
              <GlassButton
                onClick={() => void confirmDeleteAdminMember()}
                className="px-5 bg-rose-600 hover:bg-rose-700 text-white border-transparent shadow-none"
              >
                Delete Account
              </GlassButton>
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
