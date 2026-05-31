import { cn } from "@/lib/utils";

export function GlassInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full glass-input px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/50",
        className
      )}
    />
  );
}
