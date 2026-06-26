import { cn } from "@/lib/utils";
import React from "react";
import { Loader2 } from "lucide-react";

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "xs" | "sm" | "default" | "icon";
  isLoading?: boolean;
}

export function GlassButton({ 
  className, 
  variant = "primary", 
  size = "default",
  isLoading, 
  children, 
  disabled,
  ...props 
}: GlassButtonProps) {
  
  const variants = {
    primary: "bg-sky-500 hover:bg-sky-600 text-white shadow-lg shadow-sky-500/30 border-transparent",
    secondary: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 border-transparent",
    ghost: "bg-transparent hover:bg-white/20 text-sky-800 border-transparent",
    danger: "bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/30 border-transparent",
  };
  const sizes = {
    xs: "px-2.5 py-1.5 text-xs",
    sm: "px-3 py-1.5 text-sm",
    default: "px-6 py-3",
    icon: "h-10 w-10 p-0",
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
