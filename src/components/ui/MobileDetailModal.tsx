"use client";

import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";

type MobileDetailModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
};

export function MobileDetailModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  contentClassName,
}: MobileDetailModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-200/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <GlassCard
        className={`relative w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl p-0 overflow-hidden border border-slate-200 bg-white/95 shadow-2xl max-h-[92vh] flex flex-col ${contentClassName ?? ""}`}
      >
        <div className="px-5 py-4 border-b border-slate-200/70 bg-slate-50/80">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="overflow-y-auto p-5">{children}</div>

        <div className="px-5 py-4 border-t border-slate-200/70 bg-slate-50 flex justify-end gap-3">
          {footer ?? <GlassButton variant="secondary" onClick={onClose}>Close</GlassButton>}
        </div>
      </GlassCard>
    </div>
  );
}
