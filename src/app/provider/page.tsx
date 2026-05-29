"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getProviderSession } from "@/lib/providerSession";

export default function ProviderIndexPage() {
  const router = useRouter();

  useEffect(() => {
    const session = getProviderSession();
    router.replace(session ? "/provider/dashboard" : "/provider/login");
  }, [router]);

  return null;
}

