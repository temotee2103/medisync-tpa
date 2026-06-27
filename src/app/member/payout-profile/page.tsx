"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassField } from "@/components/ui/GlassField";
import { GlassInput } from "@/components/ui/GlassInput";
import { getMemberSession } from "@/lib/memberSession";
import { getMemberPayoutProfile, upsertMemberPayoutProfile } from "@/lib/payoutProfilesStore";
import { showToast } from "@/components/ui/Toast";

export default function MemberPayoutProfilePage() {
  const session = getMemberSession();
  const [isLoading, setIsLoading] = useState(true);
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!session?.memberId) {
          if (!cancelled) showToast("Session not found.", "error");
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
        if (!cancelled) showToast(e instanceof Error ? e.message : "Failed to load payout profile.", "error");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.memberId]);

  const onSave = async () => {
    if (!session?.memberId) {
      showToast("Session not found.", "error");
      return;
    }
    if (!accountHolderName.trim() || !bankName.trim() || !accountNumber.trim()) {
      showToast("Account holder name, bank name, and account number are required.", "error");
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
      showToast("Payout details saved.", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed to save payout profile.", "error");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payout Details</h1>
      </div>

      <GlassCard className="p-6 space-y-4">
        {isLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}

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
