"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { 
  Hospital, 
  Shield, 
  Settings, 
  Database, 
  Lock, 
  ChevronRight,
  Stethoscope,
  FileText
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadText } from "@/lib/download";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAdminSession, type AdminRole } from "@/lib/adminSession";
import { isAdminReadOnly } from "@/lib/adminPermissions";
import {
  loadEmergencyReleaseLimits,
  normalizeEmergencyReleaseLimits,
  saveEmergencyReleaseLimits,
  type EmergencyReleaseLimit,
} from "@/lib/emergencyReleaseLimits";

export default function SystemConfigPage() {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [adminRoleResolved, setAdminRoleResolved] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<Array<{ action: string; created_at: string; metadata: unknown }>>([]);
  const [auditError, setAuditError] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [emergencyLimits, setEmergencyLimits] = useState<EmergencyReleaseLimit[]>([]);
  const [emergencyLimitsError, setEmergencyLimitsError] = useState("");
  const [emergencyLimitsLoading, setEmergencyLimitsLoading] = useState(true);
  const [emergencyLimitsSaving, setEmergencyLimitsSaving] = useState(false);
  const auditLogs = useMemo(
    () =>
      auditRows.map((r) => ({
        action: r.action,
        createdAt: r.created_at,
        metadata: r.metadata,
      })),
    [auditRows]
  );

  useEffect(() => {
    if (!isAuditOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        setAuditLoading(true);
        setAuditError("");
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("admin_audit_logs")
          .select("action,created_at,metadata")
          .order("created_at", { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) throw error;
        setAuditRows((data || []) as Array<{ action: string; created_at: string; metadata: unknown }>);
      } catch (error: unknown) {
        if (cancelled) return;
        setAuditError(error instanceof Error ? error.message : "Unable to load audit logs.");
        setAuditRows([]);
      } finally {
        if (!cancelled) setAuditLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuditOpen]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchAdminSession();
        if (!cancelled) setAdminRole(session?.role ?? "accountant");
      } catch {
        if (!cancelled) setAdminRole("accountant");
      } finally {
        if (!cancelled) setAdminRoleResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setEmergencyLimitsLoading(true);
        setEmergencyLimitsError("");
        const limits = await loadEmergencyReleaseLimits();
        if (!cancelled) setEmergencyLimits(limits);
      } catch (error) {
        if (!cancelled) {
          setEmergencyLimits([]);
          setEmergencyLimitsError(error instanceof Error ? error.message : "Unable to load emergency release limits.");
        }
      } finally {
        if (!cancelled) setEmergencyLimitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const isConfigAccessPending = !adminRoleResolved;
  const isConfigReadOnly = adminRoleResolved ? isAdminReadOnly(adminRole ?? "accountant", "/admin/config") : false;
  const disableConfigEditing = isConfigAccessPending || isConfigReadOnly;
  const settingsCategories = [
    { 
      title: "Master Data", 
      items: [
        { name: "Master Data Catalogs", desc: "Injections, diagnosis, frequency, units", icon: Database },
        { name: "Hospital Network", desc: "Manage partner medical facilities", icon: Hospital },
        { name: "Procedure Catalog", desc: "Standard rates and ICD codes", icon: Stethoscope },
        { name: "Policy Templates", desc: "Define coverage rules and limits", icon: Shield },
      ]
    },
    { 
      title: "System Parameters", 
      items: [
        { name: "Currency & Localization", desc: "Current setting: RM (MYR)", icon: Database },
        { name: "Approval Thresholds", desc: "Automated adjudication limits", icon: FileText },
        { name: "Security & Permissions", desc: "Role definitions and audit logs", icon: Lock },
      ]
    }
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">System Configuration</h1>
        <p className="text-sm text-slate-500">Manage master data and global system settings.</p>
      </div>

      {isConfigAccessPending && (
        <GlassCard className="p-4 border-sky-200 bg-sky-50/60 text-sm text-sky-700">
          正在验证当前管理员权限，配置项将在权限确认后开放。
        </GlassCard>
      )}

      {adminRoleResolved && isConfigReadOnly && (
        <GlassCard className="p-4 border-amber-200 bg-amber-50/60 text-sm text-amber-700">
          Accountant 在 System Config 页面为只读模式，可浏览配置入口与审计记录，但不能修改下游配置。
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {settingsCategories.map((category) => (
          <div key={category.title} className="space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">{category.title}</h2>
            <div className="space-y-3">
              {category.items.map((item) => (
                <Link
                  key={item.name}
                  href={
                    item.name === "Procedure Catalog"
                      ? "/admin/config/categories"
                      : item.name === "Master Data Catalogs"
                        ? "/admin/config/master-data"
                        : "#"
                  }
                  className="w-full text-left group block"
                >
                  <GlassCard className="flex items-center justify-between p-4 hover:bg-white/60 transition-all border-white/40">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 group-hover:text-sky-600 transition-colors">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-all" />
                  </GlassCard>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <GlassCard className="p-6 space-y-2">
        <h3 className="text-base font-bold text-slate-800">Configuration Setup Checklist</h3>
        <ul className="text-sm text-slate-600 space-y-1 list-disc pl-5">
          <li>Set category limits in Procedure Catalog.</li>
          <li>Configure emergency release thresholds per claim category.</li>
          <li>Define role access under User Management.</li>
          <li>Verify compliance rules and approval thresholds before go-live.</li>
        </ul>
      </GlassCard>

      <GlassCard className="p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Emergency Release Limits</h3>
            <p className="text-sm text-slate-500">
              Claims moving into review are blocked when category amount exceeds this configured limit.
            </p>
          </div>
          <GlassButton
            variant="secondary"
            disabled={disableConfigEditing}
            onClick={() => setEmergencyLimits((prev) => [...prev, { category: "", amount: 0 }])}
          >
            {isConfigAccessPending ? "Checking Access..." : "Add Limit"}
          </GlassButton>
        </div>
        {emergencyLimitsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {emergencyLimitsError}
          </div>
        )}
        {emergencyLimitsLoading ? (
          <div className="text-sm text-slate-500">Loading emergency release limits...</div>
        ) : (
          <div className="space-y-3">
            {emergencyLimits.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                No emergency release limits configured yet.
              </div>
            )}
            {emergencyLimits.map((limit, index) => (
              <div key={`${limit.category}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3">
                <input
                  className="glass-input px-4 py-2.5"
                  placeholder="Claim category, e.g. GP"
                  value={limit.category}
                  disabled={disableConfigEditing}
                  onChange={(event) =>
                    setEmergencyLimits((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, category: event.target.value } : row
                      )
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="glass-input px-4 py-2.5"
                  placeholder="RM limit"
                  value={Number.isFinite(limit.amount) ? limit.amount : 0}
                  disabled={disableConfigEditing}
                  onChange={(event) =>
                    setEmergencyLimits((prev) =>
                      prev.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, amount: Number(event.target.value || 0) } : row
                      )
                    )
                  }
                />
                <GlassButton
                  variant="ghost"
                  disabled={disableConfigEditing}
                  onClick={() => setEmergencyLimits((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                >
                  Remove
                </GlassButton>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <GlassButton
            disabled={disableConfigEditing || emergencyLimitsSaving || emergencyLimitsLoading}
            onClick={async () => {
              try {
                setEmergencyLimitsSaving(true);
                setEmergencyLimitsError("");
                const normalized = normalizeEmergencyReleaseLimits(emergencyLimits);
                if (normalized.length !== emergencyLimits.filter((limit) => String(limit.category || "").trim()).length) {
                  setEmergencyLimitsError("Each emergency release limit must have a unique category and a valid non-negative amount.");
                  return;
                }
                const savedLimits = await saveEmergencyReleaseLimits(normalized);
                setEmergencyLimits(savedLimits);
              } catch (error) {
                setEmergencyLimitsError(
                  error instanceof Error ? error.message : "Unable to save emergency release limits."
                );
              } finally {
                setEmergencyLimitsSaving(false);
              }
            }}
          >
            {isConfigAccessPending ? "Checking Access..." : emergencyLimitsSaving ? "Saving..." : "Save Emergency Limits"}
          </GlassButton>
        </div>
      </GlassCard>

      <GlassCard className="bg-sky-500/5 border-sky-100 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4 text-center md:text-left">
          <div className="w-12 h-12 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Settings className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h3 className="font-bold text-sky-900 text-lg">System Audit Log</h3>
            <p className="text-sm text-sky-700">View all administrative changes and system events.</p>
          </div>
        </div>
        <GlassButton variant="secondary" className="whitespace-nowrap" onClick={() => setIsAuditOpen(true)}>
          Open Audit Console
        </GlassButton>
      </GlassCard>

      {isAuditOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-200/70 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsAuditOpen(false)} />
          <GlassCard className="w-full max-w-3xl p-6 space-y-6 relative">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800">System Audit Log</h3>
                <p className="text-sm text-slate-500">Recent administrative actions and events.</p>
              </div>
              <GlassButton
                variant="secondary"
                onClick={() =>
                  downloadText(
                    "audit-log.json",
                    JSON.stringify(
                      auditLogs.map((l) => ({ action: l.action, createdAt: l.createdAt, metadata: l.metadata })),
                      null,
                      2
                    )
                  )
                }
              >
                Export Log
              </GlassButton>
            </div>
            <div className="space-y-3">
              {auditError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {auditError}
                </div>
              )}
              {auditLogs.length === 0 && (
                <div className="text-sm text-slate-500">No audit logs yet.</div>
              )}
              {auditLoading && <div className="text-sm text-slate-500">Loading...</div>}
              {auditLogs.map((entry, index) => (
                <div key={`${entry.action}-${index}`} className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-white/80">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{entry.action}</p>
                    <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
