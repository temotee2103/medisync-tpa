import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type MobileRecordCardProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function MobileRecordCard({
  title,
  subtitle,
  badge,
  meta,
  children,
  footer,
  className,
}: MobileRecordCardProps) {
  return (
    <GlassCard className={cn("rounded-2xl p-4 space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-base font-bold text-slate-800 truncate">{title}</div>
          {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {meta && (
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          {meta}
        </div>
      )}

      {children && (
        <div className="grid grid-cols-1 gap-3">
          {children}
        </div>
      )}

      {footer && (
        <div className="pt-2 border-t border-white/40">
          {footer}
        </div>
      )}
    </GlassCard>
  );
}
