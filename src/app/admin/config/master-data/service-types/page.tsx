"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { cn } from "@/lib/utils";
import {
  ensureServiceTypeRulesSeed,
  saveServiceTypeRules,
  subscribeServiceTypeRules,
  getServiceTypeRulesServerSnapshot,
  getServiceTypeRulesSnapshot,
  type CatalogSection,
  type ServiceTypeRule,
} from "@/lib/catalog/serviceTypeRules";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAdminSession, type AdminRole } from "@/lib/adminSession";
import { isAdminReadOnly } from "@/lib/adminPermissions";

const sections: Array<{ key: CatalogSection; label: string }> = [
  { key: "consultation", label: "Consultation" },
  { key: "medication", label: "Medication" },
  { key: "injection", label: "Injection" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "procedure", label: "Procedure" },
  { key: "immunization", label: "Immunization" },
];

const toAudit = async (action: string, metadata: Record<string, unknown>) => {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const actorProfileId = data.session?.user.id || null;
  await supabase.from("admin_audit_logs").insert({
    action,
    metadata,
    actor_profile_id: actorProfileId,
    entity_type: "service_type_rules",
    entity_id: "service_type_rules",
  });
};

export default function ServiceTypeRulesPage() {
  ensureServiceTypeRulesSeed();
  const [adminRole, setAdminRole] = useState<AdminRole>("accountant");

  const rules = useSyncExternalStore(
    subscribeServiceTypeRules,
    getServiceTypeRulesSnapshot,
    getServiceTypeRulesServerSnapshot
  );

  const [draft, setDraft] = useState<ServiceTypeRule[]>(rules);
  const isServiceTypeReadOnly = isAdminReadOnly(adminRole, "/admin/config/master-data/service-types");

  useEffect(() => {
    void fetchAdminSession().then((session) => setAdminRole(session?.role ?? "accountant"));
  }, []);

  const toggle = (serviceType: string, section: CatalogSection) => {
    if (isServiceTypeReadOnly) return;
    setDraft((prev) =>
      (prev.length > 0 ? prev : rules).map((rule) => {
        if (rule.serviceType !== serviceType) return rule;
        const has = rule.allowedSections.includes(section);
        const next = has ? rule.allowedSections.filter((s) => s !== section) : [...rule.allowedSections, section];
        return { ...rule, allowedSections: next };
      })
    );
  };

  const save = () => {
    if (isServiceTypeReadOnly) return;
    saveServiceTypeRules(draft.length > 0 ? draft : rules);
    void toAudit("service_type_rules_update", { updated: true });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/admin/config/master-data">
            <GlassButton variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </GlassButton>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Service Type Rules</h1>
            <p className="text-sm text-slate-500">Enable or disable claim breakdown sections per service type.</p>
          </div>
        </div>
        <GlassButton className="gap-2" onClick={save} disabled={isServiceTypeReadOnly}>
          <Save className="w-4 h-4" />
          Save Changes
        </GlassButton>
      </div>

      {isServiceTypeReadOnly && (
        <GlassCard className="p-4 border-amber-200 bg-amber-50/60 text-sm text-amber-700">
          Accountant 在 Service Type Rules 页面为只读模式，可查看规则矩阵，但不能切换开关或保存。
        </GlassCard>
      )}

      <GlassCard className="p-4 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
            <tr>
              <th className="px-4 py-3 font-bold">Service Type</th>
              {sections.map((s) => (
                <th key={s.key} className="px-4 py-3 font-bold">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(draft.length > 0 ? draft : rules).map((rule) => (
              <tr key={rule.serviceType} className="hover:bg-white/50 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800">{rule.serviceType}</td>
                {sections.map((s) => {
                  const enabled = rule.allowedSections.includes(s.key);
                  return (
                    <td key={s.key} className="px-4 py-3">
                      <GlassButton
                        size="xs"
                        variant={enabled ? "secondary" : "ghost"}
                        className={enabled ? "" : "text-slate-500 border-slate-200"}
                        onClick={() => toggle(rule.serviceType, s.key)}
                        disabled={isServiceTypeReadOnly}
                      >
                        {enabled ? "ON" : "OFF"}
                      </GlassButton>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
