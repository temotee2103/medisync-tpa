"use client";

import React, { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

let toastId = 0;
const listeners = new Set<(toasts: ToastItem[]) => void>();
let currentToasts: ToastItem[] = [];

function notify() {
  listeners.forEach((l) => l([...currentToasts]));
}

export function showToast(message: string, variant: ToastVariant = "info") {
  const id = ++toastId;
  currentToasts = [...currentToasts, { id, message, variant }];
  notify();
  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notify();
  }, 4000);
}

const iconMap: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-emerald-500" />,
  error: <XCircle className="h-5 w-5 text-rose-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  info: <Info className="h-5 w-5 text-sky-500" />,
};

const borderMap: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50/90",
  error: "border-rose-200 bg-rose-50/90",
  warning: "border-amber-200 bg-amber-50/90",
  info: "border-sky-200 bg-sky-50/90",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (updated: ToastItem[]) => setToasts(updated);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    notify();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md animate-in slide-in-from-right-4 fade-in duration-200",
            borderMap[t.variant],
          )}
        >
          <span className="mt-0.5 shrink-0">{iconMap[t.variant]}</span>
          <p className="text-sm font-medium text-slate-700 flex-1">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded-full p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
