import type { CompanyPlanCategoryKey } from "@/lib/companyStore";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ClaimLimitLock = {
  claimId: string;
  memberKey: string;
  amount: number;
  category: CompanyPlanCategoryKey;
  createdAt: string;
};

export type ClaimUtilization = {
  claimId: string;
  memberKey: string;
  amount: number;
  category: CompanyPlanCategoryKey;
  approvedAt: string;
};

type EntitlementLockRow = {
  claim_id: string;
  member_key: string;
  category: string;
  amount: string | number;
  created_at: string;
  updated_at: string;
};

type EntitlementUtilizationRow = {
  claim_id: string;
  member_key: string;
  category: string;
  amount: string | number;
  approved_at: string;
  created_at: string;
};

let entitlementLocksSnapshot: ClaimLimitLock[] = [];
let entitlementUtilizationsSnapshot: ClaimUtilization[] = [];
let entitlementLoaded = false;
let entitlementLoadPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const subscribeEntitlements = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const refreshEntitlementsSnapshot = async () => {
  const supabase = createSupabaseBrowserClient();
  const [{ data: locks, error: lockError }, { data: utilizations, error: utilError }] = await Promise.all([
    supabase.from("entitlement_locks").select("claim_id,member_key,category,amount,created_at,updated_at").order("created_at", { ascending: false }),
    supabase
      .from("entitlement_utilizations")
      .select("claim_id,member_key,category,amount,approved_at,created_at")
      .order("approved_at", { ascending: false }),
  ]);
  if (lockError) throw lockError;
  if (utilError) throw utilError;

  entitlementLocksSnapshot = ((locks as EntitlementLockRow[] | null) || []).map((row) => ({
    claimId: String(row.claim_id),
    memberKey: String(row.member_key),
    category: String(row.category) as CompanyPlanCategoryKey,
    amount: Number(row.amount || 0),
    createdAt: String(row.created_at),
  }));

  entitlementUtilizationsSnapshot = ((utilizations as EntitlementUtilizationRow[] | null) || []).map((row) => ({
    claimId: String(row.claim_id),
    memberKey: String(row.member_key),
    category: String(row.category) as CompanyPlanCategoryKey,
    amount: Number(row.amount || 0),
    approvedAt: String(row.approved_at),
  }));

  entitlementLoaded = true;
  emit();
};

export const ensureEntitlementsStore = async (forceRefresh = false) => {
  if (typeof window === "undefined") return;
  if (!forceRefresh && entitlementLoaded) return;
  if (entitlementLoadPromise) return entitlementLoadPromise;
  entitlementLoadPromise = refreshEntitlementsSnapshot()
    .catch(() => {
      entitlementLocksSnapshot = [];
      entitlementUtilizationsSnapshot = [];
      entitlementLoaded = true;
      emit();
    })
    .finally(() => {
      entitlementLoadPromise = null;
    });
  return entitlementLoadPromise;
};

export const resetEntitlementsStore = () => {
  entitlementLocksSnapshot = [];
  entitlementUtilizationsSnapshot = [];
  entitlementLoaded = false;
  entitlementLoadPromise = null;
  emit();
};

export const getLimitLocks = () => {
  if (typeof window !== "undefined") void ensureEntitlementsStore();
  return entitlementLocksSnapshot;
};

export const getUtilizations = () => {
  if (typeof window !== "undefined") void ensureEntitlementsStore();
  return entitlementUtilizationsSnapshot;
};

export const reserveLimit = (lock: Omit<ClaimLimitLock, "createdAt"> & { createdAt?: string }) => {
  const createdAt = lock.createdAt || new Date().toISOString();
  const next = entitlementLocksSnapshot.filter((entry) => entry.claimId !== lock.claimId);
  next.push({ ...lock, createdAt });
  entitlementLocksSnapshot = next;
  emit();

  const supabase = createSupabaseBrowserClient();
  void supabase
    .from("entitlement_locks")
    .upsert(
      [
        {
          claim_id: lock.claimId,
          member_key: lock.memberKey,
          category: lock.category,
          amount: lock.amount,
          created_at: createdAt,
          updated_at: createdAt,
        },
      ],
      { onConflict: "claim_id" }
    )
    .then(
      () => {},
      () => {}
    );
};

export const releaseReservation = (claimId: string) => {
  entitlementLocksSnapshot = entitlementLocksSnapshot.filter((entry) => entry.claimId !== claimId);
  emit();

  const supabase = createSupabaseBrowserClient();
  void supabase
    .from("entitlement_locks")
    .delete()
    .eq("claim_id", claimId)
    .then(
      () => {},
      () => {}
    );
};

export const consumeReservation = (claimId: string, approvedAt?: string) => {
  const lock = entitlementLocksSnapshot.find((entry) => entry.claimId === claimId);
  if (!lock) return;

  entitlementLocksSnapshot = entitlementLocksSnapshot.filter((entry) => entry.claimId !== claimId);
  const nextApprovedAt = approvedAt || new Date().toISOString();
  entitlementUtilizationsSnapshot = entitlementUtilizationsSnapshot.filter((entry) => entry.claimId !== claimId);
  entitlementUtilizationsSnapshot.push({
    claimId,
    memberKey: lock.memberKey,
    amount: lock.amount,
    category: lock.category,
    approvedAt: nextApprovedAt,
  });
  emit();

  const supabase = createSupabaseBrowserClient();
  void Promise.all([
    supabase.from("entitlement_locks").delete().eq("claim_id", claimId),
    supabase.from("entitlement_utilizations").upsert(
      [
        {
          claim_id: claimId,
          member_key: lock.memberKey,
          category: lock.category,
          amount: lock.amount,
          approved_at: nextApprovedAt,
        },
      ],
      { onConflict: "claim_id" }
    ),
  ])
    .then(
      () => {},
      () => {}
    );
};
