export type CatalogStatus = "Active" | "Inactive";

export type CatalogType =
  | "medications"
  | "injections"
  | "immunizations"
  | "investigations"
  | "diagnoses"
  | "frequencies"
  | "units";

export type CatalogItem = {
  id: string;
  name: string;
  status: CatalogStatus;
  createdAt: string;
  updatedAt: string;
};

export type InvestigationCatalogItem = CatalogItem & {
  shortName?: string;
};

