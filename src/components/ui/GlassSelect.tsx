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
  disabled?: boolean;
};

export function GlassSelect({
  value,
  options,
  onChange,
  placeholder = "Select option",
  className,
  disabled,
}: GlassSelectProps) {
  return (
    <select
      className={cn(
        "w-full glass-input px-4 py-2.5 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
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
