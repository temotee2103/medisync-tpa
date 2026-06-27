"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { Search, Filter, Download, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchClaimRows, normalizeClaimStatus, type ClaimRow } from "@/lib/claimsStore";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";

export default function CustomerClaimsPage() {
  const [rows, setRows] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setLoadError("");
        const data = await fetchClaimRows();
        if (cancelled) return;
        setRows(data);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load claims.");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const claims = useMemo(
    () =>
      rows.map((row) => {
        const employee = row.dependents?.full_name || row.members?.full_name || "—";
        const type = row.service_type || row.category_code || "—";
        const amountRaw = typeof row.amount === "string" ? Number(row.amount) : typeof row.amount === "number" ? row.amount : 0;
        const dateRaw = row.submitted_at || row.created_at || row.visit_date;
        return {
          id: row.claim_number || `CLM-${row.id.slice(0, 8).toUpperCase()}`,
          employee,
          type,
          amount: formatCurrency(amountRaw),
          status: normalizeClaimStatus(row.status || undefined),
          date: formatDateDisplay(dateRaw) || dateRaw,
        };
      }),
    [rows]
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Claims Overview</h1>
          <p className="text-sm text-slate-500">Track and analyze employee claims.</p>
        </div>
        <GlassButton className="gap-2">
          <Download className="w-4 h-4" />
          Export Report
        </GlassButton>
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search claims by ID, employee or type..." 
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
            />
          </div>
          <GlassButton variant="secondary" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter Status
          </GlassButton>
        </div>

        <div className="space-y-3">
          {loadError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {loadError}
            </div>
          )}
          {!loading && !loadError && claims.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white/50 px-4 py-8 text-center text-sm text-slate-500">
              No claims available.
            </div>
          )}
          {claims.map((claim) => (
            <div
              key={claim.id}
              className="flex items-center justify-between p-4 bg-white/40 rounded-xl border border-white/60 hover:bg-white/60 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                  {claim.employee
                    .split(" ")
                    .filter(Boolean)
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{claim.employee}</p>
                  <p className="text-sm text-slate-500">
                    {claim.type} • {claim.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="font-bold text-slate-800">{claim.amount}</p>
                  <p className="text-xs text-slate-500">{claim.date}</p>
                </div>
                <div className="min-w-[100px] text-right">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${
                      claim.status === "Approved"
                        ? "bg-emerald-100 text-emerald-600"
                        : claim.status === "In progress"
                          ? "bg-sky-100 text-sky-600"
                          : claim.status === "In review"
                            ? "bg-amber-100 text-amber-600"
                            : "bg-red-100 text-red-600"
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>
                <GlassButton variant="secondary" size="icon" className="h-8 w-8 p-0 rounded-full">
                  <ArrowRight className="w-4 h-4" />
                </GlassButton>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
