export type ImportGender = "Male" | "Female";
export type ImportIdType = "NRIC" | "Passport";
export type ImportStatus = "Active" | "Disabled";
export type ImportRelationship = "Employee" | "Spouse" | "Child" | "Parent";

export type ImportPlanType = "category" | "lump_sum";

export type ImportRowBase = {
  rowNumber: number;
  staffId: string;
  fullName: string;
  gender: ImportGender;
  idType: ImportIdType;
  nricPassport: string;
  nationality: string;
  status: ImportStatus;
  phoneCountryCode: string;
  phone: string;
  dob: string;
  passportExpiry: string;
  passportFileName: string;
  planType: ImportPlanType;
  lumpSumLimit: string;
  categoryEnabled: Record<string, "Y" | "N">;
  categoryLimits: Record<string, string>;
};

export type ImportPrimaryRow = ImportRowBase & {
  type: "primary";
  email: string;
  tempPassword: string;
};

export type ImportDependentRow = ImportRowBase & {
  type: "dependent";
  parentStaffId: string;
  relationship: Exclude<ImportRelationship, "Employee">;
};

export type ImportRow = ImportPrimaryRow | ImportDependentRow;

export type ImportRowResult =
  | { rowNumber: number; status: "ok"; row: ImportRow; action: "create" | "update" }
  | { rowNumber: number; status: "error"; errors: string[] };
