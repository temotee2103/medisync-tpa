"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { 
  Shield, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Calendar,
  AlertCircle,
  User,
  CreditCard,
  Upload
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { validateFamilyRelationshipCaps } from "@/lib/familyRelationshipRules";
import { formatCurrency, formatDateDisplay, normalizeName, validateDependentPassport } from "@/lib/formats";
import { ensureCompaniesStore, getCompaniesServerSnapshot, getCompaniesSnapshot, subscribeCompanies } from "@/lib/companyStore";
import {
  ensureMemberSeed,
  getDependentsByParent,
  getMemberDirectoryServerSnapshot,
  getMemberDirectorySnapshot,
  getMemberSeedLoading,
  getMemberSession,
  subscribeMemberDirectory,
  subscribeMemberSession,
} from "@/lib/memberSession";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const getOppositeBinaryGender = (gender: "Male" | "Female" | "") => {
  if (gender === "Male") return "Female";
  if (gender === "Female") return "Male";
  return "";
};

export default function MemberPolicyPage() {
  useEffect(() => {
    void ensureMemberSeed();
    ensureCompaniesStore();
  }, []);

  const defaultCoverageYear = String(new Date().getFullYear());
  const memberSession = useSyncExternalStore(subscribeMemberSession, getMemberSession, () => null);
  const isMemberSeedLoading = useSyncExternalStore(subscribeMemberSession, getMemberSeedLoading, () => false);
  const memberDirectory = useSyncExternalStore(
    subscribeMemberDirectory,
    getMemberDirectorySnapshot,
    getMemberDirectoryServerSnapshot
  );
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState(defaultCoverageYear);
  const [passportFileName, setPassportFileName] = useState("");
  const [requestPassportFileName, setRequestPassportFileName] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestForm, setRequestForm] = useState({
    fullName: "",
    relationship: "Spouse" as "Spouse" | "Child" | "Parent",
    gender: "",
    nationality: "Malaysia",
    icPassport: "",
    passportExpiryDate: "",
    dob: "",
  });

  const currentMember = memberSession
    ? memberDirectory.find(
        (entry) => entry.companyId === memberSession.companyId && entry.staffId === memberSession.staffId
      ) || null
    : null;
  const currentCompany = memberSession
    ? companies.find((company) => company.companyId === memberSession.companyId) || null
    : null;

  const directoryDependents = memberSession
    ? getDependentsByParent(memberSession.companyId, memberSession.staffId)
    : [];
  const activeDependents = directoryDependents.filter((dep) => dep.status === "Active");
  const maxChildren = currentCompany?.planConfig?.dependents?.maxChildren ?? 10;

  const memberNationality = (currentMember?.nationality || "Malaysia").toUpperCase();
  const memberIsForeigner = memberNationality !== "MY" && memberNationality !== "MALAYSIA";
  const memberGender = currentMember?.gender || "";
  const spouseLockedGender = getOppositeBinaryGender(memberGender);
  const dependentPassportRequired = requestForm.nationality !== "Malaysia";

  const yearlyBenefits = useMemo(
    () => ({
      "2024": [
        { name: "Outpatient (OP)", limit: "RM 2,000 / year", status: "Active" },
        { name: "Rehabilitation", limit: "RM 20,000 / year", status: "Active" },
        { name: "Annual Health Screening (AHS)", limit: "RM 1,000 / year", status: "Active" },
        { name: "Dental", limit: "RM 500 / year", status: "Active" },
        { name: "Specialist (SP)", limit: "RM 3,000 / year", status: "Active" },
        { name: "TCM / Alternate Medicine", limit: "Not Covered", status: "Inactive" },
        { name: "Optical / Glasses", limit: "Not Covered", status: "Inactive" },
        { name: "Others", limit: "RM 1,000 / year", status: "Active" },
      ],
      "2025": [
        { name: "Outpatient (OP)", limit: "RM 2,200 / year", status: "Active" },
        { name: "Rehabilitation", limit: "RM 22,000 / year", status: "Active" },
        { name: "Annual Health Screening (AHS)", limit: "RM 1,200 / year", status: "Active" },
        { name: "Dental", limit: "RM 600 / year", status: "Active" },
        { name: "Specialist (SP)", limit: "RM 3,000 / year", status: "Active" },
        { name: "TCM / Alternate Medicine", limit: "RM 500 / year", status: "Active" },
        { name: "Optical / Glasses", limit: "RM 300 / year", status: "Active" },
        { name: "Others", limit: "RM 1,000 / year", status: "Active" },
      ],
      "2026": [
        { name: "Outpatient (OP)", limit: "RM 2,500 / year", status: "Active" },
        { name: "Rehabilitation", limit: "RM 25,000 / year", status: "Active" },
        { name: "Annual Health Screening (AHS)", limit: "RM 1,500 / year", status: "Active" },
        { name: "Dental", limit: "RM 700 / year", status: "Active" },
        { name: "Specialist (SP)", limit: "RM 3,500 / year", status: "Active" },
        { name: "TCM / Alternate Medicine", limit: "RM 700 / year", status: "Active" },
        { name: "Optical / Glasses", limit: "RM 500 / year", status: "Active" },
        { name: "Others", limit: "RM 1,200 / year", status: "Active" },
      ],
    }),
    []
  );
  const benefitYearOptions = Object.keys(yearlyBenefits).sort((left, right) => right.localeCompare(left));
  const fallbackBenefitYear = benefitYearOptions.includes(defaultCoverageYear)
    ? defaultCoverageYear
    : benefitYearOptions[0];
  const effectiveBenefitYear = Object.prototype.hasOwnProperty.call(yearlyBenefits, selectedYear)
    ? selectedYear
    : fallbackBenefitYear;
  const benefits = yearlyBenefits[effectiveBenefitYear as keyof typeof yearlyBenefits];
  const annualLimit = currentMember?.familyLumpSumLimit || currentMember?.lumpSumLimit || 50000;
  const availableBalance = Math.max(annualLimit - 1250, 0);
  const utilizationPercentage = annualLimit > 0 ? Math.min(((annualLimit - availableBalance) / annualLimit) * 100, 100) : 0;
  const memberStatus = currentMember?.status || "Active";
  const idLabel = memberIsForeigner ? "Passport No." : "NRIC / Passport No.";
  const idValue = currentMember?.passportNo || currentMember?.nricPassport || memberSession?.memberId || "-";
  const validUntil = `31 Dec ${effectiveBenefitYear}`;
  const medicalCardMeta = [
    { label: "Account Name", value: currentMember?.fullName || memberSession?.fullName || "Member Account" },
    { label: "Member ID", value: memberSession?.staffId || memberSession?.memberId || "-" },
    { label: "Company ID", value: memberSession?.companyId || "-" },
    { label: "Coverage Type", value: "Employee Medical Benefits" },
  ];
  const supportMeta = [
    { label: idLabel, value: idValue },
    { label: "Nationality", value: currentMember?.nationality || "Malaysia" },
    { label: "Gender", value: currentMember?.gender || "Not provided" },
    { label: "Date of Birth", value: currentMember?.dob ? formatDateDisplay(currentMember.dob) : "Not provided" },
    { label: "Relationship", value: currentMember?.relationship || "Employee" },
    { label: "Passport Expiry", value: currentMember?.passportExpiry ? formatDateDisplay(currentMember.passportExpiry) : "Not provided" },
  ];

  if (isMemberSeedLoading) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Policy</h1>
          </div>
        </div>

        <GlassCard className="p-6">
          <p className="text-sm text-slate-600">正在读取会员资料与保障信息，请稍候...</p>
        </GlassCard>
      </div>
    );
  }

  if (!memberSession) {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Policy</h1>
          </div>
        </div>

        <GlassCard className="p-6">
          <p className="text-sm text-slate-600">Member session not found. Please login again.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Policy</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="glass-select px-3 py-2 text-sm"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            {benefitYearOptions.map((year) => (
              <option key={year} value={year}>
                {`Policy Year ${year}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Medical Card */}
      <div 
        className="relative overflow-hidden rounded-[28px] border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(34,197,94,0.08),rgba(255,255,255,0.82))] p-6 text-slate-900 shadow-2xl shadow-sky-200/25"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(187,247,208,0.14),transparent_30%)]" />
        <div className="absolute top-0 right-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full border border-white/20 bg-white/18 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 -translate-x-1/3 translate-y-1/3 rounded-full bg-cyan-100/15 blur-3xl" />
        <div className="absolute right-6 top-6 z-20 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-900">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
          {memberStatus}
        </div>
        
        <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-stretch xl:justify-between">
          <div className="flex-1 space-y-6">
            <div className="flex flex-col gap-5 pr-0 md:pr-28">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-white/55 shadow-xl shadow-sky-200/20 backdrop-blur-md">
                  <CreditCard className="h-8 w-8 text-sky-800" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-sky-900/70">Medical Card</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">{currentMember?.fullName || memberSession?.fullName || "Member Account"}</h2>
                  <p className="text-sm text-slate-700">Healthcare access and annual benefit summary</p>
                </div>
              </div>
            </div>
            
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {medicalCardMeta.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm backdrop-blur-sm">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-sky-900/65">{item.label}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]">
              <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-900/75">Medical Identity</p>
                    <p className="mt-1 text-sm text-slate-700">Use this information for clinic verification and member support.</p>
                  </div>
                  <Shield className="h-5 w-5 text-sky-800/80" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {supportMeta.map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/70 bg-white/55 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-sky-900/65">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-900/75">Document Update</p>
                <p className="mt-1 text-sm text-slate-700">Keep your travel and identity documents current for faster claim review.</p>
                <div className="mt-4 rounded-xl border border-amber-200/65 bg-amber-50/35 px-3 py-2 text-xs text-amber-950">
                  {currentMember?.passportExpiry
                    ? `Current expiry: ${formatDateDisplay(currentMember.passportExpiry)}`
                    : "No passport expiry date saved yet."}
                </div>
                <div className="mt-5 flex flex-col gap-2.5">
                  <label className="text-[10px] uppercase tracking-[0.22em] text-sky-900/65">Passport Upload</label>
                  <input
                    type="file"
                    className="w-full rounded-xl border border-dashed border-white/75 bg-white/55 px-3 py-3 text-xs text-slate-800 file:mr-3 file:rounded-md file:border-0 file:bg-white/90 file:px-3 file:py-1.5 file:text-xs file:text-slate-700"
                    onChange={(e) => setPassportFileName(e.target.files?.[0]?.name || "")}
                  />
                  {passportFileName && (
                    <p className="truncate text-[10px] text-slate-700">{passportFileName}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-800">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 shadow-sm">
                <Calendar className="h-4 w-4" /> Valid until {validUntil}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 shadow-sm">
                <Users className="h-4 w-4" /> Family coverage enabled
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 shadow-sm">
                <AlertCircle className="h-4 w-4" /> Show this card before treatment
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-sm flex-col justify-end">
            <div className="rounded-[24px] border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(14,165,233,0.1),rgba(34,197,94,0.07),rgba(255,255,255,0.72))] p-5 shadow-xl shadow-sky-200/25 backdrop-blur-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-900/75">Annual Limit Balance</p>
              <div className="flex items-end gap-2 text-slate-900">
                <span className="text-3xl font-bold">{formatCurrency(availableBalance)}</span>
                <span className="mb-1 text-sm text-slate-700">/ {formatCurrency(annualLimit)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/55">
                <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.max(100 - utilizationPercentage, 6)}%` }} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/70 bg-white/50 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-sky-900/65">Used This Year</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatCurrency(annualLimit - availableBalance)}</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/50 p-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-sky-900/65">Benefit Status</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-800">{memberStatus}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-white/70 bg-white/55 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-sky-900/65">Care Note</p>
                <p className="mt-2 text-sm text-slate-700">For admission, outpatient visit, or guarantee letter request, present your member ID and keep identity documents updated.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coverage & Benefits */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Coverage Benefits
          </h3>
          <div className="grid gap-4">
            {benefits.map((benefit, index) => (
              <GlassCard key={index} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    benefit.status === "Active" ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                  )}>
                    {benefit.status === "Active" ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className={cn("font-bold", benefit.status === "Active" ? "text-slate-800" : "text-slate-400")}>
                      {benefit.name}
                    </p>
                    <p className="text-xs text-slate-500">{benefit.limit}</p>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold border",
                  benefit.status === "Active" 
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                    : "bg-slate-50 text-slate-400 border-slate-200"
                )}>
                  {benefit.status}
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Dependents & Info */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-500" />
            Dependents
          </h3>
          <GlassCard>
            <div className="space-y-4">
              <ResponsiveDataView
                desktop={
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr className="text-left uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Relation</th>
                          <th className="px-3 py-2">Gender</th>
                          <th className="px-3 py-2">Nationality</th>
                          <th className="px-3 py-2">DOB</th>
                          <th className="px-3 py-2">Passport Expiry</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {directoryDependents.map((dep, index) => (
                          <tr key={`${dep.staffId}-${index}`} className="border-t border-slate-100 text-slate-700">
                            <td className="px-3 py-2 font-semibold">{dep.fullName}</td>
                            <td className="px-3 py-2">{dep.relationship || "-"}</td>
                            <td className="px-3 py-2">{dep.gender || "-"}</td>
                            <td className="px-3 py-2">{dep.nationality || "Malaysia"}</td>
                            <td className="px-3 py-2">{dep.dob || "-"}</td>
                            <td className="px-3 py-2">{dep.passportExpiry ? formatDateDisplay(dep.passportExpiry) : "-"}</td>
                            <td className="px-3 py-2">
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                {dep.status || "Active"}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {directoryDependents.length === 0 && (
                          <tr className="border-t border-slate-100 text-slate-500">
                            <td className="px-3 py-4" colSpan={7}>No dependents on record.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                }
                mobile={
                  <div className="space-y-3">
                    {directoryDependents.map((dep, index) => (
                      <MobileRecordCard
                        key={`${dep.staffId}-${index}`}
                        title={dep.fullName}
                        subtitle={`${dep.relationship || "Dependent"} • ${dep.staffId.split("-DEP-").length === 2 ? `${dep.staffId.split("-DEP-")[0]}-DEP-${dep.staffId.split("-DEP-")[1].slice(0, 4)}…${dep.staffId.split("-DEP-")[1].slice(-4)}` : dep.staffId}`}
                        badge={<span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-100">{dep.status || "Active"}</span>}
                      >
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gender</p>
                          <p className="mt-1 text-sm text-slate-700">{dep.gender || "-"}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nationality</p>
                          <p className="mt-1 text-sm text-slate-700">{dep.nationality || "Malaysia"}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date of Birth</p>
                          <p className="mt-1 text-sm text-slate-700">{dep.dob || "-"}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Passport Expiry</p>
                          <p className="mt-1 text-sm text-slate-700">{dep.passportExpiry ? formatDateDisplay(dep.passportExpiry) : "-"}</p>
                        </div>
                      </MobileRecordCard>
                    ))}
                    {directoryDependents.length === 0 && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-500">
                        No dependents on record.
                      </div>
                    )}
                  </div>
                }
              />
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <Shield className="w-3 h-3 text-sky-500" />
                <span>Dependents share Family Limit (RM 50,000).</span>
              </div>
              <GlassButton variant="ghost" className="w-full text-sm text-sky-600" onClick={() => setIsRequestOpen(true)}>
                Submit Dependent Request
              </GlassButton>
              <p className="text-[11px] text-slate-500 text-center">All dependent requests require Admin approval before activation.</p>
            </div>
          </GlassCard>

          <GlassCard className="bg-amber-50/50 border-amber-100">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-amber-800 text-sm">Dispute Claim</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Raise a dispute request if a claim decision or policy charge needs review.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {isRequestOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsRequestOpen(false)} />
          <GlassCard className="w-full max-w-3xl p-0 shadow-2xl border-white/80 bg-white/95 backdrop-blur-xl relative overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200/70 bg-white/70">
              <h3 className="text-lg font-bold text-slate-800">Submit Dependent Request</h3>
              <p className="text-sm text-slate-500">Requests require admin approval and follow the same dependent format as admin review.</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="rounded-2xl border border-slate-200 p-5 bg-white space-y-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Dependent Full Name <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="Full Name as per ID"
                        value={requestForm.fullName}
                        onChange={(e) => setRequestForm({ ...requestForm, fullName: e.target.value })}
                        onBlur={() => setRequestForm((prev) => ({ ...prev, fullName: normalizeName(prev.fullName) }))}
                      />
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Dependent Relationship <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                        value={requestForm.relationship}
                        onChange={(e) => {
                          const nextRelationship = e.target.value as "Spouse" | "Child" | "Parent";
                          setRequestForm({
                            ...requestForm,
                            relationship: nextRelationship,
                            gender: nextRelationship === "Spouse" && spouseLockedGender ? spouseLockedGender : requestForm.gender,
                          });
                        }}
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
                        disabled={requestForm.relationship === "Spouse" && !!spouseLockedGender}
                        value={requestForm.relationship === "Spouse" && spouseLockedGender ? spouseLockedGender : requestForm.gender}
                        onChange={(e) => setRequestForm({ ...requestForm, gender: e.target.value })}
                      >
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Nationality <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        className="w-full glass-input pl-10 pr-4 py-2.5 bg-transparent"
                        value={requestForm.nationality}
                        onChange={(e) => setRequestForm({ ...requestForm, nationality: e.target.value })}
                      >
                        <option value="Malaysia">Malaysia</option>
                        <option value="Singapore">Singapore</option>
                        <option value="Indonesia">Indonesia</option>
                        <option value="India">India</option>
                        <option value="China">China</option>
                        <option value="Other">Other</option>
                      </select>
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      {dependentPassportRequired ? "Dependent Passport No." : "Dependent NRIC / Passport No."} <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        placeholder="Identity number"
                        value={requestForm.icPassport}
                        onChange={(e) => setRequestForm({ ...requestForm, icPassport: e.target.value })}
                      />
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Date of Birth <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input
                        type="date"
                        className="w-full glass-input pl-10 pr-4 py-2.5"
                        value={requestForm.dob}
                        onChange={(e) => setRequestForm({ ...requestForm, dob: e.target.value })}
                      />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    </div>
                  </div>
                  {dependentPassportRequired && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Dependent Passport Expiry Date <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full glass-input pl-10 pr-4 py-2.5"
                            value={requestForm.passportExpiryDate}
                            onChange={(e) => setRequestForm({ ...requestForm, passportExpiryDate: e.target.value })}
                          />
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700">Passport Upload <span className="text-red-500">*</span></label>
                        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors">
                          <Upload className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-600 truncate">{requestPassportFileName || "Choose passport file"}</span>
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => setRequestPassportFileName(e.target.files?.[0]?.name || "")}
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>
                {requestForm.relationship === "Spouse" && spouseLockedGender && (
                  <p className="text-xs text-slate-400">Spouse gender is auto-set based on the member gender.</p>
                )}
              </div>
            </div>
            {requestError && <p className="text-xs text-red-500 font-medium">{requestError}</p>}
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setIsRequestOpen(false)}>Cancel</GlassButton>
              <GlassButton
                onClick={async () => {
                  const effectiveGender =
                    requestForm.relationship === "Spouse" && spouseLockedGender
                      ? spouseLockedGender
                      : requestForm.gender;
                  if (requestForm.relationship === "Spouse" && spouseLockedGender && effectiveGender !== spouseLockedGender) {
                    setRequestError("Spouse gender must be opposite to the member gender.");
                    return;
                  }

                  const relationshipError = validateFamilyRelationshipCaps({
                    relationship: requestForm.relationship,
                    gender: effectiveGender,
                    existingDependents: activeDependents,
                    maxChildren,
                  });
                  if (relationshipError) {
                    setRequestError(relationshipError);
                    return;
                  }

                  const passportValidation = validateDependentPassport({
                    nationality: requestForm.nationality,
                    passportNumber: dependentPassportRequired ? requestForm.icPassport : "",
                    passportExpiryDate: requestForm.passportExpiryDate,
                    passportFileName: requestPassportFileName,
                  });
                  if (!passportValidation.valid) {
                    setRequestError(Object.values(passportValidation.errors)[0] || "Please complete required fields.");
                    return;
                  }
                  try {
                    const supabase = createSupabaseBrowserClient();
                    const { data } = await supabase.auth.getSession();
                    const profileId = data.session?.user.id;
                    if (!profileId) {
                      setRequestError("Please login again.");
                      return;
                    }
                    const payload = {
                      ...requestForm,
                      gender: effectiveGender,
                      passportFileName: requestPassportFileName,
                      submittedAt: new Date().toISOString(),
                    };
                    const { error } = await supabase.from("dependent_requests").insert({
                      member_profile_id: profileId,
                      payload,
                      status: "pending",
                    });
                    if (error) throw error;
                  } catch (error) {
                    setRequestError(error instanceof Error ? error.message : "Unable to submit request.");
                    return;
                  }
                  setIsRequestOpen(false);
                  setRequestError("");
                  setRequestPassportFileName("");
                  setRequestForm({
                    fullName: "",
                    relationship: "Spouse",
                    gender: spouseLockedGender || "",
                    nationality: "Malaysia",
                    icPassport: "",
                    passportExpiryDate: "",
                    dob: "",
                  });
                }}
              >
                Submit Request
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
