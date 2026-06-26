"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  FileText, 
  Users,
  Settings,
  LogOut, 
  Menu,
  X,
  Lock as LockIcon,
  Briefcase,
  Building2,
  Stethoscope,
  Pill,
  CreditCard
} from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/basePath";
import { canAccessAdminRoute } from "@/lib/adminPermissions";
import { fetchAdminSession } from "@/lib/adminSession";
import type { AdminRole } from "@/lib/adminSession";
import { resetSharedClientState } from "@/lib/clientStateReset";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ToastContainer } from "@/components/ui/Toast";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [adminName, setAdminName] = useState("System Admin");
  const [adminRole, setAdminRole] = useState<AdminRole>("accountant");
  const pathname = usePathname();
  const router = useRouter();
  const normalizedPath = (pathname ?? "").replace(/\/+$/, "");
  const isAuthRoute = normalizedPath.endsWith("/admin/login");
  const isPasswordChangeRoute = normalizedPath.endsWith("/admin/change-password");

  useEffect(() => {
    if (!pathname) return;
    if (isAuthRoute) return;
    const run = async () => {
      let supabase;
      try {
        supabase = createSupabaseBrowserClient();
      } catch {
        resetSharedClientState();
        router.replace("/admin/login");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        resetSharedClientState();
        router.replace("/admin/login");
        return;
      }

      const adminSession = await fetchAdminSession();
      if (!adminSession) {
        resetSharedClientState();
        router.replace("/admin/login");
        return;
      }

      const role = adminSession.role;

      setAdminName(adminSession.fullName || "System Admin");
      setAdminRole(role);

      if (!canAccessAdminRoute(role, normalizedPath)) {
        router.replace("/admin/dashboard");
      }
    };

    run();
  }, [isAuthRoute, normalizedPath, router]);

  if (isAuthRoute || isPasswordChangeRoute) {
    return <>{children}</>;
  }

  const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Claim Management", href: "/admin/claims", icon: FileText },
    { name: "Accountant", href: "/admin/accountant", icon: CreditCard },
    { name: "Medications", href: "/admin/medications", icon: Pill },
    { name: "User Management", href: "/admin/users", icon: Users },
    { name: "Corporate Management", href: "/admin/companies", icon: Building2 },
    { name: "Vendor Management", href: "/admin/vendors", icon: Stethoscope },
    { name: "Reports & Analytics", href: "/admin/reports", icon: FileText },
    { name: "System Config", href: "/admin/config", icon: Settings },
  ].filter((item) => canAccessAdminRoute(adminRole, item.href));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden md:flex w-64 flex-col sticky top-0 h-screen bg-white/40 backdrop-blur-xl border-r border-white/50 z-50">
        <div className="h-16 flex items-center px-6 border-b border-white/30">
          <div className="relative w-48 h-12">
            <Image
              src={withBasePath("/logo-2.png")}
              alt="Logo"
              fill
              sizes="192px"
              className="object-contain"
            />
          </div>
        </div>
        
        <div className="px-6 py-4">
          <div className="bg-sky-500/10 border border-sky-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center text-white">
              <Briefcase className="w-5 h-5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{adminName}</p>
              <p className="text-[10px] text-sky-600 font-bold uppercase tracking-wider">Internal Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Use startsWith for active state to handle sub-routes, but exact match for dashboard to avoid partial match if needed
            // Actually dashboard is /admin/dashboard, so startsWith is fine if other routes are distinct.
            const isActive = (pathname ?? "").startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20" 
                    : "text-slate-600 hover:bg-white/50 hover:text-sky-600"
                )}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/30 space-y-2">
          <Link
            href="/admin/change-password"
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-slate-600 hover:bg-white/50 hover:text-sky-600 rounded-xl transition-colors"
          >
            <LockIcon className="w-5 h-5" />
            Change Password
          </Link>
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            onClick={async () => {
              try {
                resetSharedClientState();
                await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
                createSupabaseBrowserClient().auth.signOut();
              } finally {
                router.replace("/admin/login");
              }
            }}
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden sticky top-0 h-16 bg-white/60 backdrop-blur-lg border-b border-white/50 z-40 flex items-center justify-between px-4">
          <div className="relative w-28 h-8">
             <Image
               src={withBasePath("/logo-2.png")}
               alt="Logo"
               fill
               sizes="112px"
               className="object-contain"
             />
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
          </button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-16 bg-white z-30 p-4">
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50"
                  >
                    <Icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
              <Link
                href="/admin/change-password"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:bg-slate-50"
              >
                <LockIcon className="w-5 h-5" />
                Change Password
              </Link>
              <button
                className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl"
                onClick={async () => {
                  try {
                    resetSharedClientState();
                    await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
                    createSupabaseBrowserClient().auth.signOut();
                  } finally {
                    router.replace("/admin/login");
                  }
                }}
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>
          </div>
        )}

        <main className="flex-1 p-4 md:p-8">
          {children}
        </main>
        <ToastContainer />
      </div>
    </div>
  );
}
