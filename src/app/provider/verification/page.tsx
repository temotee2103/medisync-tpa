"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassInput } from "@/components/ui/GlassInput";
import { GlassField } from "@/components/ui/GlassField";
import {
  Search, 
  CheckCircle2, 
  XCircle, 
  Shield, 
  Calendar,
  AlertCircle,
  QrCode
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/basePath";
import { downloadText } from "@/lib/download";
import Link from "next/link";
import { ensureCompaniesStore, getCompaniesServerSnapshot, getCompaniesSnapshot, subscribeCompanies } from "@/lib/companyStore";
import {
  ensureMemberSeed,
  getMemberDirectoryServerSnapshot,
  getMemberDirectorySnapshot,
  subscribeMemberDirectory,
} from "@/lib/memberSession";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import type { ResolvedMemberPlan } from "@/lib/memberPlan";
import {
  buildEligibilityResult,
  findMemberByPayload,
} from "@/lib/providerVerification";
import { QrScanner } from "@/components/ui/QrScanner";
import { showToast } from "@/components/ui/Toast";

export default function MemberVerificationPage() {
  const [memberId, setMemberId] = useState("");
  const [searchMode, setSearchMode] = useState<"manual" | "qr">("manual");
  const [searchPayload, setSearchPayload] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const memberDirectory = useSyncExternalStore(
    subscribeMemberDirectory,
    getMemberDirectorySnapshot,
    getMemberDirectoryServerSnapshot
  );
  const companies = useSyncExternalStore(subscribeCompanies, getCompaniesSnapshot, getCompaniesServerSnapshot);

  useEffect(() => {
    ensureMemberSeed();
    ensureCompaniesStore();
  }, []);

  const verificationResult = useMemo(() => {
    void memberDirectory;
    if (!searchPayload.trim()) return null;
    const member = findMemberByPayload(searchPayload);
    if (!member) return null;
    return buildEligibilityResult(member, companies);
  }, [companies, memberDirectory, searchPayload]);
  const lookupFeedback =
    !isSearching && hasSearched && !verificationResult ? "Member record not found." : "";

  const planSummary = useMemo(() => {
    if (!verificationResult) return "";
    const plan: ResolvedMemberPlan = verificationResult.plan;

    if (plan.type === "lump_sum") {
      return `Lump sum limit: ${formatCurrency(plan.lumpSumLimit)}`;
    }

    const selectedCategories = plan.categories.filter((category) => category.selected && category.limit > 0);
    if (selectedCategories.length === 0) return "No plan categories enabled.";

    return selectedCategories
      .map((category) => `${category.label}: ${formatCurrency(category.limit)}`)
      .join(" • ");
  }, [verificationResult]);

  const runLookup = async (payload: string) => {
    const normalizedPayload = payload.trim();
    if (!normalizedPayload) {
      setHasSearched(false);
      setSearchPayload("");
      showToast("Please enter Staff ID, NRIC, or Passport No.", "error");
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setSearchPayload(normalizedPayload);
    await ensureMemberSeed();
    setIsSearching(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runLookup(memberId);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Member Verification</h1>
        <p className="text-sm text-slate-500">Verify member eligibility and coverage details.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Section */}
        <div className="lg:col-span-3">
          <GlassCard className="p-8 space-y-6">
            <div className="flex justify-center">
              <div className="flex flex-col sm:flex-row w-full sm:w-auto p-1 bg-slate-100/80 rounded-2xl sm:rounded-full border border-slate-200">
                <button 
                  onClick={() => setSearchMode("manual")}
                  className={cn(
                    "flex items-center justify-center gap-2 px-6 py-2 rounded-xl sm:rounded-full text-sm font-bold transition-all",
                    searchMode === "manual" 
                      ? "bg-white text-sky-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Search className="w-4 h-4" />
                  Manual Entry
                </button>
                <button 
                  onClick={() => setSearchMode("qr")}
                  className={cn(
                    "flex items-center justify-center gap-2 px-6 py-2 rounded-xl sm:rounded-full text-sm font-bold transition-all",
                    searchMode === "qr" 
                      ? "bg-white text-sky-600 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <QrCode className="w-4 h-4" />
                  Scan QR Code
                </button>
              </div>
            </div>

            {searchMode === "manual" ? (
              <form onSubmit={handleSearch} className="flex flex-col gap-4 animate-in fade-in slide-in-from-left-4">
                {lookupFeedback && (
                  <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {lookupFeedback}
                  </div>
                )}
                <GlassField label="Staff ID / NRIC / Passport No.">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                    <GlassInput
                      placeholder="Enter Staff ID / NRIC / Passport (e.g., MEM-8823-01)"
                      className="text-lg pl-10"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                    />
                  </div>
                </GlassField>
                <GlassButton type="submit" className="w-full py-3 h-[50px] gap-2 justify-center" disabled={isSearching}>
                  {isSearching ? "Verifying..." : "Verify Coverage"}
                </GlassButton>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/50 animate-in fade-in slide-in-from-right-4">
                {lookupFeedback && (
                  <div className="w-full max-w-md mb-6 bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {lookupFeedback}
                  </div>
                )}
                <div className="w-full max-w-[16rem]">
                  <QrScanner
                    onResult={async (text) => {
                      setIsSearching(true);
                      try {
                        const res = await fetch(withBasePath("/api/provider/qr/resolve"), {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ token: text }),
                        });
                        const json = await res.json().catch(() => null);
                        if (!res.ok || !json?.ok) {
                          showToast(json?.error || "Scan failed.", "error");
                          setIsSearching(false);
                          return;
                        }
                        setSearchPayload(json.staffId || json.nricPassport || "");
                        setHasSearched(true);
                      } catch {
                        showToast("Failed to resolve QR token.", "error");
                      }
                      setIsSearching(false);
                    }}
                    onError={(msg) => showToast(msg, "error")}
                  />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-600">Point camera at Member Digital Card QR</p>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Results Section */}
        {verificationResult && (
          <>
            <div className="lg:col-span-2 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Status Card */}
              <div 
                className={cn(
                  "p-6 rounded-2xl border flex items-center justify-between",
                  verificationResult.eligibilityStatus === "Active" 
                    ? "bg-emerald-50 border-emerald-200" 
                    : "bg-red-50 border-red-200"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg",
                    verificationResult.eligibilityStatus === "Active" ? "bg-emerald-500" : "bg-red-500"
                  )}>
                    {verificationResult.eligibilityStatus === "Active" ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className={cn(
                      "text-lg font-bold",
                      verificationResult.eligibilityStatus === "Active" ? "text-emerald-900" : "text-red-900"
                    )}>
                      Coverage {verificationResult.eligibilityStatus}
                    </h3>
                    <p className={cn(
                      "text-sm",
                      verificationResult.eligibilityStatus === "Active" ? "text-emerald-700" : "text-red-700"
                    )}>
                      {verificationResult.eligibilityStatus === "Active" 
                        ? "Member is eligible for cashless admission." 
                        : verificationResult.ineligibilityReason || "Member is not eligible for coverage."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Details Card */}
              <GlassCard className="p-0 overflow-hidden">
                <div className="p-6 bg-sky-500/5 border-b border-sky-100">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-xl border-4 border-white shadow-sm">
                      {verificationResult.member.fullName.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">{verificationResult.member.fullName}</h2>
                      <p className="text-slate-500 flex items-center gap-2 text-sm">
                        <Shield className="w-4 h-4 text-sky-500" />
                        {verificationResult.plan.type === "lump_sum" ? "Lump sum plan" : "Category plan"}
                        {verificationResult.company ? ` • ${verificationResult.company.name}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Staff ID</p>
                    <p className="font-mono font-bold text-slate-700">{verificationResult.member.staffId}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Company</p>
                    <p className="font-bold text-slate-700 flex items-center gap-2">
                      {verificationResult.company?.name || verificationResult.member.companyId}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">NRIC / Passport</p>
                    <p className="font-bold text-slate-700">{verificationResult.member.nricPassport || verificationResult.member.passportNo || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Passport Expiry</p>
                    <p className="font-bold text-slate-700 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {verificationResult.member.passportExpiry
                        ? formatDateDisplay(verificationResult.member.passportExpiry) || verificationResult.member.passportExpiry
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Plan Summary</p>
                    <p className="font-bold text-slate-700 leading-relaxed">{planSummary}</p>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Sidebar Info */}
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-700">
              <GlassCard className="bg-amber-50 border-amber-100 p-6">
                <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5" />
                  Dispute Claim
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Open a dispute when eligibility, claim status, or coverage detail needs manual review.
                </p>
              </GlassCard>

              <GlassCard className="p-6 space-y-4">
                <h3 className="font-bold text-slate-800">Quick Actions</h3>
                <GlassButton className="w-full gap-2" onClick={() => downloadText("gl-letter.txt", "GL Letter")}>
                  <Shield className="w-4 h-4" />
                  Generate GL Letter
                </GlassButton>
                <Link href="/provider/payments">
                  <GlassButton variant="secondary" className="w-full">
                    View Claims History
                  </GlassButton>
                </Link>
              </GlassCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
