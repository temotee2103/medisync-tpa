"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassField } from "@/components/ui/GlassField";
import { GlassInput } from "@/components/ui/GlassInput";
import { getMemberSession } from "@/lib/memberSession";
import { getMemberPayoutProfile, upsertMemberPayoutProfile } from "@/lib/payoutProfilesStore";

export default function MemberPayoutProfilePage() {
  const session = getMemberSession();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!session?.memberId) {
          if (!cancelled) setError("Session not found.");
          return;
        }
        const existing = await getMemberPayoutProfile(session.memberId);
        if (!cancelled && existing) {
          setAccountHolderName(existing.accountHolderName);
          setBankName(existing.bankName);
          setAccountNumber(existing.accountNumber);
          setNote(existing.note || "");
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load payout profile.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.memberId]);

  const onSave = async () => {
    setError("");
    setSuccess("");
    if (!session?.memberId) {
      setError("Session not found.");
      return;
    }
    if (!accountHolderName.trim() || !bankName.trim() || !accountNumber.trim()) {
      setError("Account holder name, bank name, and account number are required.");
      return;
    }
    try {
      await upsertMemberPayoutProfile({
        memberId: session.memberId,
        accountHolderName,
        bankName,
        accountNumber,
        note,
      });
      setSuccess("Payout details saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save payout profile.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payout Details</h1>
        <p className="text-slate-500">Add bank details so reimbursements can be completed.</p>
      </div>

      <GlassCard className="p-6 space-y-4">
        {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}

        <GlassField label="Account Holder Name">
          <GlassInput value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
        </GlassField>
        <GlassField label="Bank Name">
          <GlassInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
        </GlassField>
        <GlassField label="Account Number">
          <GlassInput value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </GlassField>
        <GlassField label="Note (optional)">
          <GlassInput value={note} onChange={(e) => setNote(e.target.value)} />
        </GlassField>

        <div className="flex justify-end">
          <GlassButton onClick={onSave}>Save</GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}
