import { cn } from "@/lib/utils";

export function GlassLabel({
  className,
  children,
  htmlFor,
}: {
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-xs font-medium text-slate-500 ml-1", className)}
    >
      {children}
    </label>
  );
}
