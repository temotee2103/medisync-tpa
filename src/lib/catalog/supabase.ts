import type { CatalogItem, CatalogStatus, CatalogType } from "@/lib/catalog/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type CatalogItemData = Record<string, unknown>;

export type CatalogItemRow = {
  id: string;
  catalog_type: string;
  name: string;
  status: CatalogStatus;
  data: CatalogItemData;
  created_at: string;
  updated_at: string;
};

const toCatalogItem = (row: CatalogItemRow): CatalogItem => ({
  id: row.id,
  name: row.name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function fetchCatalogItems(type: CatalogType): Promise<CatalogItem[]> {
  const rows = await fetchCatalogItemRows(type);
  return rows.map((row) => toCatalogItem(row));
}

export async function fetchCatalogItemRows(type: CatalogType): Promise<CatalogItemRow[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("id,catalog_type,name,status,data,created_at,updated_at")
    .eq("catalog_type", type)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []) as CatalogItemRow[];
}

export async function insertCatalogItem(type: CatalogType, name: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const trimmed = name.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("catalog_items").insert({
    catalog_type: type,
    name: trimmed,
    status: "Active",
    data: {},
  });

  if (error) throw error;
}

export async function upsertCatalogItem(
  type: CatalogType,
  payload: { id?: string; name: string; status?: CatalogStatus; data?: CatalogItemData }
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const name = payload.name.trim();
  if (!name) return;
  const status = payload.status || "Active";
  const data = payload.data || {};

  const onConflict = payload.id ? "id" : "catalog_type,name";
  const { error } = await supabase.from("catalog_items").upsert(
    {
      id: payload.id,
      catalog_type: type,
      name,
      status,
      data,
    },
    { onConflict }
  );
  if (error) throw error;
}

export async function replaceCatalog(type: CatalogType, names: string[]): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const normalized = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));

  const { error: deleteError } = await supabase.from("catalog_items").delete().eq("catalog_type", type);
  if (deleteError) throw deleteError;

  if (normalized.length === 0) return;

  const { error: insertError } = await supabase.from("catalog_items").insert(
    normalized.map((name) => ({
      catalog_type: type,
      name,
      status: "Active",
      data: {},
    }))
  );

  if (insertError) throw insertError;
}

export async function replaceCatalogWithData(
  type: CatalogType,
  rows: Array<{ name: string; data?: CatalogItemData }>
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const normalized = rows
    .map((r) => ({ name: r.name.trim(), data: r.data || {} }))
    .filter((r) => r.name);

  const { error: deleteError } = await supabase.from("catalog_items").delete().eq("catalog_type", type);
  if (deleteError) throw deleteError;

  if (normalized.length === 0) return;

  const { error: insertError } = await supabase.from("catalog_items").insert(
    normalized.map((r) => ({
      catalog_type: type,
      name: r.name,
      status: "Active",
      data: r.data,
    }))
  );
  if (insertError) throw insertError;
}

export async function mergeCatalog(type: CatalogType, names: string[]): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const normalized = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (normalized.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("catalog_items")
    .select("id,name")
    .eq("catalog_type", type);
  if (existingError) throw existingError;

  const existingNames = new Set((existing || []).map((r: any) => String(r.name).toLowerCase()));
  const toInsert = normalized.filter((n) => !existingNames.has(n.toLowerCase()));
  if (toInsert.length === 0) return;

  const { error: insertError } = await supabase.from("catalog_items").insert(
    toInsert.map((name) => ({
      catalog_type: type,
      name,
      status: "Active",
      data: {},
    }))
  );

  if (insertError) throw insertError;
}

export async function mergeCatalogWithData(
  type: CatalogType,
  rows: Array<{ name: string; data?: CatalogItemData }>
): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const normalized = rows
    .map((r) => ({ name: r.name.trim(), data: r.data || {} }))
    .filter((r) => r.name);
  if (normalized.length === 0) return;

  const existing = await fetchCatalogItemRows(type);
  const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));
  const toInsert = normalized.filter((r) => !existingNames.has(r.name.toLowerCase()));
  if (toInsert.length === 0) return;

  const { error: insertError } = await supabase.from("catalog_items").insert(
    toInsert.map((r) => ({
      catalog_type: type,
      name: r.name,
      status: "Active",
      data: r.data,
    }))
  );
  if (insertError) throw insertError;
}

export async function setCatalogItemStatus(id: string, status: CatalogStatus): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("catalog_items").update({ status }).eq("id", id);
  if (error) throw error;
}
