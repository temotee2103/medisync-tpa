"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

let memberPayoutProfilesTableMissing = false;
let providerPayoutProfilesTableMissing = false;

type MemberPayoutProfileRow = {
  id: string;
  member_id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type ProviderPayoutProfileRow = {
  id: string;
  provider_id: string;
  beneficiary_name: string;
  bank_name: string;
  account_number: string;
  branch_name: string | null;
  payment_reference_note: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberPayoutProfile = {
  id: string;
  memberId: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderPayoutProfile = {
  id: string;
  providerId: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  branchName?: string;
  paymentReferenceNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type MemberPayoutProfileInput = {
  memberId: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  note?: string;
};

export type ProviderPayoutProfileInput = {
  providerId: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  branchName?: string;
  paymentReferenceNote?: string;
};

const mapMemberPayoutProfile = (row: MemberPayoutProfileRow): MemberPayoutProfile => ({
  id: row.id,
  memberId: row.member_id,
  accountHolderName: row.account_holder_name,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  note: row.note || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProviderPayoutProfile = (row: ProviderPayoutProfileRow): ProviderPayoutProfile => ({
  id: row.id,
  providerId: row.provider_id,
  beneficiaryName: row.beneficiary_name,
  bankName: row.bank_name,
  accountNumber: row.account_number,
  branchName: row.branch_name || undefined,
  paymentReferenceNote: row.payment_reference_note || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const isMissingTableError = (error: { code?: string; message?: string; details?: string } | null | undefined) => {
  const combined = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return combined.includes("pgrst205") || combined.includes("42p01") || combined.includes("not found");
};

export const getMemberPayoutProfiles = async () => {
  if (memberPayoutProfilesTableMissing) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("public")
    .from("member_payout_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      memberPayoutProfilesTableMissing = true;
      return [];
    }
    throw error;
  }
  return (data || []).map((row) => mapMemberPayoutProfile(row as MemberPayoutProfileRow));
};

export const getProviderPayoutProfiles = async () => {
  if (providerPayoutProfilesTableMissing) return [];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("public")
    .from("provider_payout_profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      providerPayoutProfilesTableMissing = true;
      return [];
    }
    throw error;
  }
  return (data || []).map((row) => mapProviderPayoutProfile(row as ProviderPayoutProfileRow));
};

export const getMemberPayoutProfile = async (memberId: string) => {
  if (memberPayoutProfilesTableMissing) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("public")
    .from("member_payout_profiles")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      memberPayoutProfilesTableMissing = true;
      return null;
    }
    throw error;
  }
  return data ? mapMemberPayoutProfile(data as MemberPayoutProfileRow) : null;
};

export const getProviderPayoutProfile = async (providerId: string) => {
  if (providerPayoutProfilesTableMissing) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema("public")
    .from("provider_payout_profiles")
    .select("*")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      providerPayoutProfilesTableMissing = true;
      return null;
    }
    throw error;
  }
  return data ? mapProviderPayoutProfile(data as ProviderPayoutProfileRow) : null;
};

export const upsertMemberPayoutProfile = async (profile: MemberPayoutProfileInput) => {
  const supabase = createSupabaseBrowserClient();
  const payload = {
    member_id: profile.memberId,
    account_holder_name: profile.accountHolderName.trim(),
    bank_name: profile.bankName.trim(),
    account_number: profile.accountNumber.trim(),
    note: profile.note?.trim() || null,
  };

  const { data, error } = await supabase
    .schema("public")
    .from("member_payout_profiles")
    .upsert(payload, { onConflict: "member_id" })
    .select("*")
    .single();

  if (error) throw error;
  return mapMemberPayoutProfile(data as MemberPayoutProfileRow);
};

export const upsertProviderPayoutProfile = async (profile: ProviderPayoutProfileInput) => {
  const supabase = createSupabaseBrowserClient();
  const payload = {
    provider_id: profile.providerId,
    beneficiary_name: profile.beneficiaryName.trim(),
    bank_name: profile.bankName.trim(),
    account_number: profile.accountNumber.trim(),
    branch_name: profile.branchName?.trim() || null,
    payment_reference_note: profile.paymentReferenceNote?.trim() || null,
  };

  const { data, error } = await supabase
    .schema("public")
    .from("provider_payout_profiles")
    .upsert(payload, { onConflict: "provider_id" })
    .select("*")
    .single();

  if (error) throw error;
  return mapProviderPayoutProfile(data as ProviderPayoutProfileRow);
};
