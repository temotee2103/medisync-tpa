"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  FilePlus, 
  History, 
  Shield, 
  LogOut, 
  Menu,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { withBasePath } from "@/lib/basePath";
import { resetSharedClientState } from "@/lib/clientStateReset";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureMemberSeed, getMemberSession } from "@/lib/memberSession";

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [memberName, setMemberName] = useState("Member");
  const [memberAuthState, setMemberAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const pathname = usePathname();
  const router = useRouter();
  const normalizedPath = (pathname || "").replace(/\/+$/, "");
  const isAuthRoute = normalizedPath.endsWith("/member/login");
  const isPasswordChangeRoute = normalizedPath.endsWith("/member/change-password");

  useEffect(() => {
    if (isAuthRoute || isPasswordChangeRoute) {
      setMemberAuthState("authenticated");
      return;
    }

    setMemberAuthState("loading");
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    const redirectToLogin = (nextMemberName = "Member") => {
      resetSharedClientState();
      if (!cancelled) {
        setMemberName(nextMemberName);
        setMemberAuthState("unauthenticated");
        router.replace("/member/login");
      }
    };

    const syncMemberAppSession = async (profileId?: string) => {
      if (!profileId) {
        redirectToLogin();
        return;
      }

      try {
        await ensureMemberSeed(true);
        const session = getMemberSession();
        if (!session) {
          redirectToLogin();
          return;
        }

        if (!cancelled) {
          setMemberName(session.fullName || "Member");
          setMemberAuthState("authenticated");
        }
      } catch {
        redirectToLogin();
      }
    };

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await syncMemberAppSession(data.session?.user.id);
      } catch {
        redirectToLogin();
      }
    };

    run();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncMemberAppSession(session?.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isAuthRoute, isPasswordChangeRoute, router]);

  if (isAuthRoute || isPasswordChangeRoute) {
    return <>{children}</>;
  }

  if (memberAuthState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm text-slate-600 shadow-sm">
          Loading member session...
        </div>
      </div>
    );
  }

  if (memberAuthState === "unauthenticated") {
    return null;
  }

  const parts = memberName.split(" ").filter(Boolean);
  const initials = parts.length === 0 ? "MB" : parts.map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  const navItems = [
    { name: "My Dashboard", href: "/member/dashboard", icon: LayoutDashboard },
    { name: "Submit Claim", href: "/member/claims", icon: FilePlus },
    { name: "My History", href: "/member/history", icon: History },
    { name: "My Policy", href: "/member/policy", icon: Shield },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 flex-col fixed inset-y-0 left-0 bg-white/40 backdrop-blur-xl border-r border-white/50 z-50">
        <div className="h-16 flex items-center px-6 border-b border-white/30">
          <div className="relative w-48 h-12">
            <Image src={withBasePath("/logo-2.png")} alt="Logo" fill sizes="192px" className="object-contain" />
          </div>
        </div>
        
        <div className="px-6 py-4">
          <div className="bg-sky-500/10 border border-sky-100 rounded-xl p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center text-white text-sm font-bold">
              {initials}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{memberName}</p>
              <p className="text-[10px] text-sky-600 font-bold uppercase tracking-wider">Member</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
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
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            onClick={async () => {
              try {
                resetSharedClientState();
                await fetch(withBasePath("/api/auth/logout"), { method: "POST" });
                createSupabaseBrowserClient().auth.signOut();
              } finally {
                router.replace("/member/login");
              }
            }}
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 h-16 bg-white/60 backdrop-blur-lg border-b border-white/50 z-40 flex items-center justify-between px-4">
        <div className="relative w-28 h-8">
           <Image src={withBasePath("/logo-2.png")} alt="Logo" fill sizes="112px" className="object-contain" />
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
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-sky-50"
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <main className="flex-1 md:pl-64 pt-16 md:pt-0">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
