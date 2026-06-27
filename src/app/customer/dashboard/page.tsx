"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { 
  Users, 
  FileText, 
  TrendingUp, 
  AlertCircle,
  ArrowRight,
  Download
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchClaimRows, normalizeClaimStatus, type ClaimRow } from "@/lib/claimsStore";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";

export default function CustomerDashboard() {
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

  const monthKey = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthClaims = useMemo(
    () =>
      rows.filter((row) => {
        const dateRaw = row.submitted_at || row.created_at || row.visit_date;
        return dateRaw.slice(0, 7) === monthKey;
      }),
    [monthKey, rows]
  );
  const claimsThisMonthTotal = useMemo(() => {
    return monthClaims.reduce((sum, row) => {
      const amountRaw = typeof row.amount === "string" ? Number(row.amount) : typeof row.amount === "number" ? row.amount : 0;
      return sum + (Number.isFinite(amountRaw) ? amountRaw : 0);
    }, 0);
  }, [monthClaims]);
  const pendingActions = useMemo(() => {
    return rows.filter((row) => {
      const status = normalizeClaimStatus(row.status || undefined);
      return status === "In review" || status === "In progress";
    }).length;
  }, [rows]);

  const stats = useMemo(
    () => [
      { label: "Total Employees", value: "142", icon: Users, color: "text-blue-500", bg: "bg-blue-100" },
      { label: "Active Policies", value: "140", icon: FileText, color: "text-emerald-500", bg: "bg-emerald-100" },
      { label: "Claims (This Month)", value: formatCurrency(claimsThisMonthTotal), icon: TrendingUp, color: "text-sky-500", bg: "bg-sky-100" },
      { label: "Pending Actions", value: pendingActions.toString(), icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-100" },
    ],
    [claimsThisMonthTotal, pendingActions]
  );

  const recentClaims = useMemo(() => {
    return rows
      .slice()
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 3)
      .map((row) => {
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
      });
  }, [rows]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Company Overview</h1>
          <p className="text-sm text-slate-500">Welcome back, Tech Corp HR Admin.</p>
        </div>
        <GlassButton className="gap-2">
          <Download className="w-4 h-4" />
          Download Monthly Report
        </GlassButton>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <GlassCard key={stat.label} className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <Icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Claims Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Recent Employee Claims</h2>
            <Link href="/customer/claims" className="text-sm text-sky-600 font-medium hover:underline">
              View All
            </Link>
          </div>
          
          <div className="space-y-3">
            {loadError && (
              <GlassCard className="p-4 text-sm text-rose-700 border-rose-200 bg-rose-50/70">
                {loadError}
              </GlassCard>
            )}
            {!loading && !loadError && recentClaims.length === 0 && (
              <GlassCard className="p-6 text-center text-sm text-slate-500">
                No claims available.
              </GlassCard>
            )}
            {recentClaims.map((claim) => (
              <GlassCard key={claim.id} className="flex items-center justify-between p-4 hover:bg-white/40 transition-colors group cursor-pointer">
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
                    <p className="text-sm text-slate-500">{claim.type} • {claim.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-slate-800">{claim.amount}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      claim.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : 
                      claim.status === 'In progress' ? 'bg-sky-100 text-sky-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {claim.status}
                    </span>
                  </div>
                  <GlassButton variant="secondary" size="icon" className="h-8 w-8 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4" />
                  </GlassButton>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Quick Actions / Notifications */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-800">Quick Actions</h2>
          <GlassCard className="space-y-3">
            <Link href="/customer/members">
              <GlassButton variant="ghost" className="w-full justify-start gap-3 hover:bg-sky-50 text-slate-600">
                <Users className="w-4 h-4 text-sky-500" />
                Manage Employees
              </GlassButton>
            </Link>
            <Link href="/customer/profile">
              <GlassButton variant="ghost" className="w-full justify-start gap-3 hover:bg-sky-50 text-slate-600">
                <FileText className="w-4 h-4 text-sky-500" />
                Update Company Profile
              </GlassButton>
            </Link>
          </GlassCard>

          <GlassCard className="bg-gradient-to-br from-sky-500 to-blue-600 text-white border-none">
            <h3 className="font-bold mb-2">Need Support?</h3>
            <p className="text-sm opacity-90 mb-4">Contact your dedicated account manager for assistance with claims or policies.</p>
            <GlassButton className="w-full bg-white/20 hover:bg-white/30 text-white border-white/20">
              Contact Support
            </GlassButton>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
