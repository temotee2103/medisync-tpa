import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export async function fetchDiagnosisOptions(): Promise<string[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("name,status")
    .eq("catalog_type", "diagnoses")
    .eq("status", "Active")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => String(row.name)).filter(Boolean);
}
