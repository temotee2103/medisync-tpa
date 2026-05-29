import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type PanelVisitTransaction = {
  id: string;
  claimId: string;
  providerId: string;
  memberKey: string;
  patientId: string;
  patientName: string;
  visitDateTime: string;
  serviceType: string;
  amount: number;
  createdAt: string;
};

export type PanelVisitTransactionInput = {
  id?: string;
  claimId: string;
  providerId?: string;
  memberKey: string;
  patientId: string;
  patientName: string;
  visitDateTime: string;
  serviceType?: string;
  amount?: number;
  createdAt?: string;
  dedupeKey: string;
};

type PanelVisitTransactionRow = {
  id: string | null;
  claim_id: string | null;
  provider_id: string | null;
  member_key: string | null;
  patient_id: string | null;
  patient_name: string | null;
  visit_datetime: string | null;
  service_type: string | null;
  amount: string | number | null;
  created_at: string | null;
};

let panelVisitTransactionsSnapshot: PanelVisitTransaction[] = [];
let panelVisitTransactionsHydrated = false;
let panelVisitTransactionsLoadPromise: Promise<void> | null = null;
const PANEL_VISIT_TRANSACTIONS_SERVER_SNAPSHOT: PanelVisitTransaction[] = [];
const panelVisitTransactionListeners = new Set<() => void>();
const PANEL_VISIT_TRANSACTION_SELECT =
  "id,claim_id,provider_id,member_key,patient_id,patient_name,visit_datetime,service_type,amount,created_at";

const emitPanelVisitTransactions = () => {
  panelVisitTransactionListeners.forEach((listener) => listener());
};

const mapPanelVisitTransactionRow = (row: PanelVisitTransactionRow): PanelVisitTransaction => ({
  id: String(row.id),
  claimId: String(row.claim_id),
  providerId: String(row.provider_id || ""),
  memberKey: String(row.member_key || ""),
  patientId: String(row.patient_id || ""),
  patientName: String(row.patient_name || ""),
  visitDateTime: row.visit_datetime ? String(row.visit_datetime) : "",
  serviceType: String(row.service_type || ""),
  amount: Number(row.amount || 0),
  createdAt: row.created_at ? String(row.created_at) : "",
});

const upsertPanelVisitTransactionsSnapshotEntry = (entry: PanelVisitTransaction) => {
  panelVisitTransactionsSnapshot = [...panelVisitTransactionsSnapshot.filter((row) => row.id !== entry.id), entry].sort(
    (left, right) => right.createdAt.localeCompare(left.createdAt)
  );
  panelVisitTransactionsHydrated = true;
  emitPanelVisitTransactions();
};

export const buildPanelVisitTransactionId = (dedupeKey: string) => `panel-visit:${dedupeKey.trim()}`;

const normalizePanelVisitTransactionInput = (input: PanelVisitTransactionInput): PanelVisitTransaction => ({
  id: input.id || buildPanelVisitTransactionId(input.dedupeKey),
  claimId: input.claimId,
  providerId: input.providerId || "",
  memberKey: input.memberKey,
  patientId: input.patientId,
  patientName: input.patientName,
  visitDateTime: input.visitDateTime,
  serviceType: input.serviceType || "",
  amount: Number(input.amount || 0),
  createdAt: input.createdAt || new Date().toISOString(),
});

export const subscribePanelVisitTransactions = (listener: () => void) => {
  panelVisitTransactionListeners.add(listener);
  return () => panelVisitTransactionListeners.delete(listener);
};

export const getPanelVisitTransactionsSnapshot = () => panelVisitTransactionsSnapshot;
export const getPanelVisitTransactionsServerSnapshot = () => PANEL_VISIT_TRANSACTIONS_SERVER_SNAPSHOT;

const refreshPanelVisitTransactionsSnapshot = async () => {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("panel_visit_transactions")
    .select(PANEL_VISIT_TRANSACTION_SELECT)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  panelVisitTransactionsSnapshot = ((data as PanelVisitTransactionRow[] | null) || []).map((row) =>
    mapPanelVisitTransactionRow(row)
  );
  panelVisitTransactionsHydrated = true;
  emitPanelVisitTransactions();
};

export const ensurePanelVisitTransactionsStore = () => {
  if (typeof window === "undefined") return;
  if (panelVisitTransactionsHydrated) return;
  if (panelVisitTransactionsLoadPromise) return;
  panelVisitTransactionsLoadPromise = refreshPanelVisitTransactionsSnapshot()
    .catch(() => {
      panelVisitTransactionsSnapshot = [];
      panelVisitTransactionsHydrated = true;
      emitPanelVisitTransactions();
    })
    .finally(() => {
      panelVisitTransactionsLoadPromise = null;
    });
};

export const resetPanelVisitTransactionsStore = () => {
  panelVisitTransactionsSnapshot = [];
  panelVisitTransactionsHydrated = false;
  panelVisitTransactionsLoadPromise = null;
  emitPanelVisitTransactions();
};

export const getPanelVisitTransactions = () => {
  ensurePanelVisitTransactionsStore();
  return panelVisitTransactionsSnapshot;
};

export const upsertPanelVisitTransaction = async (input: PanelVisitTransactionInput) => {
  const supabase = createSupabaseBrowserClient();
  const normalized = normalizePanelVisitTransactionInput(input);

  const { data: existingById, error: existingByIdError } = await supabase
    .from("panel_visit_transactions")
    .select(PANEL_VISIT_TRANSACTION_SELECT)
    .eq("id", normalized.id)
    .maybeSingle();

  if (existingByIdError) throw existingByIdError;

  if (existingById) {
    const existingEntry = mapPanelVisitTransactionRow(existingById);
    upsertPanelVisitTransactionsSnapshotEntry(existingEntry);
    return existingEntry;
  }

  const { data: existingByClaimRows, error: existingByClaimError } = await supabase
    .from("panel_visit_transactions")
    .select(PANEL_VISIT_TRANSACTION_SELECT)
    .eq("claim_id", normalized.claimId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingByClaimError) throw existingByClaimError;

  const existingByClaim = ((existingByClaimRows as PanelVisitTransactionRow[] | null) || [])[0];
  if (existingByClaim) {
    const existingEntry = mapPanelVisitTransactionRow(existingByClaim);
    upsertPanelVisitTransactionsSnapshotEntry(existingEntry);
    return existingEntry;
  }

  const { data, error } = await supabase
    .from("panel_visit_transactions")
    .upsert(
      [
        {
          id: normalized.id,
          claim_id: normalized.claimId,
          provider_id: normalized.providerId || null,
          member_key: normalized.memberKey,
          patient_id: normalized.patientId,
          patient_name: normalized.patientName,
          visit_datetime: normalized.visitDateTime,
          service_type: normalized.serviceType,
          amount: normalized.amount,
          created_at: normalized.createdAt,
        },
      ],
      { onConflict: "id" }
    )
    .select(PANEL_VISIT_TRANSACTION_SELECT)
    .single();

  if (error) throw error;

  const savedEntry = mapPanelVisitTransactionRow(data);
  upsertPanelVisitTransactionsSnapshotEntry(savedEntry);
  return savedEntry;
};

export const addPanelVisitTransaction = (entry: PanelVisitTransaction) => {
  void upsertPanelVisitTransaction({
    id: entry.id,
    claimId: entry.claimId,
    providerId: entry.providerId,
    memberKey: entry.memberKey,
    patientId: entry.patientId,
    patientName: entry.patientName,
    visitDateTime: entry.visitDateTime,
    serviceType: entry.serviceType,
    amount: entry.amount,
    createdAt: entry.createdAt,
    dedupeKey: entry.claimId || entry.id,
  }).then(
    () => {},
    () => {}
  );
};
