import type { Company } from "@/lib/companyStore";
import { validateFamilyRelationshipCaps } from "@/lib/familyRelationshipRules";
import type {
  ImportGender,
  ImportIdType,
  ImportPlanType,
  ImportRelationship,
  ImportRow,
  ImportRowResult,
  ImportStatus,
} from "@/lib/memberImport/types";

const isNonEmpty = (value: string) => !!(value || "").trim();

const allowedGenders: ImportGender[] = ["Male", "Female"];
const allowedIdTypes: ImportIdType[] = ["NRIC", "Passport"];
const allowedStatuses: ImportStatus[] = ["Active", "Disabled"];
const allowedPlanTypes: ImportPlanType[] = ["category", "lump_sum"];
const allowedDependentRelationships: Array<Exclude<ImportRelationship, "Employee">> = ["Spouse", "Child", "Parent"];

export function validateImportRows(company: Company, rows: ImportRow[]): ImportRowResult[] {
  const seen = new Set<string>();
  const companyCategoryKeys = Object.keys(company.planConfig.categories);
  const dependentsByParent = new Map<string, Array<{ relationship?: string; gender?: string }>>();

  return rows.map((row) => {
    const errors: string[] = [];

    const staffIdKey = row.staffId.trim().toLowerCase();
    if (!isNonEmpty(row.staffId)) errors.push("staffId is required.");
    if (staffIdKey && seen.has(staffIdKey)) errors.push("Duplicate staffId in file.");
    if (staffIdKey) seen.add(staffIdKey);

    if (!isNonEmpty(row.fullName)) errors.push("fullName is required.");
    if (!allowedGenders.includes(row.gender)) errors.push("gender must be Male/Female.");
    if (!allowedIdTypes.includes(row.idType)) errors.push("idType must be NRIC/Passport.");
    if (!isNonEmpty(row.nricPassport)) errors.push("nricPassport is required.");
    if (!allowedStatuses.includes(row.status)) errors.push("status must be Active/Disabled.");

    if (row.idType === "Passport") {
      if (!isNonEmpty(row.passportExpiry)) errors.push("passportExpiry is required for Passport.");
      if (!isNonEmpty(row.nationality)) errors.push("nationality is required for Passport.");
      if (row.type === "primary" && !isNonEmpty(row.passportFileName))
        errors.push("passportFileName is required for primary Passport.");
    }

    if (row.type === "primary") {
      if (!isNonEmpty(row.email)) errors.push("email is required for primary.");
      if (!isNonEmpty(row.tempPassword)) errors.push("tempPassword is required for primary.");
      if (!isNonEmpty(row.phoneCountryCode)) errors.push("phoneCountryCode is required for primary.");
      if (!isNonEmpty(row.phone)) errors.push("phone is required for primary.");
      if (!isNonEmpty(row.dob)) errors.push("dob is required for primary.");
    } else {
      if (!isNonEmpty(row.parentStaffId)) errors.push("parentStaffId is required for dependent.");
      if (!allowedDependentRelationships.includes(row.relationship))
        errors.push("relationship must be Spouse/Child/Parent.");
      if (errors.length === 0) {
        const parentKey = String(row.parentStaffId || "").trim().toLowerCase();
        const existingDependents = dependentsByParent.get(parentKey) || [];
        const relationshipError = validateFamilyRelationshipCaps({
          relationship: row.relationship,
          gender: row.gender,
          existingDependents,
          maxChildren: company.planConfig.dependents.maxChildren,
        });
        if (relationshipError) {
          errors.push(relationshipError);
        } else {
          dependentsByParent.set(parentKey, [
            ...existingDependents,
            { relationship: row.relationship, gender: row.gender },
          ]);
        }
      }
    }

    if (!allowedPlanTypes.includes(row.planType)) errors.push("planType must be category/lump_sum.");
    if (row.planType === "lump_sum") {
      const value = Number(row.lumpSumLimit);
      if (!Number.isFinite(value) || value <= 0) errors.push("lumpSumLimit must be > 0 for lump_sum.");
    }
    if (row.planType === "category") {
      const enabledKeys = companyCategoryKeys.filter((key) => (row.categoryEnabled[key] || "N").toUpperCase() === "Y");
      if (enabledKeys.length === 0) errors.push("At least one category must be enabled for category planType.");
      for (const key of enabledKeys) {
        const limit = Number(row.categoryLimits[key]);
        if (!Number.isFinite(limit) || limit < 0) errors.push(`cat_${key}_limit must be a number >= 0.`);
      }
    }

    if (errors.length > 0) return { rowNumber: row.rowNumber, status: "error", errors };
    return { rowNumber: row.rowNumber, status: "ok", row, action: "create" };
  });
}
