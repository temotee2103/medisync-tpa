"use client";

import { cn } from "@/lib/utils";
import { GlassButton } from "@/components/ui/GlassButton";
import type { CatalogType } from "@/lib/catalog/types";

const tabs: Array<{ key: CatalogType; label: string }> = [
  { key: "medications", label: "Medications" },
  { key: "injections", label: "Injections" },
  { key: "immunizations", label: "Immunizations" },
  { key: "diagnosis", label: "Diagnosis" },
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
        <GlassButton
          key={t.key}
          size="sm"
          onClick={() => onChange(t.key)}
          className={cn(
            value === t.key
              ? "bg-sky-600 text-white border-sky-600 shadow-lg shadow-sky-500/30"
              : "bg-white/60 text-slate-700 border-white/70 hover:bg-white/80 shadow-none",
          )}
        >
          {t.label}
        </GlassButton>
      ))}
    </div>
  );
}
