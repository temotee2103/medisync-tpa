"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { ShieldCheck, Lock, User, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { withBasePath } from "@/lib/basePath";
import { fetchAdminSession } from "@/lib/adminSession";
import { resetSharedClientState } from "@/lib/clientStateReset";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LoginPayload = {
  ok?: boolean;
  error?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
  } | null;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ username: "", password: "" });

  useEffect(() => {
    if (error) return;
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "unauthenticated") setError("Session expired. Please sign in again.");
    else if (reason === "access_denied") setError("Access denied. Admin only.");
    else if (reason === "role_error") setError("Unable to verify access. Please sign in again.");
  }, [error]);

  useEffect(() => {
    let cancelled = false;
    try {
      const supabase = createSupabaseBrowserClient();
      supabase.auth.getSession().then(async ({ data }) => {
        if (!data.session) return;
        const adminSession = await fetchAdminSession().catch(() => null);
        if (!cancelled && adminSession) router.replace("/admin/dashboard");
      });
    } catch {
      return;
    }
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      resetSharedClientState();
      const response = await fetch(withBasePath("/api/auth/admin/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: formData.username.trim(), password: formData.password }),
      });

      const payload = (await response.json()) as LoginPayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Login failed.");
      }

      if (payload.session?.access_token && payload.session.refresh_token) {
        const supabase = createSupabaseBrowserClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        });
        if (sessionError) throw sessionError;
      }

      router.push("/admin/dashboard");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Missing environment variable")) {
        setError("Supabase environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      } else {
        setError(message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <GlassCard className="w-full max-w-md flex flex-col items-center gap-6 py-10 px-8">
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-24 h-24">
             <Image 
              src={withBasePath("/logo-1.png")}  
              alt="Medisync Logo" 
              fill 
              sizes="96px"
              loading="eager"
              className="object-contain" 
            />
          </div>
          <div className="flex items-center gap-2 text-sky-600 bg-sky-50 px-3 py-1 rounded-full text-sm font-medium mt-2">
            <ShieldCheck className="w-4 h-4" />
            Management Console
          </div>
        </div>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 ml-1">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
              <input 
                type="text" 
                placeholder="Enter Username" 
                className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50 text-slate-800 placeholder:text-slate-400"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
              <input 
                type="password" 
                placeholder="••••••••" 
                className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50 text-slate-800 placeholder:text-slate-400"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="flex justify-end">
              <a href={withBasePath("/forgot-password")} className="text-xs text-sky-600 font-medium hover:underline">
                Forgot Password?
              </a>
            </div>
          </div>

          <GlassButton type="submit" className="w-full mt-2" isLoading={loading}>
            Sign In
          </GlassButton>
        </form>

        <p className="text-xs text-slate-500 text-center">
          Restricted access. Internal use only.
        </p>
      </GlassCard>
    </div>
  );
}
