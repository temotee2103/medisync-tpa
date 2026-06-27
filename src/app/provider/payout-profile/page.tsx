"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassField } from "@/components/ui/GlassField";
import { GlassInput } from "@/components/ui/GlassInput";
import { getProviderSession } from "@/lib/providerSession";
import { getProviderPayoutProfile, upsertProviderPayoutProfile } from "@/lib/payoutProfilesStore";
import { showToast } from "@/components/ui/Toast";

export default function ProviderPayoutProfilePage() {
  const session = getProviderSession();
  const [isLoading, setIsLoading] = useState(true);
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchName, setBranchName] = useState("");
  const [paymentReferenceNote, setPaymentReferenceNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!session?.vendorId) {
          if (!cancelled) showToast("Session not found.", "error");
          return;
        }
        const existing = await getProviderPayoutProfile(session.vendorId);
        if (!cancelled && existing) {
          setBeneficiaryName(existing.beneficiaryName);
          setBankName(existing.bankName);
          setAccountNumber(existing.accountNumber);
          setBranchName(existing.branchName || "");
          setPaymentReferenceNote(existing.paymentReferenceNote || "");
        }
      } catch (e: unknown) {
        if (!cancelled) showToast(e instanceof Error ? e.message : "Failed to load payout profile.", "error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.vendorId]);

  const onSave = async () => {
    if (!session?.vendorId) {
      showToast("Session not found.", "error");
      return;
    }
    if (!beneficiaryName.trim() || !bankName.trim() || !accountNumber.trim()) {
      showToast("Beneficiary name, bank name, and account number are required.", "error");
      return;
    }
    try {
      await upsertProviderPayoutProfile({
        providerId: session.vendorId,
        beneficiaryName,
        bankName,
        accountNumber,
        branchName,
        paymentReferenceNote,
      });
      showToast("Payout details saved.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to save payout profile.", "error");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payout Details</h1>
        <p className="text-slate-500">Add bank details so settlements can be completed.</p>
      </div>

      <GlassCard className="p-6 space-y-4">
        {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}

        <GlassField label="Beneficiary Name">
          <GlassInput value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} />
        </GlassField>
        <GlassField label="Bank Name">
          <GlassInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </GlassField>
        <GlassField label="Account Number">
          <GlassInput value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </GlassField>
        <GlassField label="Branch Name (optional)">
          <GlassInput value={branchName} onChange={(e) => setBranchName(e.target.value)} />
        </GlassField>
        <GlassField label="Payment Reference Note (optional)">
          <GlassInput value={paymentReferenceNote} onChange={(e) => setPaymentReferenceNote(e.target.value)} />
        </GlassField>

        <div className="flex justify-end">
          <GlassButton onClick={onSave}>Save</GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}
