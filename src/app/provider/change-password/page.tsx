"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Building2, Lock } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { withBasePath } from "@/lib/basePath";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { showToast, ToastContainer } from "@/components/ui/Toast";

export default function ProviderChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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
          router.replace("/provider/login");
          return;
        }
      } catch {
        router.replace("/provider/login");
      }
    };
    run();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password.length < 8) {
      showToast("Password must be at least 8 characters.", "error");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/provider/login");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: formData.password,
        data: { must_change_password: false },
      });
      if (updateError) throw updateError;
      router.push("/provider/dashboard");
    } catch (err: any) {
      showToast(String(err?.message || "Failed to update password."), "error");
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
            <Building2 className="h-4 w-4" />
            Update Temporary Password
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
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
            This temporary password must be replaced before entering the provider portal.
          </p>

          <GlassButton type="submit" className="mt-2 w-full" isLoading={loading}>
            Save Password
          </GlassButton>
        </form>
      </GlassCard>
      <ToastContainer />
    </div>
  );
}
