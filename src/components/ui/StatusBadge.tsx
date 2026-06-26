import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: string;
  /** Predefined color scheme */
  scheme?: "success" | "warning" | "danger" | "neutral" | "info";
  className?: string;
};

const schemeStyles: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-rose-100 text-rose-700 border-rose-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
};

export function StatusBadge({ status, scheme = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
        schemeStyles[scheme] ?? schemeStyles.neutral,
        className,
      )}
    >
      {status}
    </span>
  );
}
