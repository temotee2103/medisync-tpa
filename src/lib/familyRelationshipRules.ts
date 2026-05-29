export type FamilyRelationship = "Spouse" | "Parent" | "Child";

export type FamilyGender = "Male" | "Female" | "";

export type FamilyDependentRecord = {
  relationship?: string | null;
  gender?: string | null;
};

const normalizeRelationship = (value?: string | null): FamilyRelationship | "" => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "spouse") return "Spouse";
  if (normalized === "parent") return "Parent";
  if (normalized === "child") return "Child";
  return "";
};

const normalizeGender = (value?: string | null): FamilyGender => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "male") return "Male";
  if (normalized === "female") return "Female";
  return "";
};

export function validateFamilyRelationshipCaps(input: {
  relationship: string;
  gender?: string | null;
  existingDependents: FamilyDependentRecord[];
  maxChildren: number;
}) {
  const relationship = normalizeRelationship(input.relationship);
  const gender = normalizeGender(input.gender);
  const dependents = input.existingDependents.map((dependent) => ({
    relationship: normalizeRelationship(dependent.relationship),
    gender: normalizeGender(dependent.gender),
  }));

  const spouseCount = dependents.filter((dependent) => dependent.relationship === "Spouse").length;
  const childCount = dependents.filter((dependent) => dependent.relationship === "Child").length;
  const parentMaleCount = dependents.filter(
    (dependent) => dependent.relationship === "Parent" && dependent.gender === "Male"
  ).length;
  const parentFemaleCount = dependents.filter(
    (dependent) => dependent.relationship === "Parent" && dependent.gender === "Female"
  ).length;

  if (relationship === "Spouse" && spouseCount >= 4) {
    return "You can add up to 4 spouse dependents.";
  }

  if (relationship === "Child" && childCount >= Math.max(0, Math.floor(input.maxChildren))) {
    return `You can add up to ${Math.max(0, Math.floor(input.maxChildren))} child dependents.`;
  }

  if (relationship === "Parent" && gender === "Male" && parentMaleCount >= 2) {
    return "You can add up to 2 male parents.";
  }

  if (relationship === "Parent" && gender === "Female" && parentFemaleCount >= 2) {
    return "You can add up to 2 female parents.";
  }

  return "";
}
