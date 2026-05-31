import { cn } from "@/lib/utils";
import { GlassLabel } from "@/components/ui/GlassLabel";

export function GlassField({
  label,
  htmlFor,
  className,
  children,
  hint,
  error,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <GlassLabel htmlFor={htmlFor}>{label}</GlassLabel>
      {children}
      {error ? (
        <p className="text-xs text-rose-500 font-medium ml-1 animate-in slide-in-from-top-1">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500 ml-1">{hint}</p>
      ) : null}
    </div>
  );
}
