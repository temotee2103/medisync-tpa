"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertCircle, Lock, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { withBasePath } from "@/lib/basePath";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function MemberChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    const run = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.replace("/member/login");
          return;
        }
        const mustChangePassword = Boolean((data.session.user.user_metadata as any)?.must_change_password);
        if (!mustChangePassword) {
          router.replace("/member/dashboard");
        }
      } catch {
        router.replace("/member/login");
      }
    };
    run();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/member/login");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: formData.password,
        data: { must_change_password: false },
      });
      if (updateError) throw updateError;
      router.push("/member/dashboard");
    } catch (err: any) {
      setError(String(err?.message || "Failed to update password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <GlassCard className="w-full max-w-md flex flex-col items-center gap-6 px-8 py-10">
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-24 w-24">
            <Image src={withBasePath("/logo-1.png")} alt="Medisync Logo" fill className="object-contain" />
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-600">
            <ShieldCheck className="h-4 w-4" />
            Update Password
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="ml-1 text-sm font-medium text-slate-700">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Enter new password"
                className="glass-input w-full pl-10 pr-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500/50"
                required
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="ml-1 text-sm font-medium text-slate-700">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Confirm new password"
                className="glass-input w-full pl-10 pr-4 py-2.5 text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-500/50"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />
            </div>
          </div>

          <p className="text-center text-xs text-slate-500">
            First-time login requires a new password before portal access is granted.
          </p>

          <GlassButton type="submit" className="mt-2 w-full" isLoading={loading}>
            Save Password
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  );
}
