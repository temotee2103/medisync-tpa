"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type GlassSelectOption = {
  label: string;
  value: string;
};

type GlassSelectProps = {
  value: string;
  options: GlassSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function GlassSelect({
  value,
  options,
  onChange,
  placeholder = "Select option",
  className,
}: GlassSelectProps) {
  return (
    <select
      className={cn("w-full glass-input px-4 py-2", className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
