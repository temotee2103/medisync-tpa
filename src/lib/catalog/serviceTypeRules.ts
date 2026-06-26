export type CatalogSection =
  | "consultation"
  | "medication"
  | "injection"
  | "diagnosis"
  | "procedure"
  | "immunization";

export type ServiceTypeRule = {
  serviceType: string;
  allowedSections: CatalogSection[];
};

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ServiceTypeRuleRow = {
  service_type: string;
  allowed_sections: string[];
};

let rulesSnapshot: ServiceTypeRule[] = [];
let rulesInitialized = false;
const rulesListeners = new Set<() => void>();
const SERVICE_TYPE_RULES_SERVER_SNAPSHOT: ServiceTypeRule[] = [];

const emitRules = () => {
  rulesListeners.forEach((l) => l());
};

export const subscribeServiceTypeRules = (listener: () => void) => {
  rulesListeners.add(listener);
  return () => rulesListeners.delete(listener);
};

export const getServiceTypeRulesSnapshot = () => rulesSnapshot;
export const getServiceTypeRulesServerSnapshot = () => SERVICE_TYPE_RULES_SERVER_SNAPSHOT;

export async function refreshServiceTypeRulesSnapshot() {
  if (typeof window === "undefined") return;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("service_type_rules")
      .select("service_type,allowed_sections")
      .order("service_type");
    if (error) throw error;
    rulesSnapshot = ((data || []) as ServiceTypeRuleRow[]).map((row) => ({
      serviceType: row.service_type,
      allowedSections: (row.allowed_sections || []).filter(Boolean) as CatalogSection[],
    }));
  } catch {
    rulesSnapshot = [];
  } finally {
    emitRules();
  }
}

export function ensureServiceTypeRulesSeed() {
  if (typeof window === "undefined") return;
  if (rulesInitialized) return;
  rulesInitialized = true;
  void refreshServiceTypeRulesSnapshot();
}

export function getServiceTypeRules() {
  return rulesSnapshot;
}

export function isSectionAllowed(serviceType: string, section: CatalogSection) {
  const rules = getServiceTypeRules();
  const norm = (value: string) => (value || "").trim().toLowerCase();
  const wanted = norm(serviceType);
  const rule = rules.find((r) => norm(r.serviceType) === wanted) || rules.find((r) => norm(r.serviceType) === "others");
  if (!rule) return true;
  const allowed = (rule.allowedSections || []).filter(Boolean) as CatalogSection[];
  if (allowed.length === 0) return true;
  return allowed.includes(section);
}

export function saveServiceTypeRules(rules: ServiceTypeRule[]) {
  const run = async () => {
    const supabase = createSupabaseBrowserClient();
    const payload = rules.map((r) => ({
      service_type: r.serviceType,
      allowed_sections: r.allowedSections,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("service_type_rules").upsert(payload, { onConflict: "service_type" });
    if (error) throw error;
    await refreshServiceTypeRulesSnapshot();
  };
  void run();
}
