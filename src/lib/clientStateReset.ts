import { resetClaimsStore } from "@/lib/claimsStore";
import { resetCompaniesStore } from "@/lib/companyStore";
import { resetEntitlementsStore } from "@/lib/entitlementStore";
import { resetMemberClientState } from "@/lib/memberSession";
import { resetPanelVisitTransactionsStore } from "@/lib/panelVisitStore";
import { resetProviderClaimsStore } from "@/lib/providerClaimsStore";
import { resetProviderClientState } from "@/lib/providerSession";

export const resetSharedClientState = () => {
  if (typeof window === "undefined") return;

  resetMemberClientState();
  resetProviderClientState();
  resetClaimsStore();
  resetProviderClaimsStore();
  resetCompaniesStore();
  resetPanelVisitTransactionsStore();
  resetEntitlementsStore();
};
