"use client";

import { useState } from "react";
import type { CatalogType } from "@/lib/catalog/types";
import CatalogTabs from "./_components/CatalogTabs";
import CatalogPanel from "./_components/CatalogPanel";

export default function AdminMedicationsPage() {
  const [tab, setTab] = useState<CatalogType>("medications");
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Catalog Management</h1>
        <p className="text-slate-500">Manage dropdown items used across claims and provider entry.</p>
      </div>
      <CatalogTabs value={tab} onChange={setTab} />
      <CatalogPanel catalogType={tab} />
    </div>
  );
}
