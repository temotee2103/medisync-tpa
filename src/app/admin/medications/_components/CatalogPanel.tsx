"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { cn } from "@/lib/utils";
import { readExcel, parseSingleColumnList, parseInvestigations, parseFrequencyAndUnits } from "@/lib/catalog/importers";
import type { CatalogItem, CatalogStatus, CatalogType } from "@/lib/catalog/types";
import {
  fetchCatalogItemRows,
  fetchCatalogItems,
  insertCatalogItem,
  mergeCatalog,
  mergeCatalogWithData,
  replaceCatalog,
  replaceCatalogWithData,
  setCatalogItemStatus,
} from "@/lib/catalog/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAdminSession, type AdminRole } from "@/lib/adminSession";
import { isAdminReadOnly } from "@/lib/adminPermissions";
import { AlertCircle, Plus, RefreshCcw, Save, Search, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ImportMode = "merge" | "replace";

type Props = {
  catalogType: CatalogType;
};

const statusOptions: CatalogStatus[] = ["Active", "Inactive"];

const baselineByType: Partial<Record<CatalogType, string>> = {
  medications: "/Comment & Materials/Medication List V1.xlsx",
  injections: "/Comment & Materials/GP Injection v1.xls",
  immunizations: "/Comment & Materials/GP Immunization v2.xls",
  investigations: "/Comment & Materials/GP Investigation.xls",
};

const headerByType: Partial<Record<CatalogType, string>> = {
  medications: "Medication Name",
  injections: "Full Description",
  immunizations: "Full Description",
};

const titleByType: Record<CatalogType, { title: string; subtitle: string }> = {
  medications: {
    title: "Medication Catalog",
    subtitle: "Manage medication dropdown items used by provider claims.",
  },
  injections: {
    title: "Injection Catalog",
    subtitle: "Manage injection dropdown items used by provider claims.",
  },
  immunizations: {
    title: "Immunization Catalog",
    subtitle: "Manage immunization dropdown items used by provider claims.",
  },
  investigations: {
    title: "Investigation Catalog",
    subtitle: "Manage investigation dropdown items (full + short label) used by provider claims.",
  },
  frequencies: {
    title: "Frequency Catalog",
    subtitle: "Manage frequency dropdown items used by provider claims.",
  },
  units: {
    title: "Units Catalog",
    subtitle: "Manage measurement/unit dropdown items used by provider claims.",
  },
};

const getShortName = (row: { data?: unknown }) => {
  const raw = row?.data;
  if (!raw || typeof raw !== "object") return "";
  const value = (raw as { shortName?: unknown }).shortName;
  return typeof value === "string" ? value : "";
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function CatalogPanel({ catalogType }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [investigationMeta, setInvestigationMeta] = useState<Record<string, { shortName: string }>>({});
  const [adminRole, setAdminRole] = useState<AdminRole>("accountant");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CatalogStatus | "All">("Active");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addShortName, setAddShortName] = useState("");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<Array<Record<string, string>>>([]);
  const [importRows, setImportRows] = useState<Array<Record<string, unknown>>>([]);

  const { title, subtitle } = titleByType[catalogType];
  const baselinePath = baselineByType[catalogType] || "";
  const isCatalogReadOnly = isAdminReadOnly(adminRole, "/admin/medications");

  const audit = async (action: string, metadata: Record<string, unknown>) => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const actorProfileId = data.session?.user.id || null;
    await supabase.from("admin_audit_logs").insert({
      action,
      metadata,
      actor_profile_id: actorProfileId,
      entity_type: "catalog_items",
      entity_id: catalogType,
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (catalogType === "investigations") {
        const rows = await fetchCatalogItemRows("investigations");
        setItems(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }))
        );
        setInvestigationMeta(Object.fromEntries(rows.map((r) => [r.id, { shortName: getShortName(r) }])));
      } else {
        const next = await fetchCatalogItems(catalogType);
        setItems(next);
        setInvestigationMeta({});
      }
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Unable to load catalog."));
      setItems([]);
      setInvestigationMeta({});
    } finally {
      setLoading(false);
    }
  }, [catalogType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchAdminSession().then((session) => setAdminRole(session?.role ?? "accountant"));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => (status === "All" ? true : item.status === status))
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search, status]);

  const closeImport = () => {
    setIsImportOpen(false);
    setImportFile(null);
    setImportError("");
    setImportPreview([]);
    setImportRows([]);
    setImportMode("merge");
  };

  const parseImport = async (file: File) => {
    setImportError("");
    setImportPreview([]);
    setImportRows([]);
    const workbook = await readExcel(file);

    if (catalogType === "investigations") {
      const result = parseInvestigations(workbook);
      if (result.errors.length) throw new Error(result.errors.join(" "));
      setImportRows(result.rows.map((r) => ({ name: r.name, shortName: r.shortName || "" })));
      setImportPreview(result.sample.map((r) => ({ Name: r.name, Short: r.shortName || "" })));
      return;
    }

    if (catalogType === "frequencies" || catalogType === "units") {
      const result = parseFrequencyAndUnits(workbook);
      const section = catalogType === "frequencies" ? result.frequencies : result.units;
      if (section.errors.length) throw new Error(section.errors.join(" "));
      setImportRows(section.rows);
      setImportPreview(section.sample.map((r) => ({ Name: r.name })));
      return;
    }

    const header = headerByType[catalogType] || "Full Description";
    const result = parseSingleColumnList(workbook, header);
    if (result.errors.length) throw new Error(result.errors.join(" "));
    setImportRows(result.rows);
    setImportPreview(result.sample.map((r) => ({ Name: r.name })));
  };

  const applyImport = async () => {
    if (isCatalogReadOnly) return;
    if (!importFile) return;
    setLoading(true);
    setError("");
    try {
      if (catalogType === "investigations") {
        const rows = importRows as Array<{ name: string; shortName?: string }>;
        const mapped = rows.map((r) => ({ name: r.name, data: { shortName: (r.shortName || "").trim() || undefined } }));
        if (importMode === "replace") {
          await replaceCatalogWithData("investigations", mapped);
          await audit("catalog_replace", { catalog_type: "investigations", file: importFile.name, count: mapped.length });
        } else {
          await mergeCatalogWithData("investigations", mapped);
          await audit("catalog_import", { catalog_type: "investigations", file: importFile.name, count: mapped.length, mode: "merge" });
        }
        closeImport();
        await load();
        return;
      }

      const names = (importRows as Array<{ name: string }>).map((r) => r.name);
      if (importMode === "replace") {
        await replaceCatalog(catalogType, names);
        await audit("catalog_replace", { catalog_type: catalogType, file: importFile.name, count: names.length });
      } else {
        await mergeCatalog(catalogType, names);
        await audit("catalog_import", { catalog_type: catalogType, file: importFile.name, count: names.length, mode: "merge" });
      }
      closeImport();
      await load();
    } catch (error: unknown) {
      setImportError(getErrorMessage(error, "Unable to import."));
    } finally {
      setLoading(false);
    }
  };

  const addManual = async () => {
    if (isCatalogReadOnly) return;
    const name = addName.trim();
    if (!name) return;
    setLoading(true);
    setError("");
    try {
      if (catalogType === "investigations") {
        await mergeCatalogWithData("investigations", [
          { name, data: { shortName: addShortName.trim() || undefined } },
        ]);
        await audit("catalog_add", { catalog_type: "investigations", name, shortName: addShortName.trim() || undefined });
      } else {
        await insertCatalogItem(catalogType, name);
        await audit("catalog_add", { catalog_type: catalogType, name });
      }
      setAddName("");
      setAddShortName("");
      setIsAddOpen(false);
      await load();
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Unable to add item."));
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (item: CatalogItem) => {
    if (isCatalogReadOnly) return;
    const next = item.status === "Active" ? "Inactive" : "Active";
    setLoading(true);
    setError("");
    try {
      await setCatalogItemStatus(item.id, next);
      await audit("catalog_toggle", { catalog_type: catalogType, id: item.id, name: item.name, status: next });
      await load();
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Unable to update status."));
    } finally {
      setLoading(false);
    }
  };

  const resetBaseline = async () => {
    if (isCatalogReadOnly) return;
    if (!baselinePath) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(baselinePath);
      if (!res.ok) throw new Error("Unable to load baseline file.");
      const blob = await res.blob();
      const file = new File([blob], baselinePath.split("/").pop() || "baseline.xls", { type: blob.type });
      await parseImport(file);
      setImportMode("replace");
      setImportFile(file);
      setIsImportOpen(true);
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Unable to reset baseline."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <p className="text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <GlassButton variant="secondary" className="gap-2" onClick={() => setIsAddOpen(true)} disabled={isCatalogReadOnly}>
            <Plus className="w-4 h-4" />
            Add
          </GlassButton>
          <GlassButton variant="secondary" className="gap-2" onClick={() => setIsImportOpen(true)} disabled={isCatalogReadOnly}>
            <Upload className="w-4 h-4" />
            Upload Excel
          </GlassButton>
          {!!baselinePath && (
            <GlassButton variant="secondary" className="gap-2" onClick={() => void resetBaseline()} disabled={isCatalogReadOnly}>
              <RefreshCcw className="w-4 h-4" />
              Reset Baseline
            </GlassButton>
          )}
        </div>
      </div>

      {error && (
        <GlassCard className="p-4 border-rose-200 bg-rose-50/60 text-sm text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </GlassCard>
      )}

      <GlassCard className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full glass-input pl-9 pr-4 py-2.5"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="glass-input px-4 py-2.5"
            value={status}
            onChange={(e) => setStatus(e.target.value as CatalogStatus | "All")}
          >
            <option value="All">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
              <tr>
                <th className="px-4 py-3 font-bold">Name</th>
                {catalogType === "investigations" && <th className="px-4 py-3 font-bold">Short</th>}
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-white/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                  {catalogType === "investigations" && (
                    <td className="px-4 py-3 text-slate-600">{investigationMeta[item.id]?.shortName || "-"}</td>
                  )}
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase border",
                        item.status === "Active"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                          : "bg-slate-50 text-slate-400 border-slate-100"
                      )}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                        onClick={() => void toggleStatus(item)}
                        disabled={isCatalogReadOnly || loading}
                      >
                        {item.status === "Active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={catalogType === "investigations" ? 4 : 3}>
                    {loading ? "Loading..." : "No items found."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {isAddOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsAddOpen(false)} />
          <GlassCard className="w-full max-w-xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative max-h-[calc(100vh-2rem)] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70">
              <h3 className="text-lg font-bold text-slate-800">Add Item</h3>
              <p className="text-sm text-slate-500">Create a new catalog item.</p>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <fieldset disabled={isCatalogReadOnly} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <input className="w-full glass-input px-4 py-2.5" value={addName} onChange={(e) => setAddName(e.target.value)} />
                </div>
                {catalogType === "investigations" && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700">Short Name</label>
                    <input className="w-full glass-input px-4 py-2.5" value={addShortName} onChange={(e) => setAddShortName(e.target.value)} />
                  </div>
                )}
              </fieldset>
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={() => setIsAddOpen(false)}>
                Cancel
              </GlassButton>
              <GlassButton disabled={isCatalogReadOnly || !addName.trim() || loading} onClick={() => void addManual()}>
                <Save className="w-4 h-4 mr-2" />
                Save
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}

      {isImportOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={closeImport} />
          <GlassCard className="w-full max-w-3xl p-0 overflow-hidden border border-slate-200 bg-white/95 relative max-h-[calc(100vh-2rem)] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200/70 bg-slate-50/70 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Upload Excel</h3>
                <p className="text-sm text-slate-500">Preview, then import into Supabase.</p>
              </div>
              <button className="p-2 rounded-lg hover:bg-slate-200/60 text-slate-600" onClick={closeImport}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <fieldset disabled={isCatalogReadOnly} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px] gap-3">
                <input
                  type="file"
                  className="w-full glass-input px-4 py-2.5"
                  accept=".xlsx,.xls"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImportFile(file);
                    try {
                      await parseImport(file);
                    } catch (error: unknown) {
                      setImportError(getErrorMessage(error, "Unable to parse file."));
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
                <select
                  className="glass-input px-4 py-2.5"
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as ImportMode)}
                >
                  <option value="merge">Merge</option>
                  <option value="replace">Replace</option>
                </select>
              </fieldset>

              {importError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm text-rose-700">
                  {importError}
                </div>
              )}

              {importPreview.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Preview</div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
                        <tr>
                          {Object.keys(importPreview[0]).map((k) => (
                            <th key={k} className="px-3 py-2 font-bold">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreview.map((row, idx) => (
                          <tr key={idx}>
                            {Object.keys(importPreview[0]).map((k) => (
                              <td key={k} className="px-3 py-2 text-slate-700">
                                {row[k] || ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
              <GlassButton variant="secondary" onClick={closeImport}>
                Cancel
              </GlassButton>
              <GlassButton
                disabled={isCatalogReadOnly || !importFile || importRows.length === 0 || !!importError || loading}
                onClick={() => void applyImport()}
              >
                <Save className="w-4 h-4 mr-2" />
                Import
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
