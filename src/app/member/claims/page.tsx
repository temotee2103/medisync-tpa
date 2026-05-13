"use client";

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { MobileDetailModal } from "@/components/ui/MobileDetailModal";
import { 
  ArrowLeft, 
  ArrowRight, 
  Upload, 
  CheckCircle2, 
  FileText,
  Hospital,
  User,
  AlertCircle,
  Stethoscope
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { addMemberClaim, ensureMemberClaimsStore } from "@/lib/claimsStore";
import { ensureMemberSeed, getDependentsByParent, getMemberDirectory, getMemberSession } from "@/lib/memberSession";

const diagnosisOptions = [
  "Acute Upper Respiratory Infection",
  "Acute Gastritis",
  "Viral Fever",
  "Hypertension",
  "Type 2 Diabetes Mellitus",
  "Migraine",
  "Allergic Rhinitis",
  "Acute Pharyngitis",
  "Conjunctivitis",
  "Low Back Pain",
];

export default function ClaimSubmissionPage() {
  const router = useRouter();
  ensureMemberClaimsStore();
  ensureMemberSeed();
  const [step, setStep] = useState(1);
  const totalSteps = 4;
  const memberSession = getMemberSession();
  const patients = useMemo(() => {
    if (!memberSession) return [];
    const directory = getMemberDirectory();
    const primary =
      directory.find(
        (entry) => entry.companyId === memberSession.companyId && entry.staffId === memberSession.staffId
      ) || null;
    const dependents = getDependentsByParent(memberSession.companyId, memberSession.staffId);
    return [
      {
        id: memberSession.staffId,
        name: primary?.fullName || memberSession.fullName || memberSession.staffId,
        relation: "Self",
      },
      ...dependents.map((dep) => ({
        id: dep.staffId,
        name: dep.fullName,
        relation: dep.relationship || "Dependent",
      })),
    ];
  }, [memberSession]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [referralDate, setReferralDate] = useState("");
  const [error, setError] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(""); // staffId
  const [dentalAck, setDentalAck] = useState(false);
  const [referralFileName, setReferralFileName] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<string[]>([]);
  const [mcFileName, setMcFileName] = useState("");
  const [rlFileName, setRlFileName] = useState("");
  const [mcRequired, setMcRequired] = useState<"Y" | "N">("N");
  const [mcFrom, setMcFrom] = useState("");
  const [mcTo, setMcTo] = useState("");
  const [providerName, setProviderName] = useState("");
  const [amountSubmitted, setAmountSubmitted] = useState("");
  const [invoiceReceiptNo, setInvoiceReceiptNo] = useState("");
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);
  const [diagnosisToAdd, setDiagnosisToAdd] = useState("");
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastSubmittedClaimId, setLastSubmittedClaimId] = useState("");
  const selectedPatientRecord = patients.find((patient) => patient.id === selectedPatient) || null;
  const isEmployeeClaim = selectedPatientRecord?.relation === "Self";
  const effectiveMcRequired = isEmployeeClaim ? mcRequired : "N";
  const mcDays = useMemo(() => {
    if (!mcFrom || !mcTo) return 0;
    const diffMs = new Date(mcTo).getTime() - new Date(mcFrom).getTime();
    return Math.max(1, Math.ceil(diffMs / 86400000) + 1);
  }, [mcFrom, mcTo]);
  const diagnosisSummary = selectedDiagnoses.join(", ");

  const resetForm = () => {
    setStep(1);
    setSelectedCategory("");
    setVisitDate("");
    setReferralDate("");
    setError("");
    setSelectedPatient("");
    setDentalAck(false);
    setReferralFileName("");
    setReceiptFiles([]);
    setMcFileName("");
    setRlFileName("");
    setMcRequired("N");
    setMcFrom("");
    setMcTo("");
    setProviderName("");
    setAmountSubmitted("");
    setInvoiceReceiptNo("");
    setSelectedDiagnoses([]);
    setDiagnosisToAdd("");
  };

  const addDiagnosis = () => {
    const nextDiagnosis = diagnosisToAdd.trim();
    if (!nextDiagnosis) return;
    const alreadyExists = selectedDiagnoses.some(
      (item) => item.toLowerCase() === nextDiagnosis.toLowerCase()
    );
    if (alreadyExists) {
      setDiagnosisToAdd("");
      return;
    }
    setSelectedDiagnoses((prev) => [...prev, nextDiagnosis]);
    setDiagnosisToAdd("");
    setError("");
  };

  const removeDiagnosis = (diagnosis: string) => {
    setSelectedDiagnoses((prev) => prev.filter((item) => item !== diagnosis));
  };

  const handleSubmitClaim = () => {
    if (selectedDiagnoses.length === 0) {
      setError("Please add at least one diagnosis.");
      return;
    }

    const claimId = `CLM-${Date.now()}`;
    addMemberClaim({
      id: claimId,
      patient: selectedPatientRecord?.name || selectedPatient,
      patientId: selectedPatient,
      category: selectedCategory,
      visitDate,
      providerName,
      diagnosis: diagnosisSummary,
      amountSubmitted,
      invoiceReceiptNo,
      receiptFiles,
      referralFileName,
      mcFileName,
      rlFileName,
      mcRequired: effectiveMcRequired === "Y",
      mcFrom: effectiveMcRequired === "Y" ? mcFrom : "",
      mcTo: effectiveMcRequired === "Y" ? mcTo : "",
      mcDays: effectiveMcRequired === "Y" ? mcDays : 0,
      status: "In review",
      createdAt: new Date().toISOString(),
    });
    setLastSubmittedClaimId(claimId);
    setIsSuccessModalOpen(true);
    resetForm();
  };

  const nextStep = () => {
    if (step === 1) {
      if (!selectedPatient) {
        setError("Please select a patient.");
        return;
      }
      setError("");
    }
    if (step === 2) {
      if (!visitDate) {
        setError("Please select a visit date.");
        return;
      }
      if (selectedDiagnoses.length === 0) {
        setError("Please add at least one diagnosis.");
        return;
      }
      
      const today = new Date();
      const visit = new Date(visitDate);
      const diffTime = Math.abs(today.getTime() - visit.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 14) {
        setError("Claims cannot be submitted for visits older than 14 days.");
        return;
      }

      if (selectedCategory === "SP") {
        if (!referralDate) {
          setError("Please select the Referral Letter Date.");
          return;
        }
        const referral = new Date(referralDate);
        const refDiffTime = visit.getTime() - referral.getTime();
        const refDiffDays = Math.ceil(refDiffTime / (1000 * 60 * 60 * 24));
        
        if (refDiffDays < 0) {
          setError("Referral date cannot be after the visit date.");
          return;
        }
        if (refDiffDays > 14) {
          setError("Referral letter must be dated within 14 days of the visit.");
          return;
        }
      }

      if (selectedCategory === "Dental" && !dentalAck) {
        setError("Please acknowledge the dental coverage exclusions.");
        return;
      }

      setError("");
    }
    if (step === 3) {
      if (receiptFiles.length === 0) {
        setError("Please upload at least one receipt or bill.");
        return;
      }
      if (isEmployeeClaim && effectiveMcRequired === "Y" && !mcFileName) {
        setError("Please upload MC document.");
        return;
      }
      setError("");
    }
    setStep(s => Math.min(s + 1, totalSteps));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/member/dashboard">
            <GlassButton variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </GlassButton>
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">Submit New Claim</h1>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Step {step} of {totalSteps}</p>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={cn(
                "h-1.5 w-6 rounded-full transition-all duration-300",
                i <= step ? "bg-sky-500" : "bg-slate-200"
              )} />
            ))}
          </div>
        </div>
      </div>

      {!memberSession && (
        <GlassCard className="p-6">
          <p className="text-sm text-slate-600">Member session not found. Please login again.</p>
          <div className="mt-4">
            <GlassButton onClick={() => router.push("/member/login")}>Go to Login</GlassButton>
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-8">
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <User className="w-5 h-5 text-sky-500" />
                Select Patient
              </h2>
              <p className="text-sm text-slate-500">Who are you submitting this claim for?</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {patients.map((patient) => (
                <button
                  key={patient.id}
                  className="text-left group"
                  onClick={() => {
                    setSelectedPatient(patient.id);
                    if (patient.relation !== "Self") {
                      setMcRequired("N");
                      setMcFrom("");
                      setMcTo("");
                    }
                  }}
                >
                  <GlassCard
                    className={cn(
                      "p-4 border-2 border-transparent transition-all hover:bg-white/60",
                      selectedPatient === patient.id ? "border-sky-400 bg-white/70" : "group-hover:border-sky-300"
                    )}
                  >
                    <p className="font-bold text-slate-800">{patient.name}</p>
                    <p className="text-xs text-slate-500">{patient.relation} • {patient.id}</p>
                  </GlassCard>
                </button>
              ))}
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Hospital className="w-5 h-5 text-sky-500" />
                Visit Details
              </h2>
              <p className="text-sm text-slate-500">Enter the details of the medical visit.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Claim Category</label>
                <select 
                  className="w-full glass-input px-4 py-2 appearance-none"
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setError("");
                  }}
                >
                  <option value="">Select Category</option>
                  <option value="OP">Outpatient (OP)</option>
                  <option value="IP">Rehabilitation</option>
                  <option value="SP">Specialist (SP)</option>
                  <option value="Dental">Dental</option>
                  <option value="AHS">Annual Health Screening (AHS)</option>
                  <option value="TMC">TCM / Alternate Medicine</option>
                  <option value="Glasses">Glasses</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              {selectedCategory === "Dental" && (
                <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>Scaling, polishing, and cleaning are excluded. Only extraction and filling are covered.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-800">
                    <input
                      type="checkbox"
                      checked={dentalAck}
                      onChange={(e) => {
                        setDentalAck(e.target.checked);
                        setError("");
                      }}
                      className="rounded border-amber-300 text-amber-600"
                    />
                    I acknowledge the dental coverage exclusions.
                  </label>
                </div>
              )}

              {selectedCategory === "SP" && (
                <div className="space-y-1 bg-sky-50 p-3 rounded-lg border border-sky-100">
                  <label className="text-sm font-bold text-sky-800 flex items-center gap-2">
                    <Stethoscope className="w-4 h-4" />
                    Referral Letter Date
                  </label>
                  <input 
                    type="date" 
                    className="w-full glass-input px-4 py-2 bg-white" 
                    max={new Date().toISOString().split("T")[0]}
                    value={referralDate}
                    onChange={(e) => {
                      setReferralDate(e.target.value);
                      setError("");
                    }}
                  />
                  <p className="text-xs text-sky-600/80">
                    Must be within 14 days prior to the visit date.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Date of Visit</label>
                  <input 
                    type="date" 
                    className="w-full glass-input px-4 py-2" 
                    max={new Date().toISOString().split("T")[0]}
                    value={visitDate}
                    onChange={(e) => {
                      setVisitDate(e.target.value);
                      setError("");
                    }}
                  />
                  {error && !error.toLowerCase().includes("upload") && <p className="text-xs text-red-500 font-medium">{error}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Provider Name</label>
                  <input
                    type="text"
                    placeholder="Enter provider name (panel or non-panel)"
                    className="w-full glass-input px-4 py-2"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-emerald-900">Medical Certificate (MC)</h3>
                  {isEmployeeClaim ? (
                    <p className="text-xs text-emerald-800/80">
                      Indicate whether an MC is required and (if applicable) the MC period.
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-800/80">
                      MC is never required for dependent claims.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">MC Required?</label>
                    <select
                      className="w-full glass-input px-4 py-2 appearance-none bg-white"
                      value={effectiveMcRequired}
                      disabled={!isEmployeeClaim}
                      onChange={(e) => {
                        const next = (e.target.value as "Y" | "N") || "N";
                        setMcRequired(next);
                        if (next === "N") {
                          setMcFrom("");
                          setMcTo("");
                        }
                        setError("");
                      }}
                    >
                      <option value="N">No</option>
                      <option value="Y">Yes</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">MC Days</label>
                    <input
                      type="text"
                      readOnly
                      value={effectiveMcRequired === "Y" ? String(mcDays) : "0"}
                      className="w-full glass-input px-4 py-2 bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">MC From</label>
                    <input
                      type="date"
                      className="w-full glass-input px-4 py-2 bg-white"
                      value={mcFrom}
                      disabled={!isEmployeeClaim || effectiveMcRequired !== "Y"}
                      onChange={(e) => {
                        setMcFrom(e.target.value);
                        setError("");
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">MC To</label>
                    <input
                      type="date"
                      className="w-full glass-input px-4 py-2 bg-white"
                      value={mcTo}
                      disabled={!isEmployeeClaim || effectiveMcRequired !== "Y"}
                      onChange={(e) => {
                        setMcTo(e.target.value);
                        setError("");
                      }}
                    />
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Diagnosis</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select
                    className="w-full glass-select px-4 py-2"
                    value={diagnosisToAdd}
                    onChange={(e) => {
                      setDiagnosisToAdd(e.target.value);
                      setError("");
                    }}
                  >
                    <option value="">Select diagnosis</option>
                    {diagnosisOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <GlassButton type="button" className="sm:self-start" onClick={addDiagnosis}>
                    Add
                  </GlassButton>
                </div>
                {selectedDiagnoses.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedDiagnoses.map((diagnosis) => (
                      <button
                        key={diagnosis}
                        type="button"
                        onClick={() => removeDiagnosis(diagnosis)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100"
                      >
                        {diagnosis} x
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">No diagnosis added yet.</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Amount Submitted</label>
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full glass-input px-4 py-2"
                  step="0.01"
                  min="0"
                  value={amountSubmitted}
                  onChange={(e) => setAmountSubmitted(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Invoice / Receipt No.</label>
                <input
                  type="text"
                  placeholder="Enter invoice or receipt reference"
                  className="w-full glass-input px-4 py-2"
                  value={invoiceReceiptNo}
                  onChange={(e) => setInvoiceReceiptNo(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-500" />
                Upload Documents
              </h2>
              <p className="text-sm text-slate-500">Please provide clear copies of your medical bills and reports.</p>
            </div>

            {selectedCategory === "SP" && (
              <div className="space-y-2">
                 <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                   <Stethoscope className="w-4 h-4 text-amber-500" />
                   GP Referral Letter (Optional)
                 </h3>
                 <label className="border-2 border-dashed border-amber-200 rounded-xl p-4 text-center bg-amber-50/50 hover:bg-amber-100/50 transition-colors cursor-pointer block">
                    <p className="text-sm font-medium text-amber-900">Upload Referral Letter</p>
                    <p className="text-xs text-amber-700/70">Attach if referral was issued within 14 days of appointment</p>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        setReferralFileName(e.target.files?.[0]?.name || "");
                        setError("");
                      }}
                    />
                 </label>
                 {referralFileName && (
                  <p className="text-xs text-amber-700">Uploaded: {referralFileName}</p>
                 )}
              </div>
            )}

            <label className="border-2 border-dashed border-sky-200 rounded-2xl p-12 text-center bg-sky-500/5 hover:bg-sky-500/10 transition-colors cursor-pointer group block">
              <Upload className="w-12 h-12 text-sky-300 mx-auto mb-4 group-hover:scale-110 transition-transform" />
              <p className="font-bold text-sky-900">Click or Drag & Drop Receipts</p>
              <p className="text-xs text-slate-500 mt-1">PDF, JPG, or PNG up to 10MB</p>
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []).map((file) => file.name);
                  setReceiptFiles(files);
                  setError("");
                }}
              />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="border-2 border-dashed border-emerald-200 rounded-xl p-4 text-center bg-emerald-50/60 hover:bg-emerald-100/60 transition-colors cursor-pointer block">
                <p className="text-sm font-semibold text-emerald-800">
                  Upload MC {isEmployeeClaim && effectiveMcRequired === "Y" ? "(Required)" : "(Optional)"}
                </p>
                <p className="text-xs text-emerald-700/70">
                  Medical certificate. Required only for employee/self claims when MC Required is set to Yes.
                </p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    setMcFileName(e.target.files?.[0]?.name || "");
                    setError("");
                  }}
                />
                {mcFileName && <p className="text-xs mt-2 text-emerald-700">{mcFileName}</p>}
              </label>
              <label className="border-2 border-dashed border-violet-200 rounded-xl p-4 text-center bg-violet-50/60 hover:bg-violet-100/60 transition-colors cursor-pointer block">
                <p className="text-sm font-semibold text-violet-800">
                  {selectedCategory === "SP" ? "Upload Additional Referral Letter (Optional)" : "Upload Referral Letter (Optional)"}
                </p>
                <p className="text-xs text-violet-700/70">
                  Attach referral letter if available. This upload is optional.
                </p>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    setRlFileName(e.target.files?.[0]?.name || "");
                    setError("");
                  }}
                />
                {rlFileName && <p className="text-xs mt-2 text-violet-700">{rlFileName}</p>}
              </label>
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            <div className="space-y-3">
              {receiptFiles.map((file) => (
                <div key={file} className="flex items-center justify-between p-3 bg-white/40 rounded-xl border border-white/60">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-sky-500" />
                    <span className="text-sm font-medium text-slate-700">{file}</span>
                  </div>
                  <GlassButton
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500"
                    onClick={() => setReceiptFiles((prev) => prev.filter((item) => item !== file))}
                  >
                    <AlertCircle className="w-4 h-4" />
                  </GlassButton>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 text-center py-8">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">Ready to Submit!</h2>
              <p className="text-slate-500 max-w-sm mx-auto">
                Please review your details one last time. Once submitted, our team will begin processing your claim.
              </p>
            </div>

            <GlassCard className="bg-slate-50/50 text-left space-y-3 p-4 border-slate-200">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Patient</span>
                <span className="font-bold text-slate-800">{selectedPatient || "Not Selected"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Category</span>
                <span className="font-bold text-slate-800">{selectedCategory || "N/A"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Visit Date</span>
                <span className="font-bold text-slate-800">{formatDateDisplay(visitDate) || visitDate}</span>
              </div>
              <div className="flex justify-between gap-4 text-sm">
                <span className="text-slate-500">Diagnosis</span>
                <span className="text-right font-bold text-slate-800">{diagnosisSummary || "N/A"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Amount Submitted</span>
                <span className="font-bold text-slate-800">{formatCurrency(amountSubmitted)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Invoice / Receipt No.</span>
                <span className="font-bold text-slate-800">{invoiceReceiptNo || "N/A"}</span>
              </div>
            </GlassCard>
          </div>
        )}

        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/40">
          <GlassButton 
            variant="secondary" 
            onClick={prevStep} 
            className={cn(step === 1 && "invisible")}
          >
            Back
          </GlassButton>
          
          {step < totalSteps ? (
            <GlassButton onClick={nextStep} className="gap-2">
              Continue
              <ArrowRight className="w-4 h-4" />
            </GlassButton>
          ) : (
            <GlassButton
              className="flex-1 ml-4 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
              onClick={handleSubmitClaim}
            >
              Submit Claim Now
            </GlassButton>
          )}
        </div>
      </GlassCard>

      <div className="flex items-center gap-3 p-4 bg-sky-500/5 rounded-2xl border border-sky-100">
        <AlertCircle className="w-5 h-5 text-sky-600 shrink-0" />
        <p className="text-xs text-sky-700 leading-relaxed">
          <strong>Important:</strong> Claims usually take 3-5 business days to process. You can track the status in your dashboard.
        </p>
      </div>

      <MobileDetailModal
        open={isSuccessModalOpen}
        onClose={() => setIsSuccessModalOpen(false)}
        title="Claim Submitted Successfully"
        subtitle={lastSubmittedClaimId ? `Reference: ${lastSubmittedClaimId}` : undefined}
        footer={
          <>
            <GlassButton variant="secondary" onClick={() => setIsSuccessModalOpen(false)}>
              Stay Here
            </GlassButton>
            <GlassButton
              onClick={() => {
                setIsSuccessModalOpen(false);
                router.push("/member/dashboard");
              }}
            >
              Go To Dashboard
            </GlassButton>
          </>
        }
      >
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <p className="text-base font-semibold text-slate-800">Your claim has been submitted for review.</p>
            <p className="text-sm text-slate-500">
              You can monitor the claim status from your dashboard or claim history.
            </p>
          </div>
        </div>
      </MobileDetailModal>
    </div>
  );
}
