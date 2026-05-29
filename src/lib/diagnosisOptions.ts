import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function fetchDiagnosisOptions(): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("diagnosis_options")
    .select("diagnosis,status")
    .eq("status", "Active")
    .order("diagnosis", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => String(row.diagnosis)).filter(Boolean);
}

