import * as XLSX from "xlsx";
import type {
  ImportDependentRow,
  ImportGender,
  ImportIdType,
  ImportPlanType,
  ImportPrimaryRow,
  ImportRelationship,
  ImportRow,
  ImportStatus,
} from "@/lib/memberImport/types";
import type { Company } from "@/lib/companyStore";
import { buildMemberImportHeaders } from "@/lib/memberImport/template";

const normalizeCell = (value: unknown) => (value == null ? "" : String(value)).trim();

async function readExcel(file: File) {
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array" });
}

function getFirstSheet(workbook: XLSX.WorkBook) {
  const name = workbook.SheetNames[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!name || !sheet) return null;
  return { name, sheet };
}

export async function parseMemberImportWorkbook(file: File, company: Company): Promise<ImportRow[]> {
  const wb = await readExcel(file);
  const first = getFirstSheet(wb);
  if (!first) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(first.sheet, { defval: "" });
  const expectedHeaders = buildMemberImportHeaders(company);

  return rows.map((raw, index) => {
    const rowNumber = index + 2;
    const typeRaw = normalizeCell(raw.type).toLowerCase();

    const categoryEnabled: Record<string, "Y" | "N"> = {};
    const categoryLimits: Record<string, string> = {};

    for (const header of expectedHeaders) {
      if (!header.startsWith("cat_")) continue;
      const value = normalizeCell(raw[header]);
      const parts = header.split("_");
      const categoryKey = parts[1] || "";
      const suffix = parts.slice(2).join("_");

      if (suffix === "enabled") categoryEnabled[categoryKey] = value.toUpperCase() === "Y" ? "Y" : "N";
      if (suffix === "limit") categoryLimits[categoryKey] = value;
    }

    const base = {
      rowNumber,
      staffId: normalizeCell(raw.staffId),
      fullName: normalizeCell(raw.fullName),
      gender: normalizeCell(raw.gender) as ImportGender,
      idType: normalizeCell(raw.idType) as ImportIdType,
      nricPassport: normalizeCell(raw.nricPassport),
      nationality: normalizeCell(raw.nationality),
      status: normalizeCell(raw.status) as ImportStatus,
      phoneCountryCode: normalizeCell(raw.phoneCountryCode),
      phone: normalizeCell(raw.phone),
      dob: normalizeCell(raw.dob),
      passportExpiry: normalizeCell(raw.passportExpiry),
      passportFileName: normalizeCell(raw.passportFileName),
      planType: normalizeCell(raw.planType) as ImportPlanType,
      lumpSumLimit: normalizeCell(raw.lumpSumLimit),
      categoryEnabled,
      categoryLimits,
    };

    if (typeRaw === "dependent") {
      return {
        ...base,
        type: "dependent",
        parentStaffId: normalizeCell(raw.parentStaffId),
        relationship: normalizeCell(raw.relationship) as Exclude<ImportRelationship, "Employee">,
      } satisfies ImportDependentRow;
    }

    return {
      ...base,
      type: "primary",
      email: normalizeCell(raw.email),
      tempPassword: normalizeCell(raw.tempPassword),
    } satisfies ImportPrimaryRow;
  });
}
