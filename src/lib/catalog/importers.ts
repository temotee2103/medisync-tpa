import * as XLSX from "xlsx";
import type { InvestigationCatalogItem } from "@/lib/catalog/types";

const normalizeCell = (value: unknown) => (value == null ? "" : String(value)).trim();
const normalizeKey = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export type ImportMode = "merge" | "replace";

export type ImportResult<T> = {
  rows: T[];
  totalRows: number;
  sample: T[];
  errors: string[];
};

export async function readExcel(file: File) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

export function getFirstSheet(workbook: XLSX.WorkBook) {
  const name = workbook.SheetNames[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!name || !sheet) throw new Error("Excel file has no sheets.");
  return { name, sheet };
}

export function parseSingleColumnList(workbook: XLSX.WorkBook, headerName: string) {
  const { sheet } = getFirstSheet(workbook);
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const errors: string[] = [];
  const rows: Array<{ name: string }> = [];

  for (const row of json) {
    const name = normalizeCell(row[headerName]);
    if (!name) continue;
    rows.push({ name });
  }

  if (rows.length === 0) errors.push(`No rows found for column "${headerName}".`);

  const dedup = new Map<string, { name: string }>();
  for (const r of rows) {
    const k = normalizeKey(r.name);
    if (!k) continue;
    if (!dedup.has(k)) dedup.set(k, r);
  }

  const out = Array.from(dedup.values());
  return {
    rows: out,
    totalRows: json.length,
    sample: out.slice(0, 20),
    errors,
  } satisfies ImportResult<{ name: string }>;
}

export function parseInvestigations(workbook: XLSX.WorkBook) {
  const { sheet } = getFirstSheet(workbook);
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const errors: string[] = [];
  const rows: Array<Pick<InvestigationCatalogItem, "name" | "shortName">> = [];

  for (const row of json) {
    const name = normalizeCell(row["Full Description"]);
    const shortName = normalizeCell(row["Short Description"]);
    if (!name) continue;
    rows.push({ name, shortName: shortName || undefined });
  }

  if (rows.length === 0) errors.push(`No rows found for "Full Description" / "Short Description".`);

  const dedup = new Map<string, Pick<InvestigationCatalogItem, "name" | "shortName">>();
  for (const r of rows) {
    const k = normalizeKey(r.name);
    if (!k) continue;
    if (!dedup.has(k)) dedup.set(k, r);
  }

  const out = Array.from(dedup.values());
  return {
    rows: out,
    totalRows: json.length,
    sample: out.slice(0, 20),
    errors,
  } satisfies ImportResult<Pick<InvestigationCatalogItem, "name" | "shortName">>;
}

export function parseFrequencyAndUnits(workbook: XLSX.WorkBook) {
  const { sheet } = getFirstSheet(workbook);
  const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  const lines = arr
    .map((row) => normalizeCell(row?.[0]))
    .map((v) => v.trim())
    .filter(Boolean);

  let mode: "none" | "freq" | "unit" = "none";
  const freq: string[] = [];
  const units: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "FREQUENCY LIST") {
      mode = "freq";
      continue;
    }
    if (upper === "MEASUREMENT LIST") {
      mode = "unit";
      continue;
    }
    if (mode === "freq") freq.push(line);
    if (mode === "unit") units.push(line);
  }

  const dedup = (items: string[]) => {
    const m = new Map<string, string>();
    for (const item of items) {
      const k = normalizeKey(item);
      if (!k) continue;
      if (!m.has(k)) m.set(k, item.trim());
    }
    return Array.from(m.values());
  };

  const outFreq = dedup(freq).map((name) => ({ name }));
  const outUnits = dedup(units).map((name) => ({ name }));
  const errors: string[] = [];
  if (outFreq.length === 0) errors.push("No frequency rows found (expected a FREQUENCY LIST section).");
  if (outUnits.length === 0) errors.push("No measurement rows found (expected a MEASUREMENT LIST section).");

  return {
    frequencies: {
      rows: outFreq,
      totalRows: lines.length,
      sample: outFreq.slice(0, 20),
      errors,
    } satisfies ImportResult<{ name: string }>,
    units: {
      rows: outUnits,
      totalRows: lines.length,
      sample: outUnits.slice(0, 20),
      errors,
    } satisfies ImportResult<{ name: string }>,
  };
}

