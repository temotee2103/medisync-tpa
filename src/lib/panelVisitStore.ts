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

const KEY = "panel_visit_transactions";

const read = <T,>(fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as T) : fallback;
};

const write = (value: unknown) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(value));
};

export const getPanelVisitTransactions = () => read<PanelVisitTransaction[]>([]);

export const addPanelVisitTransaction = (entry: PanelVisitTransaction) => {
  const next = [...getPanelVisitTransactions().filter((e) => e.id !== entry.id), entry];
  write(next);
};

