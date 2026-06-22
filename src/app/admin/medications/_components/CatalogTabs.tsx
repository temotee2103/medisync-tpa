"use client";

import { cn } from "@/lib/utils";
import type { CatalogType } from "@/lib/catalog/types";

const tabs: Array<{ key: CatalogType; label: string }> = [
  { key: "medications", label: "Medications" },
  { key: "injections", label: "Injections" },
  { key: "immunizations", label: "Immunizations" },
  { key: "investigations", label: "Investigations" },
  { key: "diagnoses", label: "Diagnosis" },
  { key: "frequencies", label: "Frequency" },
  { key: "units", label: "Units" },
];

type Props = {
  value: CatalogType;
  onChange: (value: CatalogType) => void;
};

export default function CatalogTabs({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-bold border transition-colors",
            value === t.key
              ? "bg-sky-600 text-white border-sky-600"
              : "bg-white/60 text-slate-700 border-white/70 hover:bg-white/80"
          )}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

