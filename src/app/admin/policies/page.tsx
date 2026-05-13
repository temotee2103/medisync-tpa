"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { 
  Search, 
  User, 
  Shield, 
  CreditCard, 
  Calendar,
  ChevronRight,
  Info,
  Settings,
  Save,
  FileText,
  CheckSquare,
  LayoutDashboard,
  List,
  AlertTriangle,
  Plus,
  XCircle,
  Users
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ensureMemberSeed, getMemberDirectory } from "@/lib/memberSession";
import { ensureCompanySeed, getCompanies, saveCompany } from "@/lib/companyStore";

// Mock Data
const POLICIES = [
  { 
    id: "POL-8823-01", 
    companyId: "CMP-001",
    companyName: "TechCorp Malaysia",
    holder: "John Doe", 
    plan: "Gold Family Plus", 
    status: "Active", 
    expiry: "2024-12-31",
    nric: "850312-14-5567",
    coverage: { used: 1250, limit: 50000 },
    dependents: ["Jane Doe (Spouse)", "Jimmy Doe (Child)"]
  },
  { 
    id: "POL-9944-05", 
    companyId: "CMP-002",
    companyName: "LogiTrans Global",
    holder: "Sarah Williams", 
    plan: "Silver Corporate", 
    status: "Active", 
    expiry: "2024-06-15",
    nric: "921015-10-1234",
    coverage: { used: 0, limit: 20000 },
    dependents: []
  },
  { 
    id: "POL-1122-09", 
    companyId: "CMP-001",
    companyName: "TechCorp Malaysia",
    holder: "Michael Tan", 
    plan: "Platinum Global", 
    status: "Lapsed", 
    expiry: "2023-11-20",
    nric: "780520-01-8899",
    coverage: { used: 15000, limit: 100000 },
    dependents: ["Alice Tan (Spouse)"]
  },
];

type PolicyRecord = typeof POLICIES[number];

export default function PolicySearchPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [policies, setPolicies] = useState<PolicyRecord[]>(POLICIES);
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyRecord | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddPolicyModalOpen, setIsAddPolicyModalOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [addPolicyDraft, setAddPolicyDraft] = useState({
    memberKey: "",
    plan: "Gold Family Plus",
    status: "Active" as "Active" | "Lapsed",
    expiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    limit: 50000,
  });
  const [planConfig, setPlanConfig] = useState({
    type: 'category', // 'lump_sum' | 'category'
    lumpSumLimit: 50000,
    categories: {
      op: { label: 'Outpatient (OP)', limit: 2000, enabled: true },
      ip: { label: 'Rehabilitation', limit: 20000, enabled: true },
      ahs: { label: 'Annual Health Screening (AHS)', limit: 1000, enabled: true },
      dental: { label: 'Dental', limit: 500, enabled: true, excludeScaling: true, coverExtraction: true },
      sp: { label: 'Specialist (SP)', limit: 3000, enabled: true, requireReferral: true },
      tmc: { label: 'TCM / Alternate Medicine', limit: 500, enabled: false },
      glasses: { label: 'Optical / Glasses', limit: 300, enabled: false },
      others: { label: 'Others', limit: 1000, enabled: false }
    },
    dependents: {
      sharedLimit: true,
      maxChildren: 10,
    },
    autoDisablePassport: true
  });

  const updateCategory = (
    key: keyof typeof planConfig.categories,
    field: string,
    value: string | number | boolean
  ) => {
    setPlanConfig(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [key]: { ...prev.categories[key], [field]: value }
      }
    }));
  };

  const existingMembers = (() => {
    ensureMemberSeed();
    return getMemberDirectory();
  })();
  const companies = (() => {
    ensureCompanySeed();
    return getCompanies();
  })();
  const companyMap = useMemo(() => {
    return new Map(companies.map((company) => [company.companyId, company.name]));
  }, [companies]);

  const filteredPolicies = policies.filter((policy) => {
    const companyMatched = companyFilter === "all" || policy.companyId === companyFilter;
    if (!companyMatched) return false;
    return (
      policy.holder.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      policy.nric.includes(searchTerm)
    );
  });

  const filteredMembers = existingMembers.filter((member) => {
    const normalized = memberQuery.trim().toLowerCase();
    if (!normalized) return true;
    return (
      member.fullName.toLowerCase().includes(normalized) ||
      member.staffId.toLowerCase().includes(normalized) ||
      member.email.toLowerCase().includes(normalized)
    );
  });

  const openPolicyInfo = (policy: PolicyRecord) => {
    setSelectedPolicy(policy);
    setIsInfoModalOpen(true);
  };

  const openPolicyEdit = (policy: PolicyRecord) => {
    const company = companies.find((entry) => entry.companyId === policy.companyId);
    if (company?.planConfig) {
      setPlanConfig((prev) => ({
        ...prev,
        lumpSumLimit: policy.coverage.limit,
        categories: {
          ...company.planConfig.categories,
        },
        dependents: {
          ...company.planConfig.dependents,
        },
        autoDisablePassport: company.planConfig.autoDisablePassport,
      }));
    }
    setSelectedPolicy(policy);
    setIsEditModalOpen(true);
  };

  const savePolicyConfigChanges = () => {
    if (!selectedPolicy) return;
    const company = companies.find((entry) => entry.companyId === selectedPolicy.companyId);
    if (!company) return;
    saveCompany({
      ...company,
      planConfig: {
        ...company.planConfig,
        categories: planConfig.categories,
        autoDisablePassport: planConfig.autoDisablePassport,
        dependents: planConfig.dependents,
      },
    });
    setPolicies((prev) =>
      prev.map((item) =>
        item.companyId === selectedPolicy.companyId
          ? {
              ...item,
              coverage: {
                ...item.coverage,
                limit: planConfig.type === "lump_sum" ? planConfig.lumpSumLimit : item.coverage.limit,
              },
            }
          : item
      )
    );
    setIsEditModalOpen(false);
  };

  const createPolicyFromMember = () => {
    const selectedMember = existingMembers.find(
      (member) => `${member.companyId}::${member.staffId}` === addPolicyDraft.memberKey
    );
    if (!selectedMember) return;
    const sequence = String(policies.length + 1).padStart(4, "0");
    const expiryMonth = String(new Date(addPolicyDraft.expiry || "1970-01-01").getMonth() + 1).padStart(2, "0");
    const nextPolicy: PolicyRecord = {
      id: `POL-${sequence}-${expiryMonth}`,
      companyId: selectedMember.companyId,
      companyName: companyMap.get(selectedMember.companyId) || selectedMember.companyId,
      holder: selectedMember.fullName,
      plan: addPolicyDraft.plan,
      status: addPolicyDraft.status,
      expiry: addPolicyDraft.expiry,
      nric: selectedMember.nricPassport || selectedMember.staffId,
      coverage: {
        used: 0,
        limit: addPolicyDraft.limit,
      },
      dependents: [],
    };
    setPolicies((prev) => [nextPolicy, ...prev]);
    setSelectedPolicy(nextPolicy);
    setIsAddPolicyModalOpen(false);
    setMemberQuery("");
    setAddPolicyDraft((prev) => ({ ...prev, memberKey: "" }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-800">Policy Management</h1>
          <p className="text-slate-500">Search and verify member eligibility.</p>
        </div>
        <GlassButton className="gap-2" onClick={() => setIsAddPolicyModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Member Policy
        </GlassButton>
      </div>

      <div className="space-y-4">
        
        {/* Left Column: Search & Results */}
        <div className="space-y-4">
          <GlassCard className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  placeholder="Search Member ID, Name, or NRIC..." 
                  className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
              </div>
              <select
                className="w-full md:w-64 glass-select px-3 py-2.5 text-sm"
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="all">All Companies</option>
                {companies.map((company) => (
                  <option key={company.companyId} value={company.companyId}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </GlassCard>

          <GlassCard className="overflow-hidden p-0 border-white/40">
            <div className="overflow-x-auto max-h-[calc(100vh-20rem)] custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-white/60 border-b border-white/60">
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Policy ID</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Company</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Holder</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Expiry</th>
                    <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20">
                  {filteredPolicies.map((policy) => (
                    <tr
                      key={policy.id}
                      className="transition-colors hover:bg-white/30"
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700">{policy.id}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{policy.companyName}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{policy.holder}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{policy.plan}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
                          policy.status === 'Active' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        )}>
                          {policy.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{policy.expiry}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <GlassButton
                            variant="secondary"
                            className="h-9 w-9 p-0"
                            title="Info"
                            onClick={() => openPolicyInfo(policy)}
                          >
                            <Info className="w-4 h-4" />
                          </GlassButton>
                          <GlassButton
                            variant="ghost"
                            className="h-9 w-9 p-0"
                            title="Adjust Plan"
                            onClick={() => openPolicyEdit(policy)}
                          >
                            <Settings className="w-4 h-4" />
                          </GlassButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredPolicies.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-slate-400 py-8 text-sm italic">No members found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

      </div>

      {isAddPolicyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-0" onClick={() => setIsAddPolicyModalOpen(false)} />
          <GlassCard className="w-full max-w-3xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Plus className="w-6 h-6 text-sky-600" />
                  Add Member Policy
                </h2>
                <p className="text-sm text-slate-500 mt-1">Select existing member and assign a new policy.</p>
              </div>
              <button
                onClick={() => setIsAddPolicyModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Search Existing Members</label>
                <input
                  type="text"
                  className="w-full glass-input px-4 py-2.5"
                  placeholder="Search by name, staff ID, or email"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
                <div className="max-h-56 overflow-y-auto rounded-xl border border-white/60 bg-white/40 divide-y divide-white/50">
                  {filteredMembers.map((member) => {
                    const memberKey = `${member.companyId}::${member.staffId}`;
                    return (
                      <button
                        key={memberKey}
                        className={cn(
                          "w-full px-4 py-3 text-left transition-colors",
                          addPolicyDraft.memberKey === memberKey ? "bg-sky-50" : "hover:bg-white/60"
                        )}
                        onClick={() => setAddPolicyDraft((prev) => ({ ...prev, memberKey }))}
                      >
                        <p className="text-sm font-semibold text-slate-800">{member.fullName}</p>
                        <p className="text-xs text-slate-500">{member.staffId} • {member.email}</p>
                      </button>
                    );
                  })}
                  {filteredMembers.length === 0 && (
                    <p className="px-4 py-6 text-sm text-slate-400 text-center">No members match this search.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Plan</label>
                  <select
                    className="w-full glass-input px-3 py-2.5 bg-transparent"
                    value={addPolicyDraft.plan}
                    onChange={(e) => setAddPolicyDraft((prev) => ({ ...prev, plan: e.target.value }))}
                  >
                    <option>Gold Family Plus</option>
                    <option>Silver Corporate</option>
                    <option>Platinum Global</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Status</label>
                  <select
                    className="w-full glass-input px-3 py-2.5 bg-transparent"
                    value={addPolicyDraft.status}
                    onChange={(e) => setAddPolicyDraft((prev) => ({ ...prev, status: e.target.value as "Active" | "Lapsed" }))}
                  >
                    <option value="Active">Active</option>
                    <option value="Lapsed">Lapsed</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Expiry Date</label>
                  <input
                    type="date"
                    className="w-full glass-input px-3 py-2.5"
                    value={addPolicyDraft.expiry}
                    onChange={(e) => setAddPolicyDraft((prev) => ({ ...prev, expiry: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Annual Limit (RM)</label>
                  <input
                    type="number"
                    className="w-full glass-input px-3 py-2.5"
                    value={addPolicyDraft.limit}
                    onChange={(e) => setAddPolicyDraft((prev) => ({ ...prev, limit: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>

            <div className="px-8 py-4 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setIsAddPolicyModalOpen(false)}>
                Cancel
              </GlassButton>
              <GlassButton
                disabled={!addPolicyDraft.memberKey}
                onClick={createPolicyFromMember}
              >
                Create Policy
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {isInfoModalOpen && selectedPolicy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-0" onClick={() => setIsInfoModalOpen(false)} />
          <GlassCard className="w-full max-w-4xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-sky-500 text-white flex items-center justify-center">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">{selectedPolicy.holder}</h2>
                  <p className="text-slate-500 flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4" />
                    {selectedPolicy.plan}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInfoModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="overflow-y-auto p-8 custom-scrollbar space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Member Information
                  </h3>
                  <div className="space-y-3 bg-white/30 p-4 rounded-2xl border border-white/40">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Member ID</span>
                      <span className="text-sm font-semibold text-slate-800">{selectedPolicy.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">NRIC / Passport</span>
                      <span className="text-sm font-semibold text-slate-800">{selectedPolicy.nric}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Expiry Date</span>
                      <span className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {selectedPolicy.expiry}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-500">Membership Status</span>
                      <span className={cn(
                        "text-sm font-semibold",
                        selectedPolicy.status === "Active" ? "text-emerald-600" : "text-red-600"
                      )}>
                        {selectedPolicy.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Coverage Summary
                  </h3>
                  <div className="space-y-4 bg-sky-500/5 p-4 rounded-2xl border border-sky-100">
                    <div className="flex justify-between items-end">
                      <span className="text-sm text-slate-600">Utilized Balance</span>
                      <div className="text-right">
                        <span className="text-xl font-bold text-slate-800">RM {selectedPolicy.coverage.used.toLocaleString()}</span>
                        <span className="text-xs text-slate-400 block">out of RM {selectedPolicy.coverage.limit.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 transition-all duration-500"
                        style={{ width: `${(selectedPolicy.coverage.used / selectedPolicy.coverage.limit) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dependents Coverage</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedPolicy.dependents.length > 0 ? (
                    selectedPolicy.dependents.map((dep) => (
                      <div key={dep} className="flex items-center justify-between p-3 bg-white/40 rounded-xl border border-white/60">
                        <span className="text-sm font-medium text-slate-700">{dep}</span>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 italic">No dependents enrolled in this plan.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 py-4 border-t border-slate-200/60 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setIsInfoModalOpen(false)}>
                Close
              </GlassButton>
              <GlassButton
                onClick={() => {
                  setIsInfoModalOpen(false);
                  setIsEditModalOpen(true);
                }}
              >
                <Settings className="w-4 h-4 mr-2" />
                Adjust Plan
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Plan Adjustment Modal */}
      {isEditModalOpen && selectedPolicy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
          <div className="absolute inset-0" onClick={() => setIsEditModalOpen(false)} />
          <GlassCard className="w-full max-w-4xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-black/5 relative">
            
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-20">
              <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Settings className="w-6 h-6 text-sky-600" />
                  Adjust Member Plan
                </h2>
                <p className="text-sm text-slate-500 mt-1">Configure entitlements and limits (Audit Trail Enabled).</p>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-8 custom-scrollbar space-y-8">
              
              {/* 1. Plan Structure */}
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  Plan Structure
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    onClick={() => setPlanConfig(p => ({ ...p, type: 'lump_sum' }))}
                    className={cn(
                      "cursor-pointer p-4 rounded-xl border transition-all flex items-center gap-3",
                      planConfig.type === 'lump_sum' 
                        ? "bg-sky-500 text-white border-sky-600 shadow-lg shadow-sky-500/20" 
                        : "bg-white/40 border-white/60 hover:bg-white/60"
                    )}
                  >
                    <div className="p-2 rounded-lg bg-white/20">
                      <LayoutDashboard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold">Lump Sum Limit</div>
                      <div className="text-xs opacity-80">Single total limit for all categories</div>
                    </div>
                    {planConfig.type === 'lump_sum' && <CheckSquare className="ml-auto w-5 h-5" />}
                  </div>
                  
                  <div 
                    onClick={() => setPlanConfig(p => ({ ...p, type: 'category' }))}
                    className={cn(
                      "cursor-pointer p-4 rounded-xl border transition-all flex items-center gap-3",
                      planConfig.type === 'category' 
                        ? "bg-sky-500 text-white border-sky-600 shadow-lg shadow-sky-500/20" 
                        : "bg-white/40 border-white/60 hover:bg-white/60"
                    )}
                  >
                    <div className="p-2 rounded-lg bg-white/20">
                      <List className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold">Categorized Limits</div>
                      <div className="text-xs opacity-80">Specific limits per benefit type</div>
                    </div>
                    {planConfig.type === 'category' && <CheckSquare className="ml-auto w-5 h-5" />}
                  </div>
                </div>
              </section>

              {/* 2. Limit Configuration */}
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  Entitlement Limits
                </h3>
                
                {planConfig.type === 'lump_sum' ? (
                  <div className="p-6 rounded-2xl bg-sky-50/50 border border-sky-100">
                    <label className="text-sm font-medium text-slate-700">Total Annual Limit (RM)</label>
                    <div className="relative mt-2">
                      <input 
                        type="number" 
                        value={planConfig.lumpSumLimit}
                        onChange={(e) => setPlanConfig(p => ({ ...p, lumpSumLimit: Number(e.target.value) }))}
                        className="w-full glass-input currency-input pr-4 py-3 text-lg font-bold text-slate-800"
                      />
                      <span className="currency-prefix text-xs">RM</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(Object.entries(planConfig.categories) as Array<
                      [keyof typeof planConfig.categories, (typeof planConfig.categories)[keyof typeof planConfig.categories]]
                    >).map(([key, cat]) => (
                      <div key={key} className="p-4 rounded-xl bg-white/40 border border-white/60 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <input 
                              type="checkbox" 
                              checked={cat.enabled}
                              onChange={(e) => updateCategory(key, 'enabled', e.target.checked)}
                              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                            <span className="text-sm font-bold text-slate-700">{cat.label}</span>
                          </div>
                          {cat.enabled && (
                            <div className="relative mt-1">
                              <input 
                                type="number" 
                                value={cat.limit}
                                onChange={(e) => updateCategory(key, 'limit', Number(e.target.value))}
                                className="w-full glass-input currency-input pr-2 py-1.5 text-sm font-semibold"
                              />
                              <span className="currency-prefix text-[10px]">RM</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Specific Category Logic */}
                        {key === 'sp' && cat.enabled && 'requireReferral' in cat && (
                          <div className="w-1/2 pl-4 border-l border-slate-200">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={cat.requireReferral}
                                onChange={(e) => updateCategory(key, 'requireReferral', e.target.checked)}
                                className="mt-1 rounded border-slate-300"
                              />
                              <span className="text-[10px] leading-tight text-slate-600">
                                Require GP Referral (14-day validity)
                              </span>
                            </label>
                          </div>
                        )}
                        
                        {key === 'dental' && cat.enabled && 'excludeScaling' in cat && 'coverExtraction' in cat && (
                          <div className="w-1/2 pl-4 border-l border-slate-200 space-y-1">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={cat.excludeScaling}
                                onChange={(e) => updateCategory(key, 'excludeScaling', e.target.checked)}
                                className="mt-0.5 rounded border-slate-300"
                              />
                              <span className="text-[10px] leading-tight text-slate-600">Exclude Scaling</span>
                            </label>
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={cat.coverExtraction}
                                onChange={(e) => updateCategory(key, 'coverExtraction', e.target.checked)}
                                className="mt-0.5 rounded border-slate-300"
                              />
                              <span className="text-[10px] leading-tight text-slate-600">Cover Extraction</span>
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 3. System Rules */}
              <section className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-1 h-4 bg-sky-500 rounded-full"/>
                  System Logic & Dependents
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Passport Logic */}
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Foreign Worker Policy</h4>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <div className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={planConfig.autoDisablePassport}
                              onChange={(e) => setPlanConfig(p => ({ ...p, autoDisablePassport: e.target.checked }))}
                              className="sr-only peer" 
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                          </div>
                          <span className="text-xs text-slate-600">Auto-disable on Passport Expiry</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Dependent Logic */}
                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
                    <div className="flex items-start gap-3">
                      <Users className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                      <div className="w-full">
                        <h4 className="text-sm font-bold text-slate-800">Dependent Coverage</h4>
                        <div className="mt-2 space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="radio" 
                              name="depLimit"
                              checked={planConfig.dependents.sharedLimit}
                              onChange={() => setPlanConfig(p => ({ ...p, dependents: { ...p.dependents, sharedLimit: true } }))}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-xs text-slate-600">Share Primary Member Limit</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="radio" 
                              name="depLimit"
                              checked={!planConfig.dependents.sharedLimit}
                              onChange={() => setPlanConfig(p => ({ ...p, dependents: { ...p.dependents, sharedLimit: false } }))}
                              className="text-purple-600 focus:ring-purple-500"
                            />
                            <span className="text-xs text-slate-600">Separate Allocated Amount</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>

            {/* Footer */}
            <div className="px-8 py-6 border-t border-slate-200/60 bg-slate-50 flex justify-between items-center z-20">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <FileText className="w-4 h-4" />
                <span>Changes logged in Audit Trail #LOG-9921</span>
              </div>
              <div className="flex gap-3">
                <GlassButton variant="secondary" onClick={() => setIsEditModalOpen(false)} className="hover:bg-slate-200 border-slate-300">
                  Cancel
                </GlassButton>
                <GlassButton className="bg-sky-600 text-white hover:bg-sky-700 shadow-lg shadow-sky-500/20 border-none" onClick={savePolicyConfigChanges}>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </GlassButton>
              </div>
            </div>

          </GlassCard>
        </div>
      )}
    </div>
  );
}
