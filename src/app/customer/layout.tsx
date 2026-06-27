"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Building2, 
  LogOut, 
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/basePath";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isCustomerPortalActive = false;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  if (!isCustomerPortalActive) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-lg w-full p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-800">Corporate Portal is not active</h1>
          <p className="text-sm text-slate-600">
            This portal is currently kept as a stub only. Please use the Member, Provider, or Admin portals.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Link href="/">
              <GlassButton>Go to Home</GlassButton>
            </Link>
            <Link href="/member/login">
              <GlassButton variant="secondary">Member Login</GlassButton>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  const navItems = [
    { name: "Dashboard", href: "/customer/dashboard", icon: LayoutDashboard },
    { name: "Employees", href: "/customer/members", icon: Users },
    { name: "Claims Overview", href: "/customer/claims", icon: FileText },
    { name: "Company Profile", href: "/customer/profile", icon: Building2 },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden md:flex w-72 flex-col fixed inset-y-0 left-0 bg-white/40 backdrop-blur-xl border-r border-white/50 z-50">
        <div className="h-16 flex items-center px-6 border-b border-white/30">
          <div className="relative w-48 h-12">
            <Image src={withBasePath("/logo-2.png")} alt="Logo" fill className="object-contain" />
          </div>
        </div>
        
        <div className="px-6 py-4">
          <div className="bg-sky-500/10 border border-sky-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center text-white text-sm font-bold">
              TC
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">Tech Corp Sdn Bhd</p>
              <p className="text-[10px] text-sky-600 font-bold uppercase tracking-wider">Corporate Account</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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

        <div className="p-4 border-t border-white/30">
          <Link href="/customer/login">
            <button className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors">
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </Link>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 h-16 bg-white/60 backdrop-blur-lg border-b border-white/50 z-40 flex items-center justify-between px-4">
        <div className="relative w-28 h-8">
           <Image src={withBasePath("/logo-2.png")} alt="Logo" fill className="object-contain" />
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
          <Link href="/customer/login" className="flex items-center gap-3 px-4 py-3 text-red-600">
              <LogOut className="w-5 h-5" />
              Sign Out
            </Link>
          </nav>
        </div>
      )}

      <main className="flex-1 md:pl-72 p-4 md:p-8 pt-20 md:pt-8">
        {children}
      </main>
    </div>
  );
}
