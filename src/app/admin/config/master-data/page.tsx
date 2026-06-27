"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ArrowLeft, Pill, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchAdminSession, type AdminRole } from "@/lib/adminSession";
import { isAdminReadOnly } from "@/lib/adminPermissions";

const items = [
  {
    title: "Catalogs",
    description: "Medications, injections, immunizations, diagnosis, frequency, units",
    href: "/admin/medications",
    icon: Pill,
  },
  {
    title: "Service Type Rules",
    description: "Enable/disable sections per service type",
    href: "/admin/config/master-data/service-types",
    icon: Settings2,
  },
] as const;

export default function MasterDataPage() {
  const [adminRole, setAdminRole] = useState<AdminRole>("accountant");
  const isMasterDataReadOnly = isAdminReadOnly(adminRole, "/admin/config/master-data");

  useEffect(() => {
    void fetchAdminSession().then((session) => setAdminRole(session?.role ?? "accountant"));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/admin/config">
          <GlassButton variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </GlassButton>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Master Data</h1>
          <p className="text-sm text-slate-500">Manage global catalogs used by provider claim entry.</p>
        </div>
      </div>

      {isMasterDataReadOnly && (
        <GlassCard className="p-4 border-amber-200 bg-amber-50/60 text-sm text-amber-700">
          Accountant 在 Master Data 页面为只读模式，可进入目录查看内容，但不能执行修改操作。
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="block">
            <GlassCard className="p-6 hover:bg-white/60 transition-all border-white/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{item.title}</h2>
                  <p className="text-sm text-slate-500 mt-1">{item.description}</p>
                </div>
                <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                  <item.icon className="w-5 h-5" />
                </div>
              </div>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
