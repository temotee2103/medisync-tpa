import * as XLSX from "xlsx";
import type { Company } from "@/lib/companyStore";

const baseHeaders = [
  "staffId",
  "type",
  "parentStaffId",
  "relationship",
  "fullName",
  "gender",
  "idType",
  "nricPassport",
  "nationality",
  "dob",
  "email",
  "phoneCountryCode",
  "phone",
  "passportExpiry",
  "passportFileName",
  "status",
  "tempPassword",
  "planName",
  "planType",
  "lumpSumLimit",
] as const;

export function buildMemberImportHeaders(company: Company, includePlanColumns = true) {
  const categoryKeys = Object.keys(company.planConfig.categories);
  const categoryHeaders = includePlanColumns ? categoryKeys.flatMap((key) => [`cat_${key}_enabled`, `cat_${key}_limit`]) : [];
  const planHeaders = includePlanColumns ? baseHeaders : baseHeaders.filter(h => !["planType", "lumpSumLimit"].includes(h));
  return [...planHeaders, ...categoryHeaders];
}

const downloadBlob = (filename: string, blob: Blob) => {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export function downloadMemberImportTemplate(company: Company, includePlanColumns = true) {
  if (typeof window === "undefined") return;
  const headers = buildMemberImportHeaders(company, includePlanColumns);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Members");

  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(`member-import-${company.companyId}.xlsx`, blob);
}
