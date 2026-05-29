"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      let supabase;
      try {
        supabase = createSupabaseBrowserClient();
      } catch {
        router.replace("/admin/login");
        return;
      }
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? "/admin/dashboard" : "/admin/login");
    };
    void run();
  }, [router]);

  return null;
}
