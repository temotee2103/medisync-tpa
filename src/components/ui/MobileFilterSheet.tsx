"use client";

import React, { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";

type MobileFilterSheetProps = {
  title?: string;
  description?: string;
  triggerLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function MobileFilterSheet({
  title = "Filters",
  description,
  triggerLabel = "Filters",
  children,
  footer,
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <GlassButton
        variant="ghost"
        className={`h-10 px-4 inline-flex items-center gap-2 lg:hidden ${open ? "text-sky-700 bg-sky-50" : "text-slate-700"}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {triggerLabel}
      </GlassButton>

      {open && (
        <GlassCard className="mt-3 rounded-2xl p-0 overflow-hidden border border-white/50 bg-white/90 shadow-lg lg:hidden">
          <div className="px-4 py-4 border-b border-white/50 bg-slate-50/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">{title}</h3>
                {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">{children}</div>

          <div className="px-4 py-3 border-t border-white/50 bg-slate-50/80 flex justify-end gap-3">
            {footer ?? <GlassButton variant="secondary" onClick={() => setOpen(false)}>Done</GlassButton>}
          </div>
        </GlassCard>
      )}
    </>
  );
}
