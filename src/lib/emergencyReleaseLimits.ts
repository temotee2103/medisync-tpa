import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type EmergencyReleaseLimit = {
  category: string;
  amount: number;
};

type SystemSettingRow = {
  setting_key: string;
  data: {
    limits?: Array<{ category?: string; amount?: number }>;
  } | null;
};

const SETTING_KEY = "emergency_release_limits";

export const normalizeEmergencyReleaseCategory = (value: string) =>
  String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");

export const normalizeEmergencyReleaseLimits = (limits: EmergencyReleaseLimit[]) => {
  const deduped = new Map<string, EmergencyReleaseLimit>();

  limits.forEach((limit) => {
    const category = String(limit.category || "").trim();
    const normalizedCategory = normalizeEmergencyReleaseCategory(category);
    const amount = Number(limit.amount);
    if (!category || !normalizedCategory || !Number.isFinite(amount) || amount < 0) return;
    deduped.set(normalizedCategory, {
      category,
      amount,
    });
  });

  return Array.from(deduped.values()).sort((left, right) => left.category.localeCompare(right.category));
};

export const validateEmergencyReleaseLimit = (input: {
  category: string;
  amount: number;
  limits: EmergencyReleaseLimit[];
}) => {
  const normalizedCategory = normalizeEmergencyReleaseCategory(input.category);
  const amount = Number(input.amount);
  if (!normalizedCategory || !Number.isFinite(amount)) return "";

  const matchedLimit = normalizeEmergencyReleaseLimits(input.limits).find(
    (limit) => normalizeEmergencyReleaseCategory(limit.category) === normalizedCategory
  );

  if (!matchedLimit) return "";
  if (amount <= matchedLimit.amount) return "";

  return `Emergency release limit exceeded for ${matchedLimit.category}. Configured limit is RM ${matchedLimit.amount.toLocaleString("en-MY")}.`;
};

export const loadEmergencyReleaseLimits = async () => {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("setting_key,data")
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();

  if (error) throw error;

  const row = data as SystemSettingRow | null;
  return normalizeEmergencyReleaseLimits(
    Array.isArray(row?.data?.limits)
      ? row!.data!.limits!.map((limit) => ({
          category: String(limit.category || ""),
          amount: Number(limit.amount || 0),
        }))
      : []
  );
};

export const saveEmergencyReleaseLimits = async (limits: EmergencyReleaseLimit[]) => {
  const normalizedLimits = normalizeEmergencyReleaseLimits(limits);
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("system_settings").upsert(
    {
      setting_key: SETTING_KEY,
      data: { limits: normalizedLimits },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "setting_key" }
  );

  if (error) throw error;
  return normalizedLimits;
};

export const assertEmergencyReleaseLimit = async (input: {
  category: string;
  amount: number;
}) => {
  const limits = await loadEmergencyReleaseLimits();
  const error = validateEmergencyReleaseLimit({
    category: input.category,
    amount: input.amount,
    limits,
  });

  if (error) throw new Error(error);
};
